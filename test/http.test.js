import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RelayRuntime, loadConfig, managementHandler, normalizeConfig } from '../index.js';

const PREFIX = '/api/provider-hub';
const LEGACY_PREFIX = '/api/cockpit-relay';

function credentials(values = {}) {
  const store = new Map(Object.entries(values));
  return {
    store,
    async resolve(ref) { const value = store.get(String(ref)); return value ? { value, source: 'test' } : undefined; },
    async describe(ref) { return { configured: store.has(String(ref)), source: store.has(String(ref)) ? 'test' : undefined, writable: true }; },
    async set(ref, value) { store.set(String(ref), value); },
    async unset(ref) { store.delete(String(ref)); }
  };
}

function runtime(config, credentialValues = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'provider-hub-test-'));
  const ctx = { credentials: credentials(credentialValues) };
  const instance = new RelayRuntime(ctx, normalizeConfig(config), join(dir, 'provider-hub.json'));
  return { instance, ctx, dir, dispose: async () => { await instance.dispose(); rmSync(dir, { recursive: true, force: true }); } };
}

async function withServer(handler, run) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try { return await run(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

async function management(runtimeInstance, path, init, prefix = PREFIX) {
  return withServer((req, res) => managementHandler(req, res, runtimeInstance, prefix), async (url) => {
    const response = await fetch(`${url}${prefix}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
    return { status: response.status, body: await response.json() };
  });
}

test('models endpoint never exposes upstream secrets', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1', apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'a', displayName: 'A', baseURL: 'https://a.invalid/v1', apiKeyEnv: 'SECRET_ENV_NAME', models: ['gpt-test'] }] }, { SECRET_ENV_NAME: 'sk-secret' });
  try {
    await withServer((req, res) => fixture.instance.handleRelay(req, res), async (url) => {
      const response = await fetch(`${url}/v1/models`);
      const body = await response.text();
      assert.equal(response.status, 200);
      assert.match(body, /gpt-test/);
      assert.doesNotMatch(body, /sk-secret|authorization|apiKey/i);
    });
  } finally { await fixture.dispose(); }
});

test('chat endpoint fails over and preserves streaming bytes', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1', apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'cheap', baseURL: 'https://cheap.invalid/v1', models: ['gpt-test'], priority: 100 }, { id: 'backup', baseURL: 'https://backup.invalid/v1', models: ['gpt-test'], priority: 1, backup: true }] });
  const calls = [];
  fixture.instance.router.transport = async (route) => {
    calls.push(route.id);
    if (route.id === 'cheap') return new Response('down', { status: 503 });
    return new Response('data: {"ok":true}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  };
  try {
    await withServer((req, res) => fixture.instance.handleRelay(req, res), async (url) => {
      const response = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-test', stream: true }) });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'data: {"ok":true}\n\n');
    });
    assert.deepEqual(calls, ['cheap', 'backup']);
    assert.equal(fixture.instance.logs.length, 2);
  } finally { await fixture.dispose(); }
});

test('request logs redact URLs, headers, and secret-shaped values', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', displayName: 'A', baseURL: 'https://secret.example/v1', headers: { 'x-private': 'hidden' } }] });
  try {
    fixture.instance.recordAttempt({ route: fixture.instance.config.routes[0], model: 'gpt-test', ok: false, status: 0, latencyMs: 4, error: new Error('fetch https://secret.example/v1 failed Bearer sk-test-secret-value') });
    const state = await fixture.instance.state();
    assert.equal('headers' in state.routes[0], false);
    assert.doesNotMatch(fixture.instance.logs[0].error, /secret\.example|sk-test-secret-value/);
  } finally { await fixture.dispose(); }
});

test('management API generates a credential ref when the client submits an empty string', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1', apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [] });
  try {
    const response = await management(fixture.instance, '/routes', { method: 'POST', body: JSON.stringify({ id: 'cheap-a', displayName: 'Cheap A', baseURL: 'https://a.invalid/v1', apiKeyEnv: '', apiKey: 'sk-private', models: ['gpt-test'] }) });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.routes[0].apiKeyEnv, 'DSH_PROVIDER_HUB_CHEAP_A_KEY');
    assert.equal(response.body.routes[0].keyConfigured, true);
    assert.equal(fixture.ctx.credentials.store.get('DSH_PROVIDER_HUB_CHEAP_A_KEY'), 'sk-private');
    const persisted = readFileSync(join(fixture.dir, 'provider-hub.json'), 'utf8');
    assert.doesNotMatch(persisted, /sk-private/);
    assert.match(persisted, /DSH_PROVIDER_HUB_CHEAP_A_KEY/);
  } finally { await fixture.dispose(); }
});

test('editing a route with an empty credential field preserves its existing reference', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', displayName: 'A', baseURL: 'https://a.invalid/v1', apiKeyEnv: 'SHARED_KEY', models: ['gpt-test'] }] }, { SHARED_KEY: 'sk-shared' });
  try {
    const response = await management(fixture.instance, '/routes', { method: 'POST', body: JSON.stringify({ id: 'a', displayName: 'A edited', baseURL: 'https://a.invalid/v1', apiKeyEnv: '', models: ['gpt-test'] }) });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.routes[0].apiKeyEnv, 'SHARED_KEY');
    assert.equal(response.body.routes[0].displayName, 'A edited');
  } finally { await fixture.dispose(); }
});

test('deleting a route preserves a possibly shared credential', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', apiKeyEnv: 'SHARED_KEY' }] }, { SHARED_KEY: 'sk-shared' });
  try {
    const response = await management(fixture.instance, '/routes/a', { method: 'DELETE' });
    assert.equal(response.status, 200);
    assert.equal(response.body.routes.length, 0);
    assert.equal(fixture.ctx.credentials.store.get('SHARED_KEY'), 'sk-shared');
  } finally { await fixture.dispose(); }
});

test('service can be disabled through the management API', async () => {
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1' }] });
  try {
    await fixture.instance.start();
    assert.equal(fixture.instance.server?.listening, true);
    const response = await management(fixture.instance, '/service', { method: 'PUT', body: JSON.stringify({ enabled: false, host: '127.0.0.1', port: 19529, apiKeyEnv: 'CLIENT_KEY' }) });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.service.enabled, false);
    assert.equal(fixture.instance.server, undefined);
  } finally { await fixture.dispose(); }
});

test('legacy config migrates once without removing or rewriting the source file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'provider-hub-migration-'));
  const legacy = join(dir, 'cockpit-relay.json');
  const current = join(dir, 'provider-hub.json');
  const legacyBody = JSON.stringify({ provider: 'cockpit-relay', listen: { enabled: false, apiKeyEnv: 'DSH_COCKPIT_CLIENT_KEY' }, routes: [{ id: 'legacy', baseURL: 'https://legacy.invalid/v1', apiKeyEnv: 'COCKPIT_RELAY_LEGACY_KEY' }] }, null, 2);
  writeFileSync(legacy, legacyBody);
  try {
    const loaded = loadConfig({ configFile: current, legacyConfigFile: legacy });
    assert.equal(loaded.filename, current);
    assert.equal(loaded.config.routes[0].apiKeyEnv, 'COCKPIT_RELAY_LEGACY_KEY');
    assert.equal(readFileSync(legacy, 'utf8'), legacyBody);
    const migrated = JSON.parse(readFileSync(current, 'utf8'));
    assert.equal(migrated.routes[0].id, 'legacy');
    assert.equal(migrated.accountService.enabled, true);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('legacy management prefix remains compatible during migration', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [] });
  try {
    const response = await management(fixture.instance, '/state', undefined, LEGACY_PREFIX);
    assert.equal(response.status, 200);
    assert.equal(response.body.service.enabled, false);
  } finally { await fixture.dispose(); }
});

test('model discovery parses standard responses and sends the configured key', async () => {
  let authorization = '';
  await withServer((req, res) => {
    authorization = req.headers.authorization || '';
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: [{ id: 'gpt-alpha', display_name: 'GPT Alpha', context_window: 32000 }, { id: 'gpt-alpha' }, { id: 'gpt-beta', max_output_tokens: 4096 }] }));
  }, async (baseURL) => {
    const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [] }, { PROVIDER_KEY: 'sk-provider' });
    try {
      const response = await management(fixture.instance, '/models/discover', { method: 'POST', body: JSON.stringify({ baseURL: `${baseURL}/v1`, apiKeyEnv: 'PROVIDER_KEY' }) });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.models.map((item) => item.id), ['gpt-alpha', 'gpt-beta']);
      assert.equal(response.body.models[0].contextWindow, 32000);
      assert.equal(authorization, 'Bearer sk-provider');
    } finally { await fixture.dispose(); }
  });
});

test('account-service state is safe and management endpoints call the owned sidecar', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: true, autoInstall: false, port: 19629, priority: 900 }, routes: [] });
  const calls = [];
  fixture.instance.sidecar.phase = 'running';
  fixture.instance.sidecar.port = 21999;
  fixture.instance.sidecar.models = [{ id: 'gpt-account' }];
  fixture.instance.sidecar.management = async (path, options) => {
    calls.push({ path, options });
    if (path === 'auth-files') return { files: [{ id: 'codex-user.json', email: 'user@example.com', provider: 'codex', status: 'ready' }] };
    return { status: 'ok' };
  };
  fixture.instance.sidecar.probe = async () => true;
  try {
    const response = await management(fixture.instance, '/account-service/refresh', { method: 'POST', body: '{}' });
    assert.equal(response.status, 200);
    assert.equal(response.body.accounts[0].name, 'user@example.com');
    assert.equal('managementKey' in response.body, false);
    assert.equal(fixture.instance.router.config.routes[0].id, 'provider-hub-accounts');
    assert.equal(fixture.instance.router.config.routes[0].apiKeyEnv, 'DSH_PROVIDER_HUB_SIDECAR_KEY');
    assert.equal(calls[0].path, 'auth-files');
  } finally { await fixture.dispose(); }
});

test('OAuth status rejects unknown states before forwarding to the sidecar', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [] });
  let forwarded = false;
  fixture.instance.sidecar.management = async () => { forwarded = true; return { status: 'ok' }; };
  try {
    const response = await management(fixture.instance, '/account-service/oauth/status?state=unknown');
    assert.equal(response.status, 400);
    assert.match(response.body.error, /unknown or expired/);
    assert.equal(forwarded, false);
  } finally { await fixture.dispose(); }
});

test('autoInstall false does not download a missing sidecar', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: true, autoInstall: false, port: 19629 }, routes: [] });
  try {
    const response = await management(fixture.instance, '/account-service/start', { method: 'POST', body: '{}' });
    assert.equal(response.status, 200);
    assert.equal(response.body.installed, false);
    assert.equal(response.body.phase, 'not-installed');
  } finally { await fixture.dispose(); }
});

test('browser-origin requests cannot use an unkeyed local service', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1', apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [] });
  try {
    await withServer((req, res) => fixture.instance.handleRelay(req, res), async (url) => {
      const response = await fetch(`${url}/v1/models`, { headers: { origin: 'http://evil.example' } });
      assert.equal(response.status, 401);
    });
  } finally { await fixture.dispose(); }
});

test('occupied relay port falls back without stopping the existing service', async () => {
  const original = createServer((_req, res) => res.end('original-service'));
  original.listen(0, '127.0.0.1');
  await once(original, 'listening');
  const port = original.address().port;
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1' }] });
  try {
    await fixture.instance.start();
    assert.equal(fixture.instance.server?.listening, true);
    assert.notEqual(fixture.instance.actualPort, port);
    assert.match(fixture.instance.startNotice, /已被占用/);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'original-service');
  } finally {
    await fixture.dispose();
    original.closeAllConnections();
    await new Promise((done) => original.close(done));
  }
});

test('LAN mode refuses to start without a client key', async () => {
  const fixture = runtime({ listen: { enabled: true, host: '0.0.0.0', port: 19529, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1' }] });
  try {
    await fixture.instance.start();
    assert.equal(fixture.instance.server, undefined);
    assert.match(fixture.instance.startError, /requires CLIENT_KEY/);
  } finally { await fixture.dispose(); }
});
