import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { ChannelRouter, normalizeConfig } from './routing.js';

const MANAGEMENT_PREFIX = '/api/cockpit-relay';
const LOG_LIMIT = 500;

function asString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function safeLogError(error) {
  return safeError(error)
    .replace(/https?:\/\/\S+/gi, '[url redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|key|token)[-_][A-Za-z0-9._-]{8,}\b/gi, '[secret redacted]');
}

function asCredentialRef(value) {
  const ref = asString(value);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(ref)) throw new Error('credential reference must be a POSIX identifier');
  return ref;
}

function routeModel(route, model) {
  return asString(route.modelAliases[model], model);
}

function routeEndpoint(route, endpoint) {
  return `${route.baseURL}${endpoint === 'responses' ? '/responses' : '/chat/completions'}`;
}

async function readJsonRequest(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024) throw Object.assign(new Error('request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function sendJson(res, status, value, cors = false) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...(cors ? {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type, x-session-id',
      'access-control-allow-methods': 'GET, POST, OPTIONS'
    } : {})
  });
  res.end(body);
}

function modelsResponse(config) {
  const models = new Map();
  for (const route of config.routes) {
    for (const id of route.models) models.set(id, { id, object: 'model', created: 0, owned_by: route.displayName });
  }
  return { object: 'list', data: [...models.values()] };
}

function persistConfig(filename, config) {
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function publicRoute(route, credential) {
  const { headers: _headers, ...safeRoute } = route;
  return {
    ...safeRoute,
    keyConfigured: credential?.configured === true,
    keySource: credential?.source,
    keyWritable: credential?.writable !== false
  };
}

function routeInput(raw, existing) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const id = asString(value.id, existing?.id);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) throw new Error('route id must use letters, numbers, _ or -');
  const baseURL = asString(value.baseURL, existing?.baseURL).replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseURL)) throw new Error('baseURL must start with http:// or https://');
  const apiKeyEnv = asString(value.apiKeyEnv, existing?.apiKeyEnv || `COCKPIT_RELAY_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_KEY`);
  asCredentialRef(apiKeyEnv);
  const models = Array.isArray(value.models) ? value.models.map((item) => asString(item)).filter(Boolean) : existing?.models ?? [];
  return {
    id,
    displayName: asString(value.displayName, existing?.displayName || id),
    baseURL,
    api: value.api === 'openai-responses' ? 'openai-responses' : 'openai-completions',
    apiKeyEnv,
    priority: Number.isFinite(Number(value.priority)) ? Number(value.priority) : existing?.priority ?? 0,
    backup: value.backup === true,
    models: [...new Set(models)],
    modelAliases: value.modelAliases && typeof value.modelAliases === 'object' ? { ...value.modelAliases } : existing?.modelAliases ?? {},
    headers: value.headers && typeof value.headers === 'object' ? { ...value.headers } : existing?.headers ?? {}
  };
}

class RelayRuntime {
  constructor(ctx, initial, filename) {
    this.ctx = ctx;
    this.filename = filename;
    this.config = initial;
    this.logs = [];
    this.server = undefined;
    this.actualPort = undefined;
    this.startError = undefined;
    this.startNotice = undefined;
    this.router = new ChannelRouter(this.config, (route, model, request) => this.transport(route, model, request), (entry) => this.recordAttempt(entry));
  }

  async secret(name) {
    return (await this.ctx.credentials.resolve(asCredentialRef(name)))?.value ?? '';
  }

