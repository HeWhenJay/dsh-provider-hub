import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { LlmAdapter, LlmError, attributionHeaders } from '@deepseek-ai/dsh-llm';
import { ChannelRouter, normalizeConfig } from './routing.js';

const DEFAULT_CLIENT_KEY_ENV = 'DSH_COCKPIT_CLIENT_KEY';

function asString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asPositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function envKey(name) {
  const key = asString(name);
  return key.length === 0 ? '' : asString(process.env[key]);
}


function routeEndpoint(route, kind) {
  const suffix = route.api === 'anthropic-messages' ? '/messages' : kind === 'responses' ? '/responses' : '/chat/completions';
  return `${route.baseURL}${suffix}`;
}

function routeHeaders(route) {
  const key = route.apiKey || envKey(route.apiKeyEnv);
  const headers = { ...attributionHeaders(), 'content-type': 'application/json', ...route.headers };
  if (key) headers.authorization = `Bearer ${key}`;
  if (route.api === 'anthropic-messages') {
    delete headers.authorization;
    if (key) headers['x-api-key'] = key;
    headers['anthropic-version'] ??= '2023-06-01';
  }
  return headers;
}

async function defaultTransport(route, model, request) {
  const kind = request?.endpoint === 'responses' ? 'responses' : 'chat';
  const body = { ...(request?.body ?? {}), model: routeModel(route, model) };
  return fetch(routeEndpoint(route, kind), {
    method: 'POST',
    headers: routeHeaders(route),
    body: JSON.stringify(body),
    signal: request?.signal
  });
}

function readContent(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks.filter((block) => block?.type === 'text').map((block) => block.text).join('');
}

function toOpenAIMessage(message) {
  const content = Array.isArray(message.content) ? message.content : [];
  if (message.role === 'assistant') {
    const toolCalls = content.filter((block) => block.type === 'tool-call').map((block) => ({
      id: block.id,
      type: 'function',
      function: { name: block.name, arguments: block.arguments }
    }));
    return {
      role: 'assistant',
      content: readContent(content) || null,
      ...(toolCalls.length ? { tool_calls: toolCalls } : {})
    };
  }
  const toolResult = content.find((block) => block.type === 'tool-result');
  if (toolResult) return { role: 'tool', tool_call_id: toolResult.toolCallId, content: readContent(toolResult.content) };
  return { role: message.role === 'system' ? 'system' : 'user', content: readContent(content) };
}

function requestBody(options) {
  return {
    model: options.model,
    messages: [
      ...(options.system ? [{ role: 'system', content: options.system }] : []),
      ...(options.messages ?? []).filter((message) => message.role !== 'system').map(toOpenAIMessage),
    ],
    ...(options.tools?.length ? { tools: options.tools.map((tool) => ({ type: 'function', function: tool })) } : {}),
    ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens }),
    ...(options.stop?.length ? { stop: options.stop } : {}),
    stream: true,
    stream_options: { include_usage: true }
  };
}

async function* parseSse(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new Error('aborted');
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      for (const event of events) {
        const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        if (!data || data === '[DONE]') continue;
        try { yield JSON.parse(data); } catch { /* ignore provider comments/non-JSON frames */ }
      }
    }
    if (buffer.trim()) {
      const data = buffer.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim();
      if (data && data !== '[DONE]') { try { yield JSON.parse(data); } catch {} }
    }
  } finally {
    reader.releaseLock();
  }
}

