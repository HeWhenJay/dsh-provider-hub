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

function settings(value = { providers: {} }) {
  let section = structuredClone(value);
  const calls = [];
  let revision = 0;
  let beforeMutate;
  return {
    calls,
    get(ns) { return ns === 'llm-pi-ai' ? structuredClone(section) : undefined; },
    describe() { return [{ ns: 'llm-pi-ai', value: structuredClone(section), user: structuredClone(section), revision }]; },
    async mutate(ns, ops, expectedRevision) {
      if (beforeMutate) { const hook = beforeMutate; beforeMutate = undefined; hook(); }
      if (expectedRevision !== revision) throw Object.assign(new Error('settings changed'), { name: 'SettingsConflictError' });
      assert.equal(ns, 'llm-pi-ai');
      calls.push(structuredClone(ops));
      for (const op of ops) {
        let parent = section;
        for (const part of op.path.slice(0, -1)) parent = parent[part] ??= {};
        const key = op.path.at(-1);
        if (op.op === 'set') parent[key] = structuredClone(op.value);
        else delete parent[key];
      }
      revision += 1;
    },
    replaceSection(value) { section = structuredClone(value); revision += 1; },
    beforeNextMutate(callback) { beforeMutate = callback; },
    snapshot() { return structuredClone(section); }
  };
}

function runtime(config, credentialValues = {}, settingsService, services = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'provider-hub-test-'));
  const ctx = {
    credentials: credentials(credentialValues),
    reflect: { get(name) { return name === 'settings' ? settingsService : services[name]; } }
  };
  const instance = new RelayRuntime(ctx, normalizeConfig(config), join(dir, 'provider-hub.json'));
  return { instance, ctx, dir, settings: settingsService, dispose: async () => { await instance.dispose(); rmSync(dir, { recursive: true, force: true }); } };
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

test('models endpoint applies route allowlists without exposing upstream secrets', async () => {
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

test('blank model allowlist serves every discovered model while a populated allowlist filters per API key', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1' }, accountService: { enabled: false }, routes: [
    { id: 'all', keyName: 'All Models Key', baseURL: 'https://same.invalid/v1', models: ['gpt-a', 'gpt-b'], modelAllowlist: [], priority: 10 },
    { id: 'only-b', keyName: 'B Only Key', baseURL: 'https://same.invalid/v1', models: ['gpt-a', 'gpt-b'], modelAllowlist: ['gpt-b'], priority: 20 }
  ] });
  try {
    assert.deepEqual(fixture.instance.router.candidates('gpt-a').map((route) => route.id), ['all']);
    assert.deepEqual(fixture.instance.router.candidates('gpt-b').map((route) => route.id), ['only-b', 'all']);
    assert.equal(fixture.instance.config.routes[0].baseURL, fixture.instance.config.routes[1].baseURL);
  } finally { await fixture.dispose(); }
});

test('an allowlisted public alias appears in catalogs and routes to its upstream model id', async () => {
  const settingsService = settings();
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'alias', baseURL: 'https://alias.invalid/v1', models: ['vendor-model'], modelAllowlist: ['public-model'], modelAliases: { 'public-model': 'vendor-model' } }] }, {}, settingsService);
  try {
    await fixture.instance.start();
    const key = fixture.ctx.credentials.store.get('DSH_PROVIDER_HUB_CLIENT_KEY');
    const models = await (await fetch(`${fixture.instance.relayBaseURL()}/models`, { headers: { authorization: `Bearer ${key}` } })).json();
    assert.deepEqual(models.data.map((model) => model.id), ['public-model']);
    assert.deepEqual(settingsService.snapshot().providers['provider-hub'].models.map((model) => model.id), ['public-model']);
    assert.deepEqual(fixture.instance.router.candidates('public-model').map((route) => route.id), ['alias']);
  } finally { await fixture.dispose(); }
});

test('models endpoint and managed DSH provider expose only the union of effective per-key models', async () => {
  const settingsService = settings();
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [
    { id: 'key-a', baseURL: 'https://same.invalid/v1', models: ['gpt-a', 'gpt-b', 'gpt-hidden'], modelAllowlist: ['gpt-a'] },
    { id: 'key-b', baseURL: 'https://same.invalid/v1', models: ['gpt-a', 'gpt-b', 'gpt-hidden'], modelAllowlist: ['gpt-b'] }
  ] }, {}, settingsService);
  try {
    await fixture.instance.start();
    const key = fixture.ctx.credentials.store.get('DSH_PROVIDER_HUB_CLIENT_KEY');
    const response = await fetch(`${fixture.instance.relayBaseURL()}/models`, { headers: { authorization: `Bearer ${key}` } });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).data.map((model) => model.id), ['gpt-a', 'gpt-b']);
    assert.deepEqual(settingsService.snapshot().providers['provider-hub'].models.map((model) => model.id), ['gpt-a', 'gpt-b']);
  } finally { await fixture.dispose(); }
});

test('route logs expose API key names but never credential references or values', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', displayName: 'Shared URL', keyName: 'Production Key', baseURL: 'https://same.invalid/v1', apiKeyEnv: 'SECRET_REF', models: ['gpt-test'] }] }, { SECRET_REF: 'sk-private-value' });
  try {
    fixture.instance.recordAttempt({ route: fixture.instance.config.routes[0], model: 'gpt-test', ok: true, status: 200, latencyMs: 9 });
    assert.equal(fixture.instance.logs[0].keyName, 'Production Key');
    assert.equal(JSON.stringify(fixture.instance.logs).includes('SECRET_REF'), false);
    assert.equal(JSON.stringify(fixture.instance.logs).includes('sk-private-value'), false);
  } finally { await fixture.dispose(); }
});

test('route tests reject models outside the API key allowlist before contacting upstream', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://same.invalid/v1', models: ['allowed', 'blocked'], modelAllowlist: ['allowed'] }] });
  let contacted = false;
  fixture.instance.transport = async () => { contacted = true; return new Response('{}'); };
  try {
    await assert.rejects(() => fixture.instance.testRoute('a', 'blocked'), /not allowed for this API key/);
    assert.equal(contacted, false);
  } finally { await fixture.dispose(); }
});

