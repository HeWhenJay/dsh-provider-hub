import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ChannelRouter, normalizeConfig } from './routing.js';

function asString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function envKey(name) {
  const key = asString(name);
  return key.length === 0 ? '' : asString(process.env[key]);
}

function routeModel(route, model) {
  return asString(route.modelAliases[model], model);
}

function routeEndpoint(route, endpoint) {
  const suffix = endpoint === 'responses' ? '/responses' : '/chat/completions';
  return `${route.baseURL}${suffix}`;
}

function routeHeaders(route) {
  const key = envKey(route.apiKeyEnv);
  const headers = { 'content-type': 'application/json', 'user-agent': 'dsh-cockpit-relay/0.1.1', ...route.headers };
  if (key) headers.authorization = `Bearer ${key}`;
  return headers;
}

async function defaultTransport(route, model, request) {
  const body = { ...(request?.body ?? {}), model: routeModel(route, model) };
  return fetch(routeEndpoint(route, request?.endpoint), {
    method: 'POST',
    headers: routeHeaders(route),
    body: JSON.stringify(body),
    signal: request?.signal
  });
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

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS'
  });
  res.end(body);
}

function clientAuthorized(req, config) {
  const expected = envKey(config.listen.apiKeyEnv);
  if (!expected) return config.listen.host === '127.0.0.1';
  const actual = asString(req.headers.authorization).replace(/^Bearer\s+/i, '');
  return actual.length > 0 && actual === expected;
}

function modelsResponse(config) {
  const models = new Map();
  for (const route of config.routes) {
    for (const id of route.models) {
      models.set(id, { id, object: 'model', created: 0, owned_by: route.displayName });
    }
  }
  return { object: 'list', data: [...models.values()] };
}

async function webHandler(req, res, config, router) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS'
    });
    return res.end();
  }
  if (!clientAuthorized(req, config)) {
    return sendJson(res, 401, { error: { message: 'invalid local relay key', type: 'auth_error' } });
  }
  const pathname = new URL(req.url ?? '/', 'http://relay.local').pathname;
  if (req.method === 'GET' && pathname === '/health') {
    return sendJson(res, 200, { ok: true, provider: config.provider, routes: config.routes.length });
  }
  if (req.method === 'GET' && pathname === '/v1/models') {
    return sendJson(res, 200, modelsResponse(config));
  }
  if (req.method !== 'POST' || !['/v1/chat/completions', '/v1/responses'].includes(pathname)) {
    return sendJson(res, 404, { error: { message: 'endpoint not found', type: 'not_found' } });
  }
  let body;
  try {
    body = await readJsonRequest(req);
  } catch (error) {
    return sendJson(res, error?.status ?? 400, { error: { message: error.message, type: 'invalid_request_error' } });
  }
  const model = asString(body.model);
  if (!model) return sendJson(res, 400, { error: { message: 'model is required', type: 'invalid_request_error' } });
  const endpoint = pathname === '/v1/responses' ? 'responses' : 'chat';
  const sessionId = asString(req.headers['x-session-id'] ?? body.session_id ?? body.user);
  try {
    const { result: upstream } = await router.execute(model, { body, endpoint }, sessionId || undefined);
    const headers = {
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'content-type': upstream.headers.get('content-type') ?? 'application/json'
    };
    res.writeHead(upstream.status, headers);
    if (upstream.body) for await (const chunk of upstream.body) res.write(chunk);
    res.end();
  } catch (error) {
    sendJson(res, Number(error?.status) || 502, { error: { message: error.message, type: 'upstream_error' } });
  }
}

function loadConfig(config) {
  if (config && Array.isArray(config.routes)) return normalizeConfig(config);
  const file = resolve(asString(config?.configFile, 'cockpit-relay.json'));
  if (!existsSync(file)) return normalizeConfig(config);
  return normalizeConfig(JSON.parse(readFileSync(file, 'utf8')));
}

export const name = 'dsh-cockpit-relay';

export function apply(ctx, rawConfig = {}) {
  const config = loadConfig(rawConfig);
  if (config.routes.length === 0) {
    ctx.logger?.info?.('dsh-cockpit-relay: no routes configured; service remains dormant');
    return;
  }
  if (config.listen.host === '0.0.0.0' && !envKey(config.listen.apiKeyEnv)) {
    throw new Error(`dsh-cockpit-relay: LAN mode requires ${config.listen.apiKeyEnv} to be set`);
  }
  const router = new ChannelRouter(config, defaultTransport);
  if (!config.listen.enabled) return;
  const server = createServer((req, res) => {
    Promise.resolve(webHandler(req, res, config, router)).catch((error) => {
      if (!res.headersSent) sendJson(res, 500, { error: { message: error.message, type: 'relay_error' } });
      else res.destroy();
    });
  });
  server.listen(config.listen.port, config.listen.host);
  server.once('listening', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : config.listen.port;
    ctx.logger?.info?.(`dsh-cockpit-relay: listening on ${config.listen.host}:${port}`);
  });
  ctx.effect(() => async () => {
    if (!server.listening) return;
    server.closeAllConnections();
    await new Promise((resolveClose) => server.close(resolveClose));
  }, 'dsh-cockpit-relay: HTTP API');
}

export { ChannelRouter, normalizeConfig, defaultTransport, loadConfig, webHandler };
