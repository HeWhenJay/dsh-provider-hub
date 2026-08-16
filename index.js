import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { ChannelRouter, normalizeConfig } from './routing.js';
import { ProviderSidecar, SIDECAR_CLIENT_KEY_ENV } from './sidecar.js';

const MANAGEMENT_PREFIX = '/api/provider-hub';
const LEGACY_MANAGEMENT_PREFIX = '/api/cockpit-relay';
const LOG_LIMIT = 500;
const MAX_DISCOVERY_BYTES = 4 * 1024 * 1024;
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const SETTINGS_NAMESPACE = 'llm-pi-ai';
const OAUTH_PROVIDER_PATH = {
  codex: 'codex-auth-url',
  anthropic: 'anthropic-auth-url',
  gemini: 'gemini-cli-auth-url'
};

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

function modelsEndpoint(baseURL) {
  const trimmed = asString(baseURL).replace(/\/+$/, '');
  return /\/models$/i.test(trimmed) ? trimmed : `${trimmed}/models`;
}

async function readResponseJson(response, label) {
  const declared = Number(response.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_DISCOVERY_BYTES) throw new Error(`${label} response is too large`);
  const reader = response.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DISCOVERY_BYTES) throw new Error(`${label} response is too large`);
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(body)); }
  catch { throw new Error(`${label} did not return JSON`); }
}