test('legacy routes migrate display names into key names without changing credential refs', () => {
  const config = normalizeConfig({ accountService: { enabled: false }, routes: [{ id: 'legacy', displayName: 'Legacy Key', baseURL: 'https://same.invalid/v1', apiKeyEnv: 'LEGACY_SECRET', models: ['gpt-test'] }] });
  assert.equal(config.routes[0].keyName, 'Legacy Key');
  assert.deepEqual(config.routes[0].modelAllowlist, []);
  assert.equal(config.routes[0].apiKeyEnv, 'LEGACY_SECRET');
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

test('non-stream relay logs provider usage, timing, cost and redacted request metadata', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1' }, accountService: { enabled: false }, routes: [{ id: 'metered', keyName: 'Metered Key', baseURL: 'https://metered.invalid/v1', apiKeyEnv: 'METERED_KEY', models: ['gpt-test'], modelPricing: { 'gpt-test': { inputPerMillion: 1, cachedInputPerMillion: 0.1, outputPerMillion: 2, reasoningPerMillion: 3, currency: 'USD' } } }] }, { METERED_KEY: 'super-secret' });
  fixture.instance.transport = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 40 }, completion_tokens_details: { reasoning_tokens: 5 } } }), { status: 200, headers: { 'content-type': 'application/json' } });
  try {
    await withServer((req, res) => fixture.instance.handleRelay(req, res), async (url) => {
      const response = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': 'request-safe-id' }, body: JSON.stringify({ model: 'gpt-test', messages: [{ role: 'user', content: 'private prompt text' }], max_tokens: 32, stream: false }) });
      assert.equal(response.status, 200);
      await response.text();
    });
    const log = fixture.instance.logs[0];
    assert.equal(log.requestId, 'request-safe-id');
    assert.equal(log.keyName, 'Metered Key');
    assert.equal(log.inputTokens, 100);
    assert.equal(log.cachedInputTokens, 40);
    assert.equal(log.outputTokens, 20);
    assert.equal(log.reasoningTokens, 5);
    assert.equal(log.totalTokens, 120);
    assert.equal(log.usageSource, 'provider-reported');
    assert.equal(log.finishReason, 'stop');
    assert.equal(log.costSource, 'route-pricing');
    assert.equal(log.cost, 0.000109);
    assert.equal(log.messageCount, 1);
    assert.equal(log.requestedMaxTokens, 32);
    assert.equal(JSON.stringify(log).includes('private prompt text'), false);
    assert.equal(JSON.stringify(log).includes('super-secret'), false);
    assert.deepEqual(fixture.instance.logSummary().costByCurrency, { USD: 0.000109 });
  } finally { await fixture.dispose(); }
});

test('stream relay logs first-token latency and provider-reported cost without changing SSE bytes', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1' }, accountService: { enabled: false }, routes: [{ id: 'stream', keyName: 'Stream Key', baseURL: 'https://stream.invalid/v1', models: ['gpt-test'] }] });
  const sse = 'data: {"choices":[{"delta":{"content":"O"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{"content":"K"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12},"cost":0.0007}\n\ndata: [DONE]\n\n';
  fixture.instance.transport = async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  try {
    await withServer((req, res) => fixture.instance.handleRelay(req, res), async (url) => {
      const response = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-test', messages: [{ role: 'user', content: 'hello' }], stream: true }) });
      assert.equal(await response.text(), sse);
    });
    const log = fixture.instance.logs[0];
    assert.equal(log.inputTokens, 10);
    assert.equal(log.outputTokens, 2);
    assert.equal(log.totalTokens, 12);
    assert.equal(log.cost, 0.0007);
    assert.equal(log.costSource, 'provider-reported');
    assert.equal(log.finishReason, 'stop');
    assert.ok(log.timeToFirstTokenMs >= 0);
    assert.ok(log.totalLatencyMs >= log.timeToFirstTokenMs);
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

test('management API persists API key names and model allowlists independently for the same URL', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [] });
  try {
    const first = await management(fixture.instance, '/routes', { method: 'POST', body: JSON.stringify({ id: 'same-prod', displayName: 'Shared API', keyName: 'Production Key', baseURL: 'https://same.invalid/v1', apiKey: 'sk-prod', models: ['gpt-a', 'gpt-b'], modelAllowlist: ['gpt-a'] }) });
    const second = await management(fixture.instance, '/routes', { method: 'POST', body: JSON.stringify({ id: 'same-backup', displayName: 'Shared API', keyName: 'Backup Key', baseURL: 'https://same.invalid/v1', apiKey: 'sk-backup', models: ['gpt-a', 'gpt-b'], modelAllowlist: ['gpt-b'] }) });
    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(second.body.routes[0].baseURL, second.body.routes[1].baseURL);
    assert.deepEqual(second.body.routes.map((route) => route.keyName), ['Production Key', 'Backup Key']);
    assert.deepEqual(second.body.routes.map((route) => route.modelAllowlist), [['gpt-a'], ['gpt-b']]);
    const persisted = readFileSync(join(fixture.dir, 'provider-hub.json'), 'utf8');
    assert.doesNotMatch(persisted, /sk-prod|sk-backup/);
  } finally { await fixture.dispose(); }
});

