import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ChannelRouter, RelayRuntime, managementHandler, normalizeConfig } from '../index.js';

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
  const dir = mkdtempSync(join(tmpdir(), 'cockpit-relay-test-'));
  const ctx = { credentials: credentials(credentialValues) };
  const instance = new RelayRuntime(ctx, normalizeConfig(config), join(dir, 'cockpit-relay.json'));
  return { instance, ctx, dir, dispose: async () => { await instance.stop(); rmSync(dir, { recursive: true, force: true }); } };
}

async function withServer(handler, run) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try { return await run(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

async function management(runtime, path, init) {
  return withServer((req, res) => managementHandler(req, res, runtime), async (url) => {
    const response = await fetch(`${url}/api/cockpit-relay${path}`, { headers: { 'content-type': 'application/json' }, ...init });
    return { status: response.status, body: await response.json() };
  });
}

test('models endpoint never exposes upstream secrets', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1', apiKeyEnv: 'CLIENT_KEY' }, routes: [{ id: 'a', displayName: 'A', baseURL: 'https://a.invalid/v1', apiKeyEnv: 'SECRET_ENV_NAME', models: ['gpt-test'] }] }, { SECRET_ENV_NAME: 'sk-secret' });
  try {
    await withServer((req, res) => fixture.instance.handleRelay(req, res), async (url) => {
      const response = await fetch(`${url}/v1/models`);
      const text = await response.text();
      assert.equal(response.status, 200);
      assert.match(text, /gpt-test/);
      assert.doesNotMatch(text, /sk-secret|authorization|apiKey/i);
    });
  } finally { await fixture.dispose(); }
});

test('chat endpoint fails over and preserves streaming bytes', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1', apiKeyEnv: 'CLIENT_KEY' }, routes: [{ id: 'cheap', baseURL: 'https://cheap.invalid/v1', models: ['gpt-test'], priority: 100 }, { id: 'backup', baseURL: 'https://backup.invalid/v1', models: ['gpt-test'], priority: 1, backup: true }] });
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
    assert.equal(fixture.instance.logs[0].routeId, 'backup');
  } finally { await fixture.dispose(); }
});

test('request logs redact URLs and secret-shaped values', async () => {
  const fixture = runtime({ listen: { enabled: false }, routes: [{ id: 'a', displayName: 'A', baseURL: 'https://secret.example/v1', headers: { 'x-private': 'hidden' } }] });
  try {
    fixture.instance.recordAttempt({ route: fixture.instance.config.routes[0], model: 'gpt-test', ok: false, status: 0, latencyMs: 4, error: new Error('fetch https://secret.example/v1 failed Bearer sk-test-secret-value') });
    const state = await fixture.instance.state();
    assert.equal('headers' in state.routes[0], false);
    assert.doesNotMatch(fixture.instance.logs[0].error, /secret\.example|sk-test-secret-value/);
  } finally { await fixture.dispose(); }
});

test('management API stores keys through credential service without serializing them', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1', apiKeyEnv: 'CLIENT_KEY' }, routes: [] });
  try {
    const response = await management(fixture.instance, '/routes', { method: 'POST', body: JSON.stringify({ id: 'cheap-a', displayName: 'Cheap A', baseURL: 'https://a.invalid/v1', apiKey: 'sk-private', models: ['gpt-test'] }) });
    assert.equal(response.status, 200);
    assert.equal(response.body.routes[0].keyConfigured, true);
    assert.equal(fixture.ctx.credentials.store.get('COCKPIT_RELAY_CHEAP_A_KEY'), 'sk-private');
    const persisted = readFileSync(join(fixture.dir, 'cockpit-relay.json'), 'utf8');
    assert.doesNotMatch(persisted, /sk-private/);
    assert.match(persisted, /COCKPIT_RELAY_CHEAP_A_KEY/);
  } finally { await fixture.dispose(); }
});

test('service is enabled by default and can be disabled through management API', async () => {
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY' }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1' }] });
  try {
    await fixture.instance.start();
    assert.equal(fixture.instance.server?.listening, true);
    const response = await management(fixture.instance, '/service', { method: 'PUT', body: JSON.stringify({ enabled: false, host: '127.0.0.1', port: 19529, apiKeyEnv: 'CLIENT_KEY' }) });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.service.enabled, false);
    assert.equal(fixture.instance.server, undefined);
  } finally { await fixture.dispose(); }
});

test('browser-origin requests cannot use an unkeyed local service', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1', apiKeyEnv: 'CLIENT_KEY' }, routes: [] });
  try {
    await withServer((req, res) => fixture.instance.handleRelay(req, res), async (url) => {
      const response = await fetch(`${url}/v1/models`, { headers: { origin: 'http://evil.example' } });
      assert.equal(response.status, 401);
    });
  } finally { await fixture.dispose(); }
});

test('occupied port falls back without stopping the existing service', async () => {
  const original = createServer((_req, res) => res.end('original-cockpit'));
  original.listen(0, '127.0.0.1');
  await once(original, 'listening');
  const port = original.address().port;
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port, apiKeyEnv: 'CLIENT_KEY' }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1' }] });
  try {
    await fixture.instance.start();
    assert.equal(fixture.instance.server?.listening, true);
    assert.notEqual(fixture.instance.actualPort, port);
    assert.match(fixture.instance.startNotice, /already in use/);
    assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'original-cockpit');
    assert.equal((await fixture.instance.state()).service.baseURL, `http://127.0.0.1:${fixture.instance.actualPort}/v1`);
  } finally {
    await fixture.dispose();
    original.closeAllConnections();
    await new Promise((done) => original.close(done));
  }
});

test('LAN mode refuses to start without a client key', async () => {
  const fixture = runtime({ listen: { enabled: true, host: '0.0.0.0', port: 19529, apiKeyEnv: 'CLIENT_KEY' }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1' }] });
  try {
    await fixture.instance.start();
    assert.equal(fixture.instance.server, undefined);
    assert.match(fixture.instance.startError, /requires CLIENT_KEY/);
  } finally { await fixture.dispose(); }
});
