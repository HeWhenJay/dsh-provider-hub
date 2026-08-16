import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { ChannelRouter, normalizeConfig, webHandler } from '../index.js';

async function withServer(handler, run) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test('models endpoint never exposes upstream secrets', async () => {
  const config = normalizeConfig({
    listen: { host: '127.0.0.1', apiKeyEnv: 'UNSET_TEST_CLIENT_KEY' },
    routes: [{ id: 'a', displayName: 'A', baseURL: 'https://a.invalid/v1', apiKeyEnv: 'SECRET_ENV_NAME', models: ['gpt-test'] }]
  });
  const router = new ChannelRouter(config, async () => new Response('{}'));
  await withServer((req, res) => webHandler(req, res, config, router), async (url) => {
    const response = await fetch(`${url}/v1/models`);
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /gpt-test/);
    assert.doesNotMatch(text, /SECRET_ENV_NAME|authorization|apiKey/i);
  });
});

test('chat endpoint fails over and preserves upstream streaming bytes', async () => {
  const config = normalizeConfig({
    listen: { host: '127.0.0.1', apiKeyEnv: 'UNSET_TEST_CLIENT_KEY' },
    routes: [
      { id: 'cheap', baseURL: 'https://cheap.invalid/v1', models: ['gpt-test'], priority: 100 },
      { id: 'backup', baseURL: 'https://backup.invalid/v1', models: ['gpt-test'], priority: 1, backup: true }
    ]
  });
  const calls = [];
  const router = new ChannelRouter(config, async (route) => {
    calls.push(route.id);
    if (route.id === 'cheap') return new Response('down', { status: 503 });
    return new Response('data: {"ok":true}\n\n', { headers: { 'content-type': 'text/event-stream' } });
  });
  await withServer((req, res) => webHandler(req, res, config, router), async (url) => {
    const response = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-test', messages: [], stream: true })
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'data: {"ok":true}\n\n');
  });
  assert.deepEqual(calls, ['cheap', 'backup']);
});