test('management API persists normalized per-model pricing without secrets', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [] });
  try {
    const response = await management(fixture.instance, '/routes', { method: 'POST', body: JSON.stringify({ id: 'priced', displayName: 'Priced', baseURL: 'https://priced.invalid/v1', models: ['gpt-test'], modelPricing: { 'gpt-test': { inputPerMillion: '1.25', cachedInputPerMillion: 0.125, outputPerMillion: 10, reasoningPerMillion: 12, currency: 'usd' } } }) });
    assert.equal(response.status, 200);
    assert.deepEqual(fixture.instance.config.routes[0].modelPricing['gpt-test'], { inputPerMillion: 1.25, outputPerMillion: 10, cachedInputPerMillion: 0.125, reasoningPerMillion: 12, currency: 'USD' });
    const persisted = readFileSync(join(fixture.dir, 'provider-hub.json'), 'utf8');
    assert.match(persisted, /"inputPerMillion": 1.25/);
    assert.doesNotMatch(persisted, /apiKey\s*:/i);
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

test('first service start generates a prefixed client key in credentials and exposes it until acknowledged', async () => {
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [] });
  try {
    await fixture.instance.start();
    const generated = fixture.ctx.credentials.store.get('CLIENT_KEY');
    assert.match(generated, /^Provider-Hub-[A-Za-z0-9_-]{40,}$/);
    const first = await fixture.instance.state();
    assert.equal(first.service.generatedApiKey, generated);
    assert.equal(first.service.keyConfigured, true);
    assert.equal(JSON.stringify(fixture.instance.config).includes(generated), false);
    const acknowledged = await management(fixture.instance, '/service/generated-key/acknowledge', { method: 'POST', body: '{}' });
    assert.equal(acknowledged.status, 200);
    assert.equal((await fixture.instance.state()).service.generatedApiKey, undefined);
    await fixture.instance.stop();
    await fixture.instance.start();
    assert.equal(fixture.ctx.credentials.store.get('CLIENT_KEY'), generated);
    assert.equal((await fixture.instance.state()).service.generatedApiKey, undefined);
  } finally { await fixture.dispose(); }
});