  async transport(route, model, request) {
    const key = await this.secret(route.apiKeyEnv);
    const body = { ...(request?.body ?? {}), model: routeModel(route, model) };
    const headers = { 'content-type': 'application/json', 'user-agent': 'dsh-cockpit-relay/0.2.2', ...route.headers };
    if (key) headers.authorization = `Bearer ${key}`;
    return fetch(routeEndpoint(route, request?.endpoint), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request?.signal
    });
  }

  recordAttempt(entry) {
    this.logs.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      time: new Date().toISOString(),
      routeId: entry.route.id,
      routeName: entry.route.displayName,
      model: entry.model,
      ok: entry.ok,
      status: entry.status,
      latencyMs: entry.latencyMs,
      error: entry.ok ? undefined : safeLogError(entry.error).slice(0, 300)
    });
    if (this.logs.length > LOG_LIMIT) this.logs.length = LOG_LIMIT;
  }

  async clientAuthorized(req) {
    const expected = await this.secret(this.config.listen.apiKeyEnv);
    if (!expected) return this.config.listen.host === '127.0.0.1' && !req.headers.origin;
    return asString(req.headers.authorization).replace(/^Bearer\s+/i, '') === expected;
  }

  async handleRelay(req, res) {
    if (req.method === 'OPTIONS') return sendJson(res, 204, {}, true);
    if (!(await this.clientAuthorized(req))) return sendJson(res, 401, { error: { message: 'invalid local relay key', type: 'auth_error' } }, true);
    const pathname = new URL(req.url ?? '/', 'http://relay.local').pathname;
    if (req.method === 'GET' && pathname === '/health') return sendJson(res, 200, { ok: true, provider: this.config.provider, routes: this.config.routes.length }, true);
    if (req.method === 'GET' && pathname === '/v1/models') return sendJson(res, 200, modelsResponse(this.config), true);
    if (req.method !== 'POST' || !['/v1/chat/completions', '/v1/responses'].includes(pathname)) return sendJson(res, 404, { error: { message: 'endpoint not found', type: 'not_found' } }, true);
    let body;
    try { body = await readJsonRequest(req); }
    catch (error) { return sendJson(res, error?.status ?? 400, { error: { message: safeError(error), type: 'invalid_request_error' } }, true); }
    const model = asString(body.model);
    if (!model) return sendJson(res, 400, { error: { message: 'model is required', type: 'invalid_request_error' } }, true);
    const endpoint = pathname === '/v1/responses' ? 'responses' : 'chat';
    const sessionId = asString(req.headers['x-session-id'] ?? body.session_id ?? body.user);
    try {
      const { result: upstream } = await this.router.execute(model, { body, endpoint }, sessionId || undefined);
      res.writeHead(upstream.status, {
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'content-type': upstream.headers.get('content-type') ?? 'application/json'
      });
      if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
      res.end();
    } catch (error) {
      sendJson(res, Number(error?.status) || 502, { error: { message: safeError(error), type: 'upstream_error' } }, true);
    }
  }

  async start() {
    if (!this.config.listen.enabled || this.server) return;
    if (this.config.listen.host === '0.0.0.0' && !(await this.secret(this.config.listen.apiKeyEnv))) {
      this.startError = `LAN mode requires ${this.config.listen.apiKeyEnv} to be configured`;
      return;
    }
    this.startError = undefined;
    this.startNotice = undefined;
    const requestedPort = this.config.listen.port;
    for (let offset = 0; offset < 50; offset += 1) {
      const candidatePort = requestedPort === 0 ? 0 : requestedPort + offset;
      if (candidatePort > 65535) break;
      const server = createServer((req, res) => {
        this.handleRelay(req, res).catch((error) => {
          if (!res.headersSent) sendJson(res, 500, { error: { message: safeError(error), type: 'relay_error' } }, true);
          else res.destroy();
        });
      });
      const error = await new Promise((done) => {
        const onStartError = (reason) => done(reason);
        server.once('error', onStartError);
        server.listen(candidatePort, this.config.listen.host, () => {
          server.off('error', onStartError);
          done(undefined);
        });
      });
      if (error?.code === 'EADDRINUSE') continue;
      if (error) {
        this.startError = safeError(error);
        break;
      }
      this.server = server;
      this.actualPort = Number(server.address()?.port) || candidatePort;
      if (this.actualPort !== requestedPort && requestedPort !== 0) this.startNotice = `Port ${requestedPort} is already in use; Cockpit Relay started on ${this.actualPort} without stopping the existing service.`;
      server.on('error', (reason) => { this.startError = safeError(reason); });
      return;
    }
    if (!this.startError) this.startError = `No free port found from ${requestedPort} to ${Math.min(65535, requestedPort + 49)}`;
  }

  async stop() {
    const server = this.server;
    this.server = undefined;
    this.actualPort = undefined;
    if (!server) return;
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }

  async reconcile() {
    this.router.config = this.config;
    persistConfig(this.filename, this.config);
    if (!this.config.listen.enabled) await this.stop();
    else {
      await this.stop();
      await this.start();
    }
  }

  async state() {
    const routes = [];
    for (const route of this.config.routes) routes.push(publicRoute(route, await this.ctx.credentials.describe(asCredentialRef(route.apiKeyEnv))));
    const clientKey = await this.ctx.credentials.describe(asCredentialRef(this.config.listen.apiKeyEnv));
    return {
      service: {
        enabled: this.config.listen.enabled,
        running: Boolean(this.server?.listening),
        host: this.config.listen.host,
        port: this.config.listen.port,
        actualPort: this.actualPort ?? this.config.listen.port,
        apiKeyEnv: this.config.listen.apiKeyEnv,
        keyConfigured: clientKey.configured,
        startError: this.startError,
        startNotice: this.startNotice,
        baseURL: `http://${this.config.listen.host === '0.0.0.0' ? '127.0.0.1' : this.config.listen.host}:${this.actualPort ?? this.config.listen.port}/v1`
      },
      routing: { maxAttempts: this.config.maxAttempts, cooldownMs: this.config.cooldownMs, sessionAffinity: this.config.sessionAffinity },
      routes,
      logCount: this.logs.length
    };
  }

  async saveService(input) {
    const listen = input && typeof input === 'object' ? input : {};
    const apiKeyEnv = asString(listen.apiKeyEnv, this.config.listen.apiKeyEnv);
    asCredentialRef(apiKeyEnv);
    this.config.listen = {
      enabled: listen.enabled !== false,
      host: listen.host === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
      port: Number.isInteger(Number(listen.port)) && Number(listen.port) > 0 && Number(listen.port) <= 65535 ? Number(listen.port) : this.config.listen.port,
      apiKeyEnv
    };
    if (asString(listen.apiKey)) await this.ctx.credentials.set(asCredentialRef(apiKeyEnv), asString(listen.apiKey));
    await this.reconcile();
    return this.state();
  }

  async saveRoute(input) {
    const existing = this.config.routes.find((route) => route.id === asString(input?.id));
    const route = routeInput(input, existing);
    const conflict = this.config.routes.some((item) => item.id === route.id && item !== existing);
    if (conflict) throw new Error(`route ${route.id} already exists`);
    if (existing) Object.assign(existing, route);
    else this.config.routes.push(route);
    if (asString(input?.apiKey)) await this.ctx.credentials.set(asCredentialRef(route.apiKeyEnv), asString(input.apiKey));
    persistConfig(this.filename, this.config);
    this.router.config = this.config;
    return this.state();
  }

  async deleteRoute(id) {
    const index = this.config.routes.findIndex((route) => route.id === id);
    if (index < 0) throw new Error('route not found');
    const [removed] = this.config.routes.splice(index, 1);
    persistConfig(this.filename, this.config);
    this.router.config = this.config;
    return this.state();
  }

  async testRoute(id, model) {
    const route = this.config.routes.find((item) => item.id === id);
    if (!route) throw new Error('route not found');
    const selectedModel = asString(model, route.models[0]);
    if (!selectedModel) throw new Error('select a model before testing');
    const startedAt = Date.now();
    const response = await this.transport(route, selectedModel, { body: { model: selectedModel, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 8, stream: false }, endpoint: 'chat' });
    const text = await response.text();
    const result = { ok: response.ok, status: response.status, latencyMs: Date.now() - startedAt, preview: text.slice(0, 300) };
    this.recordAttempt({ route, model: selectedModel, ok: response.ok, status: response.status, latencyMs: result.latencyMs, error: response.ok ? undefined : new Error(text.slice(0, 300)) });
    return result;
  }
}

