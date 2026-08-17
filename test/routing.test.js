import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelRouter, normalizeConfig } from '../routing.js';

test('normal channels are tried before backup channels', async () => {
  const calls = [];
  const router = new ChannelRouter(normalizeConfig({
    provider: 'provider-hub',
    maxAttempts: 4,
    routes: [
      { id: 'cheap', baseURL: 'https://cheap.invalid/v1', api: 'openai-completions', models: ['gpt-test'], priority: 100 },
      { id: 'backup', baseURL: 'https://backup.invalid/v1', api: 'openai-completions', models: ['gpt-test'], priority: 1, backup: true }
    ]
  }), async (channel) => {
    calls.push(channel.id);
    if (channel.id === 'cheap') throw Object.assign(new Error('down'), { status: 503 });
    return { ok: true, channel: channel.id };
  });
  const result = await router.execute('gpt-test', {}, undefined);
  assert.equal(result.route.id, 'backup');
  assert.deepEqual(calls, ['cheap', 'backup']);
});

test('non-2xx response bodies are cancelled before failover', async () => {
  let cancelled = false;
  const router = new ChannelRouter(normalizeConfig({ routes: [{ id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'], priority: 2 }, { id: 'b', baseURL: 'https://b.invalid/v1', models: ['gpt-test'], priority: 1 }] }), async (channel) => {
    if (channel.id === 'a') return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 });
    return new Response('{}', { status: 200 });
  });
  const result = await router.execute('gpt-test', {}, undefined);
  assert.equal(result.route.id, 'b');
  assert.equal(cancelled, true);
});

test('startup pricing normalization matches management saves', () => {
  const route = normalizeConfig({ routes: [{ id: 'priced', baseURL: 'https://priced.invalid/v1', modelPricing: { 'gpt-test': { inputPerMillion: '1.25', outputPerMillion: -3, cachedInputPerMillion: '0.125', currency: 'usd' } } }] }).routes[0];
  assert.deepEqual(route.modelPricing['gpt-test'], { inputPerMillion: 1.25, cachedInputPerMillion: 0.125, currency: 'USD' });
});

test('one unhealthy route cools down and the next request uses the peer', async () => {
  const calls = [];
  const router = new ChannelRouter(normalizeConfig({
    cooldownMs: 60000,
    routes: [
      { id: 'a', baseURL: 'https://a.invalid/v1', api: 'openai-completions', models: ['gpt-test'], priority: 100 },
      { id: 'b', baseURL: 'https://b.invalid/v1', api: 'openai-completions', models: ['gpt-test'], priority: 90 }
    ]
  }), async (channel) => {
    calls.push(channel.id);
    if (channel.id === 'a' && calls.length === 1) throw Object.assign(new Error('rate'), { status: 429 });
    return { ok: true, channel: channel.id };
  });
  assert.equal((await router.execute('gpt-test', {}, undefined)).route.id, 'b');
  assert.equal((await router.execute('gpt-test', {}, undefined)).route.id, 'b');
  assert.deepEqual(calls, ['a', 'b', 'b']);
});

test('model aliases are resolved per channel', () => {
  const config = normalizeConfig({ routes: [{ id: 'x', baseURL: 'https://x.invalid/v1', api: 'openai-completions', models: ['public-model'], modelAliases: { 'public-model': 'vendor-model' } }] });
  assert.equal(config.routes[0].modelAliases['public-model'], 'vendor-model');
});

test('model aliases cannot bypass an API key allowlist', () => {
  const router = new ChannelRouter(normalizeConfig({ routes: [{
    id: 'x',
    baseURL: 'https://x.invalid/v1',
    models: ['allowed-model', 'blocked-model'],
    modelAllowlist: ['allowed-model'],
    modelAliases: { 'blocked-model': 'vendor-model' }
  }] }));
  assert.deepEqual(router.candidates('allowed-model').map((route) => route.id), ['x']);
  assert.deepEqual(router.candidates('blocked-model'), []);
});

test('an affinity binding never revives a cooled route', async () => {
  const calls = [];
  const router = new ChannelRouter(normalizeConfig({
    cooldownMs: 60000,
    sessionAffinity: true,
    routes: [
      { id: 'a', baseURL: 'https://a.invalid/v1', models: ['gpt-test'], priority: 100 },
      { id: 'b', baseURL: 'https://b.invalid/v1', models: ['gpt-test'], priority: 90 }
    ]
  }), async (channel) => {
    calls.push(channel.id);
    if (channel.id === 'a' && calls.length === 2) throw Object.assign(new Error('down'), { status: 503 });
    return { ok: true };
  });
  await router.execute('gpt-test', {}, 'session-1');
  await router.execute('gpt-test', {}, 'session-1');
  await router.execute('gpt-test', {}, 'session-1');
  assert.deepEqual(calls, ['a', 'a', 'b', 'b']);
});