test('a user can replace the generated client key through service settings', async () => {
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [] });
  try {
    await fixture.instance.start();
    const response = await fixture.instance.saveService({ enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY', apiKey: 'user-selected-key' });
    assert.equal(fixture.ctx.credentials.store.get('CLIENT_KEY'), 'user-selected-key');
    assert.equal(response.service.generatedApiKey, undefined);
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

test('loopback host requests may omit auth while browser-origin requests still require the key', async () => {
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [] });
  try {
    await fixture.instance.start();
    assert.equal((await fetch(`${fixture.instance.relayBaseURL()}/models`)).status, 200);
    assert.equal((await fetch(`${fixture.instance.relayBaseURL()}/models`, { headers: { origin: 'http://evil.example' } })).status, 401);
  } finally { await fixture.dispose(); }
});

test('local relay requires auth for a non-loopback peer or forwarded request', async () => {
  const fixture = runtime({ listen: { enabled: false, host: '127.0.0.1', apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [] });
  const request = (headers = {}, remoteAddress = '10.0.0.5') => ({ headers, socket: { remoteAddress } });
  try {
    assert.equal(await fixture.instance.clientAuthorized(request()), false);
    assert.equal(await fixture.instance.clientAuthorized(request({ forwarded: 'for=10.0.0.5' }, '127.0.0.1')), false);
    assert.equal(await fixture.instance.clientAuthorized(request({}, '127.0.0.1')), true);
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

test('LAN mode automatically generates a client key before listening', async () => {
  const fixture = runtime({ listen: { enabled: true, host: '0.0.0.0', port: 0, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1' }] });
  try {
    await fixture.instance.start();
    assert.equal(fixture.instance.server?.listening, true);
    assert.match(fixture.ctx.credentials.store.get('CLIENT_KEY'), /^Provider-Hub-/);
    assert.equal(fixture.instance.startError, undefined);
  } finally { await fixture.dispose(); }
});

test('concurrent service saves serialize lifecycle and leave exactly one tracked listener', async () => {
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-a'] }] });
  try {
    await fixture.instance.start();
    const [first, second] = await Promise.all([
      fixture.instance.saveService({ enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY' }),
      fixture.instance.saveService({ enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY' })
    ]);
    assert.equal(first.service.running, true);
    assert.equal(second.service.running, true);
    assert.equal(fixture.instance.server?.listening, true);
    const port = fixture.instance.actualPort;
    const key = fixture.ctx.credentials.store.get('CLIENT_KEY');
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`, { headers: { authorization: `Bearer ${key}` } })).status, 200);
    await fixture.instance.stop();
    await assert.rejects(fetch(`http://127.0.0.1:${port}/health`));
  } finally { await fixture.dispose(); }
});

test('managed DSH provider references the generated relay credential in loopback mode', async () => {
  const settingsService = settings();
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-a'] }] }, { CLIENT_KEY: 'ph-client-secret' }, settingsService);
  try {
    await fixture.instance.start();
    assert.equal(settingsService.snapshot().providers['provider-hub'].apiKeyEnv, 'CLIENT_KEY');
    assert.equal(fixture.instance.managedProviderState.keyConfigured, true);
  } finally { await fixture.dispose(); }
});

test('managed DSH provider uses the actual fallback port and preserves unrelated providers', async () => {
  const occupied = createServer((_req, res) => res.end('keep-running'));
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  const preferredPort = occupied.address().port;
  const settingsService = settings({ providers: { 'local-cockpit': { baseURL: 'http://127.0.0.1:58966/v1', api: 'openai-completions', models: [{ id: 'gpt-existing' }] }, fastapi: { baseURL: 'https://fastapi.invalid/v1', api: 'openai-completions', models: [{ id: 'gpt-fast' }] } } });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: preferredPort, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'a', displayName: 'A', baseURL: 'https://a.invalid/v1', models: ['gpt-a', 'gpt-shared'] }, { id: 'b', displayName: 'B', baseURL: 'https://b.invalid/v1', models: ['gpt-shared', 'gpt-b'] }] }, {}, settingsService);
  try {
    await fixture.instance.start();
    const providers = settingsService.snapshot().providers;
    assert.notEqual(fixture.instance.actualPort, preferredPort);
    assert.equal(providers['provider-hub'].baseURL, `http://127.0.0.1:${fixture.instance.actualPort}/v1`);
    assert.equal(providers['provider-hub'].api, 'openai-completions');
    assert.equal(providers['provider-hub'].apiKeyEnv, 'CLIENT_KEY');
    assert.deepEqual(providers['provider-hub'].models.map((model) => model.id), ['gpt-a', 'gpt-shared', 'gpt-b']);
    assert.equal(providers['local-cockpit'].models[0].id, 'gpt-existing');
    assert.equal(providers.fastapi.models[0].id, 'gpt-fast');
    assert.equal(fixture.instance.managedProviderState.status, 'synced');
    assert.equal(await (await fetch(`http://127.0.0.1:${preferredPort}`)).text(), 'keep-running');
  } finally {
    await fixture.dispose();
    occupied.closeAllConnections();
    await new Promise((done) => occupied.close(done));
  }
});

test('managed DSH provider includes the credential ref for loopback and LAN', async () => {
  const loopbackSettings = settings();
  const loopback = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-a'] }] }, { CLIENT_KEY: 'ph-client-secret' }, loopbackSettings);
  const lanSettings = settings();
  const lan = runtime({ listen: { enabled: true, host: '0.0.0.0', port: 0, apiKeyEnv: 'CLIENT_KEY' }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-a'] }] }, { CLIENT_KEY: 'ph-client-secret' }, lanSettings);
  try {
    await loopback.instance.start();
    assert.equal(loopbackSettings.snapshot().providers['provider-hub'].apiKeyEnv, 'CLIENT_KEY');
    await lan.instance.start();
    assert.equal(lanSettings.snapshot().providers['provider-hub'].apiKeyEnv, 'CLIENT_KEY');
  } finally { await loopback.dispose(); await lan.dispose(); }
});

test('managed DSH provider removes only its owned entry when models become empty', async () => {
  const settingsService = settings({ providers: { fastapi: { baseURL: 'https://fastapi.invalid/v1', api: 'openai-completions', models: [{ id: 'gpt-fast' }] } } });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-a'] }] }, {}, settingsService);
  try {
    await fixture.instance.start();
    assert.ok(settingsService.snapshot().providers['provider-hub']);
    fixture.instance.config.routes[0].models = [];
    fixture.instance.refreshRouter();
    await fixture.instance.syncManagedProvider();
    const providers = settingsService.snapshot().providers;
    assert.equal(providers['provider-hub'], undefined);
    assert.equal(providers.fastapi.models[0].id, 'gpt-fast');
    assert.equal(fixture.instance.managedProviderState.status, 'pending');
  } finally { await fixture.dispose(); }
});

test('stopping the relay removes its owned DSH provider without touching peers', async () => {
  const settingsService = settings({ providers: { fastapi: { baseURL: 'https://fastapi.invalid/v1', api: 'openai-completions', models: [{ id: 'gpt-fast' }] } } });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-a'] }] }, {}, settingsService);
  try {
    await fixture.instance.start();
    assert.ok(settingsService.snapshot().providers['provider-hub']);
    await fixture.instance.stop();
    assert.equal(settingsService.snapshot().providers['provider-hub'], undefined);
    assert.equal(settingsService.snapshot().providers.fastapi.models[0].id, 'gpt-fast');
  } finally { await fixture.dispose(); }
});

test('managed DSH provider does not overwrite an unowned conflicting route', async () => {
  const userProvider = { displayName: 'User Provider Hub', baseURL: 'https://user.invalid/v1', api: 'openai-completions', models: [{ id: 'gpt-user' }] };
  const settingsService = settings({ providers: { 'provider-hub': userProvider, fastapi: { baseURL: 'https://fastapi.invalid/v1', api: 'openai-completions', models: [{ id: 'gpt-fast' }] } } });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-a'] }] }, {}, settingsService);
  try {
    await fixture.instance.start();
    assert.deepEqual(settingsService.snapshot().providers['provider-hub'], userProvider);
    assert.equal(settingsService.calls.length, 0);
    assert.equal(fixture.instance.managedProviderState.status, 'conflict');
  } finally { await fixture.dispose(); }
});

test('an external edit to an owned provider causes a conflict instead of being reverted', async () => {
  const settingsService = settings();
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-a'] }] }, {}, settingsService);
  try {
    await fixture.instance.start();
    const edited = settingsService.snapshot();
    edited.providers['provider-hub'].displayName = 'User Edited Provider Hub';
    settingsService.replaceSection(edited);
    await fixture.instance.syncManagedProvider();
    assert.equal(settingsService.snapshot().providers['provider-hub'].displayName, 'User Edited Provider Hub');
    assert.equal(fixture.instance.managedProviderState.status, 'conflict');
  } finally { await fixture.dispose(); }
});

test('settings revision conflict is re-read and a new user provider is never overwritten', async () => {
  const settingsService = settings({ providers: {} });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-a'] }] }, {}, settingsService);
  const userProvider = { displayName: 'Concurrent User Provider', baseURL: 'https://user.invalid/v1', api: 'openai-completions', models: [{ id: 'gpt-user' }] };
  settingsService.beforeNextMutate(() => settingsService.replaceSection({ providers: { 'provider-hub': userProvider } }));
  try {
    await fixture.instance.start();
    assert.deepEqual(settingsService.snapshot().providers['provider-hub'], userProvider);
    assert.equal(fixture.instance.managedProviderState.status, 'conflict');
  } finally { await fixture.dispose(); }
});

test('route model metadata survives save and aggregate synchronization', async () => {
  const settingsService = settings();
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [] }, {}, settingsService);
  try {
    await fixture.instance.start();
    await fixture.instance.saveRoute({ id: 'a', baseURL: 'https://a.invalid/v1', models: [{ id: 'gpt-rich', name: 'GPT Rich', contextWindow: 128000, maxTokens: 16384 }] });
    assert.deepEqual(fixture.instance.config.routes[0].modelMetadata['gpt-rich'], { id: 'gpt-rich', name: 'GPT Rich', contextWindow: 128000, maxTokens: 16384 });
    assert.deepEqual(settingsService.snapshot().providers['provider-hub'].models, [{ id: 'gpt-rich', name: 'GPT Rich', contextWindow: 128000, maxTokens: 16384 }]);
  } finally { await fixture.dispose(); }
});

test('managed provider model metadata survives aggregate synchronization', async () => {
  const settingsService = settings();
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: true, autoInstall: false }, routes: [] }, {}, settingsService);
  fixture.instance.sidecar.phase = 'running';
  fixture.instance.sidecar.port = 21999;
  fixture.instance.sidecar.models = [{ id: 'gpt-account', name: 'GPT Account', contextWindow: 131072, maxTokens: 8192 }];
  fixture.instance.refreshRouter();
  try {
    await fixture.instance.start();
    assert.deepEqual(settingsService.snapshot().providers['provider-hub'].models, [{ id: 'gpt-account', name: 'GPT Account', contextWindow: 131072, maxTokens: 8192 }]);
  } finally {
    fixture.instance.sidecar.phase = 'stopped';
    fixture.instance.sidecar.port = undefined;
    fixture.instance.sidecar.models = [];
    await fixture.dispose();
  }
});

function researchServices(responseText, sources = [{ url: 'https://platform.openai.com/docs/models/gpt-test', title: 'GPT Test', snippet: 'gpt-test 128000 context window; 16384 maximum output; reasoning effort low, medium, high.' }]) {
  return {
    web: { async search() { return { sources, truncated: false }; } },
    providerHubResearchFetch: { async fetch(source) { return source; } },
    llm: {
      async *stream() {
        yield { type: 'text-delta', index: 0, text: responseText };
        yield { type: 'finish', reason: { kind: 'stop' } };
      }
    },
    agentDefaultModel: { currentSelection() { return { provider: 'local-cockpit', model: 'research-model' }; } }
  };
}

test('research selection uses the first configured API key text model and excludes image models', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [
    { id: 'first', keyName: 'First Key', baseURL: 'https://first.invalid/v1', apiKeyEnv: 'FIRST_KEY', models: ['gpt-image-2', 'gpt-text'] },
    { id: 'second', keyName: 'Second Key', baseURL: 'https://second.invalid/v1', apiKeyEnv: 'SECOND_KEY', models: ['gpt-other'] }
  ] }, { FIRST_KEY: 'secret-a', SECOND_KEY: 'secret-b' }, undefined, researchServices('{}'));
  try {
    const state = await fixture.instance.specificationResearchState();
    assert.deepEqual(state.selections.map((item) => [item.routeId, item.model]), [['first', 'gpt-text'], ['second', 'gpt-other']]);
    assert.equal(state.selection.routeId, 'first');
    assert.equal(state.selection.model, 'gpt-text');
  } finally { await fixture.dispose(); }
});

test('two independent community sources with matching values can provide a specification field', async () => {
  const sources = [
    { url: 'https://blog-one.example/models/gpt-test', title: 'Model guide gpt-test', snippet: 'gpt-test has a 128000 context window.' },
    { url: 'https://catalog-two.example/gpt-test', title: 'Community catalog gpt-test', snippet: 'gpt-test context window: 128000 tokens.' }
  ];
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: null, reasoningEfforts: null, sources: sources.map((source) => source.url) });
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, undefined, researchServices(response, sources));
  try {
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'].contextWindow, 128000);
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'].evidenceType, 'community-consensus');
    assert.deepEqual(fixture.instance.config.modelSpecifications['gpt-test'].fieldEvidence.contextWindow.sources, sources.map((source) => source.url));
  } finally { await fixture.dispose(); }
});