class RelayAdapter extends LlmAdapter {
  constructor(router, provider) {
    super();
    this.router = router;
    this.provider = provider;
  }
  providerInfo(provider) { return { id: provider, name: 'Cockpit Relay (local)' }; }
  providerRetryPolicy() {
    return { mode: 'normal', maxRetries: 0, retryableCodes: [], initialDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 };
  }
  async listModels(provider) {
    const models = new Map();
    for (const route of this.router.config.routes) for (const id of route.models) models.set(id, { provider, id, name: id, inputModalities: ['text'] });
    return [...models.values()];
  }
  async resolveModel(provider, model) {
    const known = (await this.listModels(provider)).find((entry) => entry.id === model);
    return known ?? { provider, id: model, name: model, inputModalities: ['text'] };
  }
  async *stream(options) {
    const body = requestBody(options);
    const sessionId = options.sessionId ? String(options.sessionId) : undefined;
    const { result: response, route } = await this.router.execute(options.model, { body, signal: options.signal }, sessionId);
    if (!response.body) throw new LlmError(`${route.displayName} returned no response body`, 'EMPTY_RESPONSE');
    if (!response.ok) throw responseError(response, route);
    let textStarted = false;
    let text = '';
    let usage;
    for await (const event of parseSse(response.body, options.signal)) {
      const choice = event.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) {
        if (!textStarted) { textStarted = true; yield { type: 'block-start', index: 0, blockType: 'text' }; }
        text += delta.content;
        yield { type: 'text-delta', index: 0, text: delta.content };
      }
      if (event.usage) usage = event.usage;
    }
    if (textStarted) yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    if (usage) yield { type: 'usage', usage: { inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0 } };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

async function readJsonRequest(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function clientAuthorized(req, config) {
  const expected = envKey(config.listen.apiKeyEnv);
  if (!expected) return true;
  const actual = asString(req.headers.authorization).replace(/^Bearer\s+/i, '');
  return actual.length > 0 && actual === expected;
}

function modelsResponse(config) {
  const models = new Map();
  for (const route of config.routes) for (const id of route.models) models.set(id, { id, object: 'model', created: 0, owned_by: route.displayName });
  return { object: 'list', data: [...models.values()] };
}

async function webHandler(req, res, config, router) {
  if (!clientAuthorized(req, config)) return sendJson(res, 401, { error: { message: 'invalid local relay key', type: 'auth_error' } });
  if (req.method === 'GET' && req.url?.split('?')[0] === '/v1/models') return sendJson(res, 200, modelsResponse(config));
  if (req.method !== 'POST' || !['/v1/chat/completions', '/v1/responses'].includes(req.url?.split('?')[0])) return sendJson(res, 404, { error: { message: 'endpoint not found', type: 'not_found' } });
  let body;
  try { body = await readJsonRequest(req); } catch { return sendJson(res, 400, { error: { message: 'invalid JSON body', type: 'invalid_request_error' } }); }
  const endpoint = req.url.startsWith('/v1/responses') ? 'responses' : 'chat';
  try {
    const { result: upstream } = await router.execute(asString(body.model), { body, endpoint });
    const headers = { 'cache-control': 'no-store', 'content-type': upstream.headers.get('content-type') ?? 'application/json' };
    res.writeHead(upstream.status, headers);
    if (upstream.body) {
      for await (const chunk of upstream.body) res.write(chunk);
    }
    res.end();
  } catch (error) {
    sendJson(res, Number(error?.failure?.status ?? error?.status) || 502, { error: { message: error.message, type: 'upstream_error' } });
  }
}

function loadConfig(config) {
  if (config && Array.isArray(config.routes)) return normalizeConfig(config);
  const file = resolve(asString(config?.configFile, 'cockpit-relay.json'));
  if (!existsSync(file)) return normalizeConfig(config);
  return normalizeConfig(JSON.parse(readFileSync(file, 'utf8')));
}

export const name = 'dsh-cockpit-relay';
export const inject = ['llm'];

export function apply(ctx, rawConfig = {}) {
  const config = loadConfig(rawConfig);
  if (config.routes.length === 0) {
    ctx.logger?.info?.('dsh-cockpit-relay: no routes configured; adapter remains dormant');
    return;
  }
  const router = new ChannelRouter(config);
  const adapter = new RelayAdapter(router, config.provider);
  const registration = ctx.llm.registerAdapter([config.provider], adapter);
  void registration;
  if (config.listen.enabled) {
    const server = createServer((req, res) => {
      Promise.resolve(webHandler(req, res, config, router)).catch((error) => {
        if (!res.headersSent) sendJson(res, 500, { error: { message: error.message, type: 'relay_error' } });
        else res.destroy();
      });
    });
    server.listen(config.listen.port, config.listen.host);
    ctx.effect(() => async () => {
      await new Promise((resolveClose) => server.close(resolveClose));
    }, 'dsh-cockpit-relay: HTTP API');
  }
}

export { RelayAdapter, defaultTransport, requestBody, ChannelRouter, normalizeConfig };