async function managementHandler(req, res, runtime) {
  const pathname = new URL(req.url ?? '/', 'http://dsh.local').pathname.slice(MANAGEMENT_PREFIX.length) || '/state';
  try {
    if (req.method === 'GET' && pathname === '/state') return sendJson(res, 200, await runtime.state());
    if (req.method === 'GET' && pathname === '/logs') return sendJson(res, 200, { logs: runtime.logs });
    if (req.method === 'DELETE' && pathname === '/logs') { runtime.logs.length = 0; return sendJson(res, 200, { ok: true }); }
    const body = ['POST', 'PUT'].includes(req.method ?? '') ? await readJsonRequest(req) : {};
    if (req.method === 'PUT' && pathname === '/service') return sendJson(res, 200, await runtime.saveService(body));
    if (req.method === 'POST' && pathname === '/routes') return sendJson(res, 200, await runtime.saveRoute(body));
    const routeMatch = pathname.match(/^\/routes\/([^/]+)$/);
    if (req.method === 'DELETE' && routeMatch) return sendJson(res, 200, await runtime.deleteRoute(decodeURIComponent(routeMatch[1])));
    const testMatch = pathname.match(/^\/routes\/([^/]+)\/test$/);
    if (req.method === 'POST' && testMatch) return sendJson(res, 200, await runtime.testRoute(decodeURIComponent(testMatch[1]), body.model));
    return sendJson(res, 404, { error: 'management endpoint not found' });
  } catch (error) {
    return sendJson(res, Number(error?.status) || 400, { error: safeError(error) });
  }
}

function loadConfig(config) {
  if (config && Array.isArray(config.routes)) return { config: normalizeConfig(config), filename: resolve(asString(config.configFile, 'cockpit-relay.json')) };
  const filename = resolve(asString(config?.configFile, 'cockpit-relay.json'));
  const raw = existsSync(filename) ? JSON.parse(readFileSync(filename, 'utf8')) : config;
  return { config: normalizeConfig(raw), filename };
}

export const name = 'dsh-cockpit-relay';
export const inject = ['credentials'];

export async function apply(ctx, rawConfig = {}) {
  const loaded = loadConfig(rawConfig);
  const runtime = new RelayRuntime(ctx, loaded.config, loaded.filename);
  await runtime.start();
  ctx.effect(() => () => runtime.stop(), 'dsh-cockpit-relay: relay server');
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({ kind: 'prefix', path: MANAGEMENT_PREFIX, handler: (req, res) => managementHandler(req, res, runtime) }), 'dsh-cockpit-relay: management API');
  });
}

export { ChannelRouter, RelayRuntime, normalizeConfig, managementHandler, routeInput };