test('a source number belonging to another model cannot prove the requested model field', async () => {
  const sources = [
    { url: 'https://blog-one.example/models', title: 'Model directory', snippet: 'gpt-test overview. another-model has a 128000 context window.' },
    { url: 'https://catalog-two.example/models', title: 'Catalog', snippet: 'gpt-test overview. another-model context window is 128000 tokens.' }
  ];
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: null, reasoningEfforts: null, sources: sources.map((source) => source.url) });
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, undefined, researchServices(response, sources));
  try {
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'], undefined);
  } finally { await fixture.dispose(); }
});

test('one community source alone cannot establish a model specification field', async () => {
  const sources = [{ url: 'https://single-blog.example/gpt-test', title: 'gpt-test model guide', snippet: 'gpt-test context window is 128000 tokens.' }];
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: null, reasoningEfforts: null, sources: sources.map((source) => source.url) });
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, undefined, researchServices(response, sources));
  try {
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'], undefined);
    assert.equal(fixture.instance.specResearch.skipped, 1);
  } finally { await fixture.dispose(); }
});

test('community subdomains of one registrable domain do not count as independent sources', async () => {
  const sources = [
    { url: 'https://docs.same.example/gpt-test', title: 'gpt-test docs', snippet: 'gpt-test context window is 128000 tokens.' },
    { url: 'https://blog.same.example/gpt-test', title: 'gpt-test blog', snippet: 'gpt-test context window is 128000 tokens.' }
  ];
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: null, reasoningEfforts: null, sources: sources.map((source) => source.url) });
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, undefined, researchServices(response, sources));
  try {
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'], undefined);
  } finally { await fixture.dispose(); }
});

test('field provenance survives configuration normalization', async () => {
  const raw = { modelSpecifications: { 'gpt-test': { id: 'gpt-test', contextWindow: 128000, evidenceType: 'community-consensus', fieldEvidence: { contextWindow: { type: 'community-consensus', sources: ['https://blog-one.example/gpt-test', 'https://catalog-two.example/gpt-test'] } }, sources: ['https://blog-one.example/gpt-test'] } } };
  const normalized = normalizeConfig(raw);
  assert.equal(normalized.modelSpecifications['gpt-test'].evidenceType, 'community-consensus');
  assert.deepEqual(normalized.modelSpecifications['gpt-test'].fieldEvidence.contextWindow.sources, raw.modelSpecifications['gpt-test'].fieldEvidence.contextWindow.sources);
});