function discoveredModels(body) {
  const source = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
  const seen = new Set();
  const models = [];
  for (const raw of source) {
    const id = asString(typeof raw === 'string' ? raw : raw?.id ?? raw?.name?.replace?.(/^models\//, ''));
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = asString(raw?.display_name ?? raw?.displayName ?? raw?.name);
    const contextWindow = Number(raw?.context_window ?? raw?.context_length ?? raw?.contextWindow);
    const maxTokens = Number(raw?.max_output_tokens ?? raw?.max_tokens ?? raw?.maxTokens);
    models.push({
      id,
      ...(name && name !== id ? { name } : {}),
      ...(Number.isInteger(contextWindow) && contextWindow > 0 ? { contextWindow } : {}),
      ...(Number.isInteger(maxTokens) && maxTokens > 0 ? { maxTokens } : {})
    });
  }
  return models;
}

function publicAuthFile(raw) {
  return {
    id: asString(raw?.id ?? raw?.name),
    name: asString(raw?.label ?? raw?.email ?? raw?.account ?? raw?.name ?? raw?.id),
    provider: asString(raw?.provider ?? raw?.type),
    status: asString(raw?.status),
    disabled: raw?.disabled === true,
    unavailable: raw?.unavailable === true
  };
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

function modelsResponse(routes) {
  const models = new Map();
  for (const route of routes) {
    for (const raw of route.models) {
      const model = typeof raw === 'string' ? route.modelMetadata?.[raw] ?? { id: raw } : raw;
      const id = asString(model?.id);
      if (!id || models.has(id)) continue;
      models.set(id, {
        id,
        object: 'model',
        created: 0,
        owned_by: route.displayName,
        ...(asString(model?.name) ? { name: asString(model.name) } : {}),
        ...(Number.isInteger(model?.contextWindow) && model.contextWindow > 0 ? { context_window: model.contextWindow } : {}),
        ...(Number.isInteger(model?.maxTokens) && model.maxTokens > 0 ? { max_output_tokens: model.maxTokens } : {})
      });
    }
  }
  return { object: 'list', data: [...models.values()] };
}

function managedModels(routes, supplemental = []) {
  const models = new Map();
  const append = (raw) => {
    const model = typeof raw === 'string' ? { id: raw } : raw;
    const id = asString(model?.id);
    if (!id) return;
    const existing = models.get(id) ?? { id };
    const name = asString(model?.name ?? model?.display_name ?? model?.displayName);
    const contextWindow = Number(model?.context_window ?? model?.context_length ?? model?.contextWindow);
    const maxTokens = Number(model?.max_output_tokens ?? model?.max_tokens ?? model?.maxTokens);
    models.set(id, {
      ...existing,
      ...(name && name !== id ? { name } : {}),
      ...(Number.isInteger(contextWindow) && contextWindow > 0 ? { contextWindow } : {}),
      ...(Number.isInteger(maxTokens) && maxTokens > 0 ? { maxTokens } : {})
    });
  };
  for (const model of supplemental) append(model);
  for (const route of routes) for (const model of route.models) append(route.modelMetadata?.[model] ?? model);
  return [...models.values()];
}

function managedProviderMatches(profile, expected, { includeModels = true } = {}) {
  if (!profile || typeof profile !== 'object') return false;
  if (profile.baseURL !== expected.baseURL || profile.api !== expected.api || profile.displayName !== expected.displayName) return false;
  if ((profile.apiKeyEnv || undefined) !== (expected.apiKeyEnv || undefined)) return false;
  if (!includeModels) return true;
  return JSON.stringify(profile.models ?? []) === JSON.stringify(expected.models);
}

function sameJson(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => sameJson(item, right[index]));
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && sameJson(left[key], right[key]));
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

function generatedRouteCredentialRef(id) {
  return `DSH_PROVIDER_HUB_${id.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_KEY`;
}

function routeInput(raw, existing) {
  const value = raw && typeof raw === 'object' ? raw : {};
  const id = asString(value.id, existing?.id);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(id)) throw new Error('route id must use letters, numbers, _ or -');
  const baseURL = asString(value.baseURL, existing?.baseURL).replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(baseURL)) throw new Error('baseURL must start with http:// or https://');
  const suppliedApiKeyEnv = asString(value.apiKeyEnv);
  const apiKeyEnv = suppliedApiKeyEnv || existing?.apiKeyEnv || generatedRouteCredentialRef(id);
  asCredentialRef(apiKeyEnv);
  const sourceModels = Array.isArray(value.models) ? value.models : existing?.models ?? [];
  const modelMetadata = value.modelMetadata && typeof value.modelMetadata === 'object' ? { ...value.modelMetadata } : { ...(existing?.modelMetadata ?? {}) };
  const models = [];
  for (const rawModel of sourceModels) {
    const id = asString(typeof rawModel === 'string' ? rawModel : rawModel?.id);
    if (!id || models.includes(id)) continue;
    models.push(id);
    if (rawModel && typeof rawModel === 'object') modelMetadata[id] = { ...rawModel, id };
  }
  for (const id of Object.keys(modelMetadata)) if (!models.includes(id)) delete modelMetadata[id];
  return {
    id,
    displayName: asString(value.displayName, existing?.displayName || id),
    baseURL,
    api: value.api === 'openai-responses' ? 'openai-responses' : 'openai-completions',
    apiKeyEnv,
    priority: Number.isFinite(Number(value.priority)) ? Number(value.priority) : existing?.priority ?? 0,
    backup: value.backup === true,
    models,
    modelMetadata,
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
    this.oauthSessions = new Map();
    this.accountSnapshot = undefined;
    this.sidecar = new ProviderSidecar({
      root: join(dirname(filename), 'provider-hub', 'sidecar'),
      port: this.config.accountService.port,
      credentials: this.ctx.credentials,
      onStateChange: () => {
        this.refreshRouter();
        void this.syncManagedProvider().catch(() => {});
      }
    });
    this.disposed = false;
    this.sidecarStartPromise = undefined;
    this.managedProviderState = { status: 'pending', available: false, modelCount: 0 };
    this.managedProviderSync = Promise.resolve();
    this.refreshRouter();
  }

  internalAccountRoute() {
    if (!this.config.accountService.enabled || this.sidecar.phase !== 'running' || !this.sidecar.baseURL || this.sidecar.models.length === 0) return undefined;
    return {
      id: 'provider-hub-accounts',
      displayName: 'Provider Hub 官方账号',
      baseURL: `${this.sidecar.baseURL}/v1`,
      api: 'openai-completions',
      apiKeyEnv: SIDECAR_CLIENT_KEY_ENV,
      priority: this.config.accountService.priority,
      backup: false,
      models: this.sidecar.models.map((model) => model.id),
      modelMetadata: Object.fromEntries(this.sidecar.models.map((model) => [model.id, model])),
      modelAliases: {},
      headers: {},
      internal: true
    };
  }

  runtimeRoutes() {
    const accountRoute = this.internalAccountRoute();
    return accountRoute ? [accountRoute, ...this.config.routes] : this.config.routes;
  }

  refreshRouter() {
    const routingConfig = { ...this.config, routes: this.runtimeRoutes() };
    if (this.router) this.router.config = routingConfig;
    else this.router = new ChannelRouter(routingConfig, (route, model, request) => this.transport(route, model, request), (entry) => this.recordAttempt(entry));
  }

  settingsService() {
    return this.ctx.reflect?.get?.('settings');
  }

  relayBaseURL() {
    const host = this.config.listen.host === '0.0.0.0' ? '127.0.0.1' : this.config.listen.host;
    return `http://${host}:${this.actualPort ?? this.config.listen.port}/v1`;
  }

  setManagedOwnership(owned, profile) {
    const managed = this.config.managedProvider;
    const nextProfile = owned && profile ? structuredClone(profile) : undefined;
    if (managed.owned === owned && JSON.stringify(managed.lastProfile) === JSON.stringify(nextProfile)) return;
    managed.owned = owned;
    if (nextProfile) managed.lastProfile = nextProfile;
    else delete managed.lastProfile;
    persistConfig(this.filename, this.config);
  }

  async performManagedProviderSync() {
    const managed = this.config.managedProvider;
    const id = managed.id;
    const models = managedModels(this.runtimeRoutes(), this.sidecar.models);
    const settings = this.settingsService();
    const baseState = {
      id,
      displayName: managed.displayName,
      available: Boolean(settings?.mutate),
      baseURL: this.relayBaseURL(),
      modelCount: models.length
    };
    if (!settings?.mutate) {
      this.managedProviderState = { ...baseState, status: 'unavailable', error: 'DSH settings service is unavailable' };
      return this.managedProviderState;
    }
    const descriptor = settings.describe?.().find((item) => item.ns === SETTINGS_NAMESPACE);
    const section = descriptor?.value;
    if (!descriptor || !section || typeof section !== 'object') {
      this.managedProviderState = { ...baseState, status: 'unavailable', error: `DSH settings namespace ${SETTINGS_NAMESPACE} is unavailable` };
      return this.managedProviderState;
    }
    const existing = section.providers?.[id];
    const userExisting = descriptor.user?.providers?.[id];
    const keyConfigured = (await this.ctx.credentials.describe(asCredentialRef(this.config.listen.apiKeyEnv))).configured === true;
    const profile = {
      displayName: managed.displayName,
      api: 'openai-completions',
      baseURL: this.relayBaseURL(),
      models,
      ...(keyConfigured ? { apiKeyEnv: this.config.listen.apiKeyEnv } : {})
    };
    const shouldExist = managed.enabled && this.config.listen.enabled && Boolean(this.server?.listening) && models.length > 0;
    const ownsExisting = managed.owned && managed.lastProfile && sameJson(userExisting, managed.lastProfile);

    if (!shouldExist) {
      if (existing && !ownsExisting) {
        this.managedProviderState = { ...baseState, status: 'conflict', error: `DSH provider "${id}" is not owned by Provider Hub and was left unchanged` };
        return this.managedProviderState;
      }
      if (existing) await settings.mutate(SETTINGS_NAMESPACE, [{ op: 'unset', path: ['providers', id] }], descriptor.revision);
      this.setManagedOwnership(false);
      this.managedProviderState = { ...baseState, status: models.length === 0 ? 'pending' : 'removed' };
      return this.managedProviderState;
    }

    if (existing && !ownsExisting) {
      this.managedProviderState = { ...baseState, status: 'conflict', error: `DSH provider "${id}" already exists and was left unchanged` };
      return this.managedProviderState;
    }
    if (!managedProviderMatches(existing, profile)) await settings.mutate(SETTINGS_NAMESPACE, [{ op: 'set', path: ['providers', id], value: profile }], descriptor.revision);
    this.setManagedOwnership(true, profile);
    this.managedProviderState = { ...baseState, status: 'synced', keyConfigured };
    return this.managedProviderState;
  }

  syncManagedProvider() {
    const pending = this.managedProviderSync.catch(() => {}).then(async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try { return await this.performManagedProviderSync(); }
        catch (error) {
          if (error?.name !== 'SettingsConflictError' || attempt === 2) throw error;
        }
      }
    });
    this.managedProviderSync = pending;
    return pending.catch((error) => {
      this.managedProviderState = {
        ...this.managedProviderState,
        status: 'error',
        error: safeLogError(error)
      };
      return this.managedProviderState;
    });
  }

  async secret(name) {
    return (await this.ctx.credentials.resolve(asCredentialRef(name)))?.value ?? '';
  }

  async transport(route, model, request) {
    const key = await this.secret(route.apiKeyEnv);
    const body = { ...(request?.body ?? {}), model: routeModel(route, model) };
    const headers = { 'content-type': 'application/json', 'user-agent': 'dsh-provider-hub/0.4.0', ...route.headers };
    if (key) headers.authorization = `Bearer ${key}`;
    return fetch(routeEndpoint(route, request?.endpoint), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: request?.signal
    });
  }

  async discoverRouteModels(input) {
    const draft = input && typeof input === 'object' ? input : {};
    const baseURL = asString(draft.baseURL);
    if (!/^https?:\/\//i.test(baseURL)) throw new Error('baseURL must start with http:// or https://');
    const apiKeyEnv = asString(draft.apiKeyEnv);
    if (apiKeyEnv) asCredentialRef(apiKeyEnv);
    const supplied = asString(draft.apiKey);
    const key = supplied || (apiKeyEnv ? await this.secret(apiKeyEnv) : '');
    const url = modelsEndpoint(baseURL);
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new Error(`model discovery returned HTTP ${response.status}${[401, 403].includes(response.status) ? '; check the API key' : ''}`);
    const models = discoveredModels(await readResponseJson(response, 'model discovery'));
    if (models.length === 0) throw new Error('the provider returned no usable models');
    return { models, source: 'endpoint' };
  }

  async startAccountService({ install = this.config.accountService.autoInstall } = {}) {
    if (this.disposed || !this.config.accountService.enabled) return false;
    if (this.sidecarStartPromise) return this.sidecarStartPromise;
    this.sidecarStartPromise = this.sidecar.start({ install })
      .then(async (running) => { this.refreshRouter(); await this.syncManagedProvider(); return running; })
      .finally(() => { this.sidecarStartPromise = undefined; });
    return this.sidecarStartPromise;
  }

  startAccountServiceInBackground() {
    if (!this.config.accountService.enabled) return;
    void this.startAccountService().catch((error) => {
      this.sidecar.phase = 'error';
      this.sidecar.error = safeLogError(error);
      this.refreshRouter();
      void this.syncManagedProvider();
    });
  }

  async accountServiceState(refresh = false) {
    const base = { ...this.sidecar.snapshot(), ...this.config.accountService, providers: Object.keys(OAUTH_PROVIDER_PATH), accounts: [] };
    if (!this.config.accountService.enabled || !refresh || this.sidecar.phase !== 'running') return { ...base, ...(this.accountSnapshot ?? {}) };
    try {
      await this.sidecar.probe();
      const body = await this.sidecar.management('auth-files');
      this.accountSnapshot = { available: true, accounts: (Array.isArray(body?.files) ? body.files : []).map(publicAuthFile).filter((item) => item.id) };
    } catch (error) {
      this.accountSnapshot = { available: false, accounts: [], accountError: safeLogError(error) };
    }
    this.refreshRouter();
    await this.syncManagedProvider();
    return { ...base, ...this.sidecar.snapshot(), ...this.accountSnapshot };
  }

  async setAccountService(input) {
    const value = input && typeof input === 'object' ? input : {};
    const oldPort = this.config.accountService.port;
    this.config.accountService = {
      ...this.config.accountService,
      enabled: value.enabled !== false,
      autoInstall: value.autoInstall !== false,
      port: Number.isInteger(Number(value.port)) && Number(value.port) > 0 && Number(value.port) <= 65535 ? Number(value.port) : this.config.accountService.port,
      priority: Number.isFinite(Number(value.priority)) ? Number(value.priority) : this.config.accountService.priority
    };
    this.sidecar.preferredPort = this.config.accountService.port;
    persistConfig(this.filename, this.config);
    if (!this.config.accountService.enabled) await this.sidecar.stop();
    else {
      if (oldPort !== this.config.accountService.port && this.sidecar.phase === 'running') await this.sidecar.stop();
      await this.startAccountService();
    }
    this.accountSnapshot = undefined;
    this.refreshRouter();
    await this.syncManagedProvider();
    return this.accountServiceState(this.sidecar.phase === 'running');
  }

  async installAccountService() {
    if (!this.config.accountService.enabled) throw new Error('enable the built-in account service before installing it');
    await this.startAccountService({ install: true });
    return this.accountServiceState(this.sidecar.phase === 'running');
  }

  async stopAccountService() {
    await this.sidecar.stop();
    this.oauthSessions.clear();
    this.accountSnapshot = undefined;
    this.refreshRouter();
    await this.syncManagedProvider();
    return this.accountServiceState(false);
  }

  async startAccountOAuth(provider) {
    const path = OAUTH_PROVIDER_PATH[provider];
    if (!path) throw new Error('unsupported official OAuth provider');
    await this.startAccountService({ install: true });
    if (this.sidecar.phase !== 'running') throw new Error(this.sidecar.error || 'built-in account service is not running');
    if ([...this.oauthSessions.values()].some((session) => session.provider === provider && session.expiresAt >= Date.now())) throw new Error(`a ${provider} login is already in progress`);
    const body = await this.sidecar.management(path);
    const state = asString(body?.state);
    const url = asString(body?.url);
    if (!state || !url) throw new Error('account service did not return an authorization URL');
    try { await this.sidecar.startOAuthCallback(provider, state); }
    catch (error) { throw new Error(`cannot reserve the local OAuth callback port: ${safeError(error)}`); }
    this.oauthSessions.set(state, { provider, url, expiresAt: Date.now() + OAUTH_SESSION_TTL_MS });
    return { provider, state, url, status: 'wait' };
  }

  async accountOAuthStatus(state) {
    const session = this.oauthSessions.get(state);
    if (!session || session.expiresAt < Date.now()) {
      this.oauthSessions.delete(state);
      await this.sidecar.stopOAuthCallback(state);
      throw new Error('OAuth session is unknown or expired');
    }
    const body = await this.sidecar.management('get-auth-status', { query: { state } });
    const status = asString(body?.status, 'error');
    if (status !== 'wait') {
      this.oauthSessions.delete(state);
      await this.sidecar.stopOAuthCallback(state);
      if (status === 'ok') await this.accountServiceState(true);
    }
    return { provider: session.provider, state, url: session.url, status, error: asString(body?.error) || undefined };
  }

  async setAccountEnabled(id, disabled) {
    const name = asString(id);
    if (!name) throw new Error('account id is required');
    await this.sidecar.management('auth-files/status', { method: 'PATCH', body: { name, disabled: disabled === true } });
    return this.accountServiceState(true);
  }

  async deleteAccount(id) {
    const name = asString(id);
    if (!name) throw new Error('account id is required');
    await this.sidecar.management('auth-files', { method: 'DELETE', query: { name } });
    return this.accountServiceState(true);
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
    if (req.method === 'GET' && pathname === '/health') return sendJson(res, 200, { ok: true, provider: this.config.provider, routes: this.runtimeRoutes().length }, true);
    if (req.method === 'GET' && pathname === '/v1/models') return sendJson(res, 200, modelsResponse(this.runtimeRoutes()), true);
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
    if (this.server) return;
    if (!this.config.listen.enabled) {
      await this.syncManagedProvider();
      return;
    }
    if (this.config.listen.host === '0.0.0.0' && !(await this.secret(this.config.listen.apiKeyEnv))) {
      this.startError = `LAN mode requires ${this.config.listen.apiKeyEnv} to be configured`;
      await this.syncManagedProvider();
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
      if (this.actualPort !== requestedPort && requestedPort !== 0) this.startNotice = `端口 ${requestedPort} 已被占用；Provider Hub 已改用 ${this.actualPort}，未停止现有服务。`;
      server.on('error', (reason) => { this.startError = safeError(reason); });
      await this.syncManagedProvider();
      return;
    }
    if (!this.startError) this.startError = `No free port found from ${requestedPort} to ${Math.min(65535, requestedPort + 49)}`;
    await this.syncManagedProvider();
  }

  async stop() {
    const server = this.server;
    this.server = undefined;
    this.actualPort = undefined;
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
    }
    await this.syncManagedProvider();
  }

  async dispose() {
    this.disposed = true;
    this.oauthSessions.clear();
    await Promise.allSettled([this.stop(), this.sidecar.stop()]);
    this.refreshRouter();
  }

  async reconcile({ stopped = false } = {}) {
    this.refreshRouter();
    persistConfig(this.filename, this.config);
    if (!stopped) await this.stop();
    if (this.config.listen.enabled) await this.start();
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
        baseURL: this.relayBaseURL()
      },
      managedProvider: { ...this.managedProviderState },
      routing: { maxAttempts: this.config.maxAttempts, cooldownMs: this.config.cooldownMs, sessionAffinity: this.config.sessionAffinity },
      accountService: await this.accountServiceState(false),
      routes,
      logCount: this.logs.length
    };
  }

  async saveService(input) {
    const listen = input && typeof input === 'object' ? input : {};
    const oldApiKeyEnv = this.config.listen.apiKeyEnv;
    const apiKeyEnv = asString(listen.apiKeyEnv, oldApiKeyEnv);
    asCredentialRef(apiKeyEnv);
    if (asString(listen.apiKey) && apiKeyEnv === oldApiKeyEnv) await this.ctx.credentials.set(apiKeyEnv, asString(listen.apiKey));
    await this.stop();
    this.config.listen = {
      enabled: listen.enabled !== false,
      host: listen.host === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
      port: Number.isInteger(Number(listen.port)) && Number(listen.port) > 0 && Number(listen.port) <= 65535 ? Number(listen.port) : this.config.listen.port,
      apiKeyEnv
    };
    if (asString(listen.apiKey) && apiKeyEnv !== oldApiKeyEnv) await this.ctx.credentials.set(apiKeyEnv, asString(listen.apiKey));
    await this.reconcile({ stopped: true });
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
    this.refreshRouter();
    await this.syncManagedProvider();
    return this.state();
  }

  async deleteRoute(id) {
    const index = this.config.routes.findIndex((route) => route.id === id);
    if (index < 0) throw new Error('route not found');
    const [removed] = this.config.routes.splice(index, 1);
    persistConfig(this.filename, this.config);
    this.refreshRouter();
    await this.syncManagedProvider();
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

async function managementHandler(req, res, runtime, prefix = MANAGEMENT_PREFIX) {
  const pathname = new URL(req.url ?? '/', 'http://dsh.local').pathname.slice(prefix.length) || '/state';
  try {
    if (req.method === 'GET' && pathname === '/state') return sendJson(res, 200, await runtime.state());
    if (req.method === 'GET' && pathname === '/logs') return sendJson(res, 200, { logs: runtime.logs });
    if (req.method === 'DELETE' && pathname === '/logs') { runtime.logs.length = 0; return sendJson(res, 200, { ok: true }); }
    const requestURL = new URL(req.url ?? '/', 'http://dsh.local');
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method ?? '') ? await readJsonRequest(req) : {};
    if (req.method === 'PUT' && pathname === '/service') return sendJson(res, 200, await runtime.saveService(body));
    if (req.method === 'GET' && pathname === '/account-service') return sendJson(res, 200, await runtime.accountServiceState(false));
    if (req.method === 'PUT' && pathname === '/account-service') return sendJson(res, 200, await runtime.setAccountService(body));
    if (req.method === 'POST' && pathname === '/account-service/install') return sendJson(res, 200, await runtime.installAccountService());
    if (req.method === 'POST' && pathname === '/account-service/start') { await runtime.startAccountService(); return sendJson(res, 200, await runtime.accountServiceState(true)); }
    if (req.method === 'POST' && pathname === '/account-service/stop') return sendJson(res, 200, await runtime.stopAccountService());
    if (req.method === 'POST' && pathname === '/account-service/refresh') return sendJson(res, 200, await runtime.accountServiceState(true));
    if (req.method === 'POST' && pathname === '/models/discover') return sendJson(res, 200, await runtime.discoverRouteModels(body));
    const oauthStartMatch = pathname.match(/^\/account-service\/oauth\/([^/]+)\/start$/);
    if (req.method === 'POST' && oauthStartMatch) return sendJson(res, 200, await runtime.startAccountOAuth(decodeURIComponent(oauthStartMatch[1])));
    if (req.method === 'GET' && pathname === '/account-service/oauth/status') return sendJson(res, 200, await runtime.accountOAuthStatus(asString(requestURL.searchParams.get('state'))));
    const accountStatusMatch = pathname.match(/^\/account-service\/accounts\/([^/]+)\/status$/);
    if (req.method === 'PATCH' && accountStatusMatch) return sendJson(res, 200, await runtime.setAccountEnabled(decodeURIComponent(accountStatusMatch[1]), body.disabled));
    const accountMatch = pathname.match(/^\/account-service\/accounts\/([^/]+)$/);
    if (req.method === 'DELETE' && accountMatch) return sendJson(res, 200, await runtime.deleteAccount(decodeURIComponent(accountMatch[1])));
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
  if (config && Array.isArray(config.routes)) return { config: normalizeConfig(config), filename: resolve(asString(config.configFile, 'provider-hub.json')) };
  const filename = resolve(asString(config?.configFile, 'provider-hub.json'));
  const legacyRaw = asString(config?.legacyConfigFile);
  const legacyFilename = legacyRaw ? resolve(legacyRaw) : '';
  let raw = config;
  if (existsSync(filename)) raw = JSON.parse(readFileSync(filename, 'utf8'));
  else if (legacyFilename && legacyFilename !== filename && existsSync(legacyFilename)) {
    raw = JSON.parse(readFileSync(legacyFilename, 'utf8'));
    persistConfig(filename, normalizeConfig(raw));
  }
  return { config: normalizeConfig(raw), filename };
}

export const name = 'dsh-provider-hub';
export const inject = ['credentials'];

export async function apply(ctx, rawConfig = {}) {
  const loaded = loadConfig(rawConfig);
  const runtime = new RelayRuntime(ctx, loaded.config, loaded.filename);
  await runtime.start();
  runtime.startAccountServiceInBackground();
  ctx.effect(() => () => runtime.dispose(), 'dsh-provider-hub: owned services');
  ctx.on('credentials/updated', (ref) => {
    if (String(ref) === runtime.config.listen.apiKeyEnv) void runtime.syncManagedProvider();
  });
  ctx.on('settings/document-updated', (ns) => {
    if (ns === SETTINGS_NAMESPACE) void runtime.syncManagedProvider();
  });
  ctx.inject(['settings'], () => {
    void runtime.syncManagedProvider();
  });
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => [
      webCtx.webServer.register({ kind: 'prefix', path: MANAGEMENT_PREFIX, handler: (req, res) => managementHandler(req, res, runtime, MANAGEMENT_PREFIX) }),
      webCtx.webServer.register({ kind: 'prefix', path: LEGACY_MANAGEMENT_PREFIX, handler: (req, res) => managementHandler(req, res, runtime, LEGACY_MANAGEMENT_PREFIX) })
    ], 'dsh-provider-hub: management API');
  });
}

export { ChannelRouter, RelayRuntime, normalizeConfig, generatedRouteCredentialRef, loadConfig, managementHandler, routeInput };