test('explicit research route and model selection is never silently replaced', async () => {
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'first', baseURL: 'https://first.invalid/v1', apiKeyEnv: 'FIRST_KEY', models: ['gpt-test'] }] }, { FIRST_KEY: 'secret' }, undefined, researchServices('{}'));
  try {
    await assert.rejects(() => fixture.instance.startSpecificationResearch({ routeId: 'missing', model: 'gpt-test' }), /unavailable/);
    await assert.rejects(() => fixture.instance.startSpecificationResearch({ routeId: 'first', model: 'other-model' }), /unavailable/);
  } finally { await fixture.dispose(); }
});

test('selected Responses API research uses the selected route directly', async () => {
  const sources = [{ url: 'https://platform.openai.com/docs/models/gpt-test', title: 'gpt-test', snippet: 'gpt-test context window 128000.' }];
  const responseText = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: null, reasoningEfforts: null, sources: [sources[0].url] });
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'responses', baseURL: 'https://responses.invalid/v1', api: 'openai-responses', apiKeyEnv: 'RESPONSES_KEY', models: ['gpt-test'] }] }, { RESPONSES_KEY: 'secret' }, undefined, researchServices(responseText, sources));
  const calls = [];
  fixture.instance.transport = async (route, model, request) => { calls.push({ route: route.id, model, endpoint: request.endpoint, body: request.body }); return new Response(JSON.stringify({ output_text: responseText }), { status: 200, headers: { 'content-type': 'application/json' } }); };
  try {
    await fixture.instance.startSpecificationResearch({ routeId: 'responses', model: 'gpt-test' });
    await fixture.instance.specResearchPromise;
    assert.deepEqual(calls.map((call) => [call.route, call.model, call.endpoint]), [['responses', 'gpt-test', 'responses']]);
    assert.equal(calls[0].body.max_output_tokens, 1600);
    assert.equal(typeof calls[0].body.input, 'string');
  } finally { await fixture.dispose(); }
});

test('saving a route automatically starts missing specification enrichment once', async () => {
  const settingsService = settings();
  let searches = 0;
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: null, reasoningEfforts: null, sources: ['https://platform.openai.com/docs/models/gpt-test'] });
  const services = researchServices(response, [{ url: 'https://platform.openai.com/docs/models/gpt-test', title: 'GPT Test', snippet: 'gpt-test 128000 context window.' }]);
  services.web.search = async () => { searches += 1; return { sources: [{ url: 'https://platform.openai.com/docs/models/gpt-test', title: 'GPT Test', snippet: 'gpt-test 128000 context window.' }], truncated: false }; };
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [] }, {}, settingsService, services);
  try {
    await fixture.instance.start();
    const state = await fixture.instance.saveRoute({ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] });
    assert.equal(state.modelResearch.phase, 'running');
    assert.equal(state.modelResearch.automatic, true);
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'].contextWindow, 128000);
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'].maxTokens, undefined);
    await fixture.instance.saveRoute({ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] });
    assert.equal(searches, 3);
  } finally { await fixture.dispose(); }
});

test('manual retry runs again after automatic enrichment lacks evidence', async () => {
  const settingsService = settings();
  let searches = 0;
  const services = researchServices('{}', []);
  services.web.search = async () => { searches += 1; return { sources: [], truncated: false }; };
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [] }, {}, settingsService, services);
  try {
    await fixture.instance.start();
    await fixture.instance.saveRoute({ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] });
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.specResearch.skipped, 1);
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(searches, 6);
  } finally { await fixture.dispose(); }
});

test('one-click research fetches source pages and fills specifications through the management API', async () => {
  const settingsService = settings();
  const source = { url: 'https://platform.openai.com/docs/models/gpt-test', title: 'GPT Test official model page', snippet: 'Official details for gpt-test.' };
  const response = JSON.stringify({ id: 'gpt-test', name: 'GPT Test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: { low: 'low', medium: 'medium', high: 'high' }, compat: { thinkingFormat: 'openai', supportsReasoningEffort: true }, sources: [source.url] });
  const services = researchServices(response, [source]);
  let searches = 0;
  let fetches = 0;
  services.web.search = async () => { searches += 1; return { sources: [source], truncated: false }; };
  services.providerHubResearchFetch.fetch = async (item) => { fetches += 1; return { ...item, content: 'gpt-test has a 128000 context window and 16384 maximum output tokens. gpt-test reasoning effort API values are low, medium, and high.' }; };
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, services);
  try {
    await fixture.instance.start();
    const start = await management(fixture.instance, '/models/research', { method: 'POST', body: '{}' });
    assert.equal(start.status, 202);
    assert.equal(start.body.accepted, true);
    await fixture.instance.specResearchPromise;
    const state = await management(fixture.instance, '/models/research');
    assert.equal(state.status, 200);
    assert.equal(state.body.updated, 1);
    assert.equal(state.body.models[0].configured, true);
    assert.equal(state.body.models[0].contextWindow, 128000);
    assert.equal(state.body.models[0].maxTokens, 16384);
    assert.deepEqual(state.body.models[0].reasoningEfforts, { low: 'low', medium: 'medium', high: 'high' });
    assert.equal(state.body.models[0].fieldEvidence.contextWindow.type, 'official');
    assert.deepEqual(state.body.models[0].sources, [source.url]);
    assert.equal(searches, 3);
    assert.equal(fetches, 1);
    assert.equal(settingsService.snapshot().providers['provider-hub'].models[0].contextWindow, 128000);
  } finally { await fixture.dispose(); }
});

test('one-click research production fetch path pins public DNS and extracts bounded HTML evidence', async () => {
  const settingsService = settings();
  const source = { url: 'https://platform.openai.com/docs/models/gpt-test', title: 'GPT Test', snippet: 'gpt-test official page.' };
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: null, sources: [source.url] });
  const services = researchServices(response, [source]);
  let requestTarget;
  delete services.providerHubResearchFetch.fetch;
  services.providerHubResearchFetch.lookup = async (hostname, options) => { assert.equal(hostname, 'platform.openai.com'); assert.deepEqual(options, { all: true }); return [{ address: '93.184.216.34', family: 4 }]; };
  services.providerHubResearchFetch.request = async (target) => { requestTarget = target; return { status: 200, contentType: 'text/html; charset=utf-8', text: '<html><script>ignore me</script><body><h1>gpt-test</h1><p>Context window: 128000 tokens.</p><p>Maximum output: 16384 tokens.</p></body></html>' }; };
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, services);
  try {
    await fixture.instance.start();
    await management(fixture.instance, '/models/research', { method: 'POST', body: '{}' });
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'].contextWindow, 128000);
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'].maxTokens, 16384);
    assert.equal(requestTarget.address.address, '93.184.216.34');
    assert.equal(requestTarget.parsed.hostname, 'platform.openai.com');
  } finally { await fixture.dispose(); }
});

test('one-click research rejects non-public DNS results before requesting source content', async () => {
  const source = { url: 'https://platform.openai.com/docs/models/gpt-test', title: 'GPT Test', snippet: 'gpt-test official page.' };
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: null, reasoningEfforts: null, sources: [source.url] });
  const services = researchServices(response, [source]);
  let requested = false;
  delete services.providerHubResearchFetch.fetch;
  services.providerHubResearchFetch.lookup = async () => [{ address: '100.64.0.1', family: 4 }];
  services.providerHubResearchFetch.request = async () => { requested = true; throw new Error('must not request'); };
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, undefined, services);
  try {
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(requested, false);
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'], undefined);
  } finally { await fixture.dispose(); }
});

test('specification searches tolerate malformed fulfilled results when another field search succeeds', async () => {
  const source = { url: 'https://platform.openai.com/docs/models/gpt-test', title: 'gpt-test', snippet: 'gpt-test context window 128000 tokens.' };
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: null, reasoningEfforts: null, sources: [source.url] });
  const services = researchServices(response, [source]);
  let call = 0;
  services.web.search = async () => { call += 1; return call === 1 ? undefined : call === 2 ? {} : { sources: [source], truncated: false }; };
  const fixture = runtime({ listen: { enabled: false }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, undefined, services);
  try {
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'].contextWindow, 128000);
  } finally { await fixture.dispose(); }
});

test('one-click research persists official model specifications and hot-syncs DSH', async () => {
  const settingsService = settings();
  const response = JSON.stringify({ id: 'gpt-test', name: 'GPT Test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: { low: 'low', medium: 'medium', high: 'high' }, compat: { thinkingFormat: 'openai', supportsReasoningEffort: true }, sources: ['https://platform.openai.com/docs/models/gpt-test'] });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, researchServices(response));
  try {
    await fixture.instance.start();
    const accepted = await fixture.instance.startSpecificationResearch({});
    assert.equal(accepted.accepted, true);
    await fixture.instance.specResearchPromise;
    const specification = fixture.instance.config.modelSpecifications['gpt-test'];
    assert.equal(specification.contextWindow, 128000);
    assert.equal(specification.maxTokens, 16384);
    assert.deepEqual(specification.reasoningEfforts, { low: 'low', medium: 'medium', high: 'high' });
    assert.deepEqual(settingsService.snapshot().providers['provider-hub'].models[0], { id: 'gpt-test', name: 'GPT Test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: { low: 'low', medium: 'medium', high: 'high' }, compat: { thinkingFormat: 'openai', supportsReasoningEffort: true } });
    assert.equal(fixture.instance.specResearch.phase, 'done');
    assert.equal(fixture.instance.specResearch.updated, 1);
  } finally { await fixture.dispose(); }
});

test('research refuses another vendors official citation and leaves configuration unchanged', async () => {
  const settingsService = settings();
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: false, sources: ['https://docs.anthropic.com/en/docs/about-claude/models'] });
  const services = researchServices(response, [{ url: 'https://docs.anthropic.com/en/docs/about-claude/models', title: 'Claude', snippet: 'official Anthropic limits' }]);
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, services);
  try {
    await fixture.instance.start();
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'], undefined);
    assert.equal(fixture.instance.specResearch.skipped, 1);
  } finally { await fixture.dispose(); }
});

test('research omits reasoning when official evidence proves limits but not reasoning capability', async () => {
  const settingsService = settings();
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: null, sources: ['https://platform.openai.com/docs/models/gpt-test'] });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, researchServices(response, [{ url: 'https://platform.openai.com/docs/models/gpt-test', title: 'GPT Test', snippet: 'gpt-test 128000 context window; 16384 maximum output.' }]));
  try {
    await fixture.instance.start();
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    const specification = fixture.instance.config.modelSpecifications['gpt-test'];
    assert.equal('reasoningEfforts' in specification, false);
    assert.equal(specification.contextWindow, 128000);
  } finally { await fixture.dispose(); }
});

test('research refuses official citations whose snippets do not contain the claimed limits', async () => {
  const settingsService = settings();
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 1000000, maxTokens: 100000, reasoningEfforts: false, sources: ['https://platform.openai.com/docs/models/gpt-test'] });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, researchServices(response));
  try {
    await fixture.instance.start();
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'], undefined);
    assert.equal(fixture.instance.specResearch.skipped, 1);
  } finally { await fixture.dispose(); }
});

test('research refuses unofficial citations and leaves configuration unchanged', async () => {
  const settingsService = settings();
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: false, sources: ['https://random-blog.invalid/gpt-test'] });
  const services = researchServices(response, [{ url: 'https://random-blog.invalid/gpt-test', title: 'Unofficial', snippet: 'claims limits' }]);
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, services);
  try {
    await fixture.instance.start();
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'], undefined);
    assert.equal(fixture.instance.specResearch.skipped, 1);
    assert.deepEqual(settingsService.snapshot().providers['provider-hub'].models, [{ id: 'gpt-test' }]);
  } finally { await fixture.dispose(); }
});

test('research refuses to start when every model vendor is unidentifiable', async () => {
  const settingsService = settings();
  let searched = false;
  const services = researchServices('{}');
  services.web.search = async () => { searched = true; return { sources: [], truncated: false }; };
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['my-best-model'] }] }, {}, settingsService, services);
  try {
    await fixture.instance.start();
    await assert.rejects(() => fixture.instance.startSpecificationResearch({}), /safely identifiable vendor/);
    assert.equal(searched, false);
    assert.equal(fixture.instance.config.modelSpecifications['my-best-model'], undefined);
  } finally { await fixture.dispose(); }
});

test('managed synchronization cleans orphaned persisted specifications', async () => {
  const settingsService = settings();
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, modelSpecifications: { 'gpt-old': { id: 'gpt-old', contextWindow: 1000, maxTokens: 100, reasoningEfforts: false, sources: ['https://platform.openai.com/docs/models/gpt-old'] } }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-current'] }] }, {}, settingsService);
  try {
    await fixture.instance.start();
    assert.equal(fixture.instance.config.modelSpecifications['gpt-old'], undefined);
  } finally { await fixture.dispose(); }
});

test('research does not persist a model removed while the model call is in flight', async () => {
  const settingsService = settings();
  let release;
  const services = researchServices('{}');
  services.llm.stream = async function* () {
    await new Promise((resolve) => { release = resolve; });
    yield { type: 'text-delta', index: 0, text: JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: null, sources: ['https://platform.openai.com/docs/models/gpt-test'] }) };
    yield { type: 'finish', reason: { kind: 'stop' } };
  };
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, services);
  try {
    await fixture.instance.start();
    await fixture.instance.startSpecificationResearch({});
    while (!release) await new Promise((resolve) => setImmediate(resolve));
    fixture.instance.config.routes[0].models = [];
    fixture.instance.refreshRouter();
    release();
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'], undefined);
    assert.equal(fixture.instance.specResearch.skipped, 1);
  } finally { await fixture.dispose(); }
});

test('disposing Provider Hub aborts and drains active model research', async () => {
  const settingsService = settings();
  let aborted = false;
  const services = researchServices('{}');
  services.web.search = (_request, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); }, { once: true });
  });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, services);
  try {
    await fixture.instance.start();
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.dispose();
    assert.equal(aborted, true);
    assert.equal(fixture.instance.specResearchPromise, undefined);
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'], undefined);
  } finally { rmSync(fixture.dir, { recursive: true, force: true }); }
});

test('researched compat is omitted when a model is only served by Responses routes', async () => {
  const settingsService = settings();
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, modelSpecifications: { 'gpt-test': { id: 'gpt-test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: { low: 'low' }, compat: { thinkingFormat: 'openai', supportsReasoningEffort: true }, sources: ['https://platform.openai.com/docs/models/gpt-test'] } }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', api: 'openai-responses', models: ['gpt-test'] }] }, {}, settingsService);
  try {
    await fixture.instance.start();
    const model = settingsService.snapshot().providers['provider-hub'].models[0];
    assert.equal(model.compat, undefined);
    assert.deepEqual(model.reasoningEfforts, { low: 'low' });
  } finally { await fixture.dispose(); }
});

test('a completions route excluded by its key allowlist does not add compat to a Responses model', async () => {
  const settingsService = settings();
  const specification = { id: 'gpt-test', contextWindow: 128000, maxTokens: 16384, compat: { thinkingFormat: 'openai', supportsReasoningEffort: true }, sources: ['https://platform.openai.com/docs/models/gpt-test'] };
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, modelSpecifications: { 'gpt-test': specification }, routes: [
    { id: 'responses', baseURL: 'https://responses.invalid/v1', api: 'openai-responses', models: ['gpt-test'], modelAllowlist: ['gpt-test'] },
    { id: 'completions', baseURL: 'https://completions.invalid/v1', api: 'openai-completions', models: ['gpt-test', 'other'], modelAllowlist: ['other'] }
  ] }, {}, settingsService);
  try {
    await fixture.instance.start();
    assert.equal(settingsService.snapshot().providers['provider-hub'].models.find((model) => model.id === 'gpt-test').compat, undefined);
  } finally { await fixture.dispose(); }
});

test('thinking format is accepted only when it matches the identified model vendor', async () => {
  const settingsService = settings();
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: { low: 'low' }, compat: { thinkingFormat: 'openai', supportsReasoningEffort: true }, sources: ['https://platform.openai.com/docs/models/gpt-test'] });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, researchServices(response));
  try {
    await fixture.instance.start();
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    assert.equal(fixture.instance.config.modelSpecifications['gpt-test'].compat.thinkingFormat, 'openai');
  } finally { await fixture.dispose(); }
});

test('mismatched thinking format is omitted without losing researched limits and efforts', async () => {
  const settingsService = settings();
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 128000, maxTokens: 16384, reasoningEfforts: { low: 'low' }, compat: { thinkingFormat: 'qwen', supportsReasoningEffort: true }, sources: ['https://platform.openai.com/docs/models/gpt-test'] });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, researchServices(response));
  try {
    await fixture.instance.start();
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    const specification = fixture.instance.config.modelSpecifications['gpt-test'];
    assert.equal(specification.compat, undefined);
    assert.equal(specification.contextWindow, 128000);
    assert.deepEqual(specification.reasoningEfforts, { low: 'low' });
  } finally { await fixture.dispose(); }
});

test('research keeps independently proven fields and omits invalid limits and reasoning values', async () => {
  const settingsService = settings();
  const response = JSON.stringify({ id: 'gpt-test', contextWindow: 8192, maxTokens: 16384, reasoningEfforts: { turbo: 'turbo' }, sources: ['https://platform.openai.com/docs/models/gpt-test'] });
  const fixture = runtime({ listen: { enabled: true, host: '127.0.0.1', port: 0 }, accountService: { enabled: false }, routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'] }] }, {}, settingsService, researchServices(response));
  try {
    await fixture.instance.start();
    await fixture.instance.startSpecificationResearch({});
    await fixture.instance.specResearchPromise;
    const specification = fixture.instance.config.modelSpecifications['gpt-test'];
    assert.equal(specification.contextWindow, undefined);
    assert.equal(specification.maxTokens, 16384);
    assert.equal(specification.reasoningEfforts, undefined);
    assert.equal(fixture.instance.specResearch.updated, 1);
  } finally { await fixture.dispose(); }
});
