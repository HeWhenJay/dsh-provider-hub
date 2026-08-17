const DEFAULT_PROVIDER = 'provider-hub';
const DEFAULT_CLIENT_KEY_ENV = 'DSH_PROVIDER_HUB_CLIENT_KEY';
const TRANSIENT_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

function asString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asPositiveInt(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

export function normalizeModelPricing(value) {
  const pricing = value && typeof value === 'object' ? value : {};
  const inputPerMillion = nonNegativeNumber(pricing.inputPerMillion ?? pricing.input);
  const outputPerMillion = nonNegativeNumber(pricing.outputPerMillion ?? pricing.output);
  const cachedInputPerMillion = nonNegativeNumber(pricing.cachedInputPerMillion ?? pricing.cachedInput);
  const reasoningPerMillion = nonNegativeNumber(pricing.reasoningPerMillion ?? pricing.reasoning);
  const currency = asString(pricing.currency, 'USD').toUpperCase();
  return {
    ...(inputPerMillion !== undefined ? { inputPerMillion } : {}),
    ...(outputPerMillion !== undefined ? { outputPerMillion } : {}),
    ...(cachedInputPerMillion !== undefined ? { cachedInputPerMillion } : {}),
    ...(reasoningPerMillion !== undefined ? { reasoningPerMillion } : {}),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD'
  };
}

export function normalizeConfig(raw = {}) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const listen = input.listen && typeof input.listen === 'object' ? input.listen : {};
  const accountService = input.accountService && typeof input.accountService === 'object' ? input.accountService : {};
  const managedProvider = input.managedProvider && typeof input.managedProvider === 'object' ? input.managedProvider : {};
  const managedProviderLastProfile = managedProvider.lastProfile && typeof managedProvider.lastProfile === 'object' ? managedProvider.lastProfile : undefined;
  const rawSpecifications = input.modelSpecifications && typeof input.modelSpecifications === 'object' ? input.modelSpecifications : {};
  const modelSpecifications = {};
  for (const [rawId, rawSpecification] of Object.entries(rawSpecifications)) {
    const id = asString(rawId);
    const specification = rawSpecification && typeof rawSpecification === 'object' ? rawSpecification : {};
    if (!id) continue;
    const contextWindow = Number(specification.contextWindow);
    const maximumContextWindow = Number(specification.maximumContextWindow);
    const contextWindowPolicy = ['source-recommended', 'quarter-maximum'].includes(specification.contextWindowPolicy) ? specification.contextWindowPolicy : undefined;
    const maxTokens = Number(specification.maxTokens);
    const reasoningEfforts = specification.reasoningEfforts === false || specification.reasoningEfforts && typeof specification.reasoningEfforts === 'object' ? structuredClone(specification.reasoningEfforts) : undefined;
    const compat = specification.compat && typeof specification.compat === 'object' ? { ...specification.compat } : undefined;
    modelSpecifications[id] = {
      id,
      ...(asString(specification.name) ? { name: asString(specification.name) } : {}),
      ...(Number.isInteger(contextWindow) && contextWindow > 0 ? { contextWindow } : {}),
      ...(Number.isInteger(maximumContextWindow) && maximumContextWindow > 0 ? { maximumContextWindow } : {}),
      ...(contextWindowPolicy ? { contextWindowPolicy } : {}),
      ...(Number.isInteger(maxTokens) && maxTokens > 0 ? { maxTokens } : {}),
      ...(reasoningEfforts !== undefined ? { reasoningEfforts } : {}),
      ...(compat ? { compat } : {}),
      sources: Array.isArray(specification.sources) ? [...new Set(specification.sources.map((source) => asString(source)).filter((source) => /^https:\/\//i.test(source)).slice(0, 6))] : [],
      ...(specification.fieldEvidence && typeof specification.fieldEvidence === 'object' ? { fieldEvidence: structuredClone(specification.fieldEvidence) } : {}),
      ...(['community-consensus', 'platform-official', 'official'].includes(specification.evidenceType) ? { evidenceType: specification.evidenceType } : {}),
      ...(asString(specification.researchedAt) ? { researchedAt: asString(specification.researchedAt) } : {})
    };
  }
  const routes = Array.isArray(input.routes) ? input.routes : [];
  const normalizedRoutes = routes.map((route, index) => {
    const value = route && typeof route === 'object' ? route : {};
    const modelMetadata = value.modelMetadata && typeof value.modelMetadata === 'object' ? { ...value.modelMetadata } : {};
    const models = [];
    for (const rawModel of Array.isArray(value.models) ? value.models : []) {
      const id = asString(typeof rawModel === 'string' ? rawModel : rawModel?.id);
      if (!id || models.includes(id)) continue;
      models.push(id);
      if (rawModel && typeof rawModel === 'object') modelMetadata[id] = { ...rawModel, id };
    }
    const aliases = value.modelAliases && typeof value.modelAliases === 'object' ? { ...value.modelAliases } : {};
    const id = asString(value.id, `route-${index + 1}`);
    const displayName = asString(value.displayName, id || `Route ${index + 1}`);
    const modelAllowlist = Array.isArray(value.modelAllowlist) ? [...new Set(value.modelAllowlist.map((model) => asString(model)).filter(Boolean))] : [];
    return {
      id,
      displayName,
      keyName: asString(value.keyName, displayName),
      baseURL: asString(value.baseURL).replace(/\/+$/, ''),
      api: value.api === 'openai-responses' ? 'openai-responses' : 'openai-completions',
      apiKeyEnv: asString(value.apiKeyEnv, `DSH_PROVIDER_HUB_${asString(value.id, `ROUTE_${index + 1}`).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_KEY`),
      priority: Number.isFinite(value.priority) ? Number(value.priority) : 0,
      backup: value.backup === true,
      models,
      modelAllowlist,
      modelMetadata,
      modelAliases: aliases,
      modelPricing: Object.fromEntries(Object.entries(value.modelPricing && typeof value.modelPricing === 'object' ? value.modelPricing : {}).map(([model, pricing]) => [model, normalizeModelPricing(pricing)])),
      headers: value.headers && typeof value.headers === 'object' ? { ...value.headers } : {}
    };
  }).filter((route) => route.id && route.baseURL);
  return {
    provider: asString(input.provider, DEFAULT_PROVIDER),
    maxAttempts: asPositiveInt(input.maxAttempts, 6),
    cooldownMs: asPositiveInt(input.cooldownMs, 30000),
    sessionAffinity: input.sessionAffinity !== false,
    listen: {
      enabled: listen.enabled !== false,
      host: listen.host === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
      port: Number.isInteger(listen.port) && listen.port >= 0 && listen.port <= 65535 ? listen.port : 19529,
      apiKeyEnv: asString(listen.apiKeyEnv, DEFAULT_CLIENT_KEY_ENV)
    },
    accountService: {
      enabled: accountService.enabled !== false,
      autoInstall: accountService.autoInstall !== false,
      port: Number.isInteger(accountService.port) && accountService.port > 0 && accountService.port <= 65535 ? accountService.port : 19629,
      priority: Number.isFinite(accountService.priority) ? Number(accountService.priority) : 1000
    },
    managedProvider: {
      enabled: managedProvider.enabled !== false,
      id: asString(managedProvider.id, DEFAULT_PROVIDER),
      displayName: asString(managedProvider.displayName, 'Provider Hub'),
      owned: managedProvider.owned === true,
      ...(managedProviderLastProfile ? { lastProfile: { ...managedProviderLastProfile } } : {})
    },
    modelSpecifications,
    routes: normalizedRoutes
  };
}

function modelMatches(route, model) {
  if (route.modelAllowlist?.length > 0 && !route.modelAllowlist.includes(model)) return false;
  if (route.models.length === 0) return true;
  return route.models.includes(model) || Object.prototype.hasOwnProperty.call(route.modelAliases, model);
}

export class ChannelRouter {
  constructor(config, transport, onAttempt) {
    this.config = config;
    this.transport = transport;
    this.onAttempt = onAttempt;
    this.cooldowns = new Map();
    this.affinity = new Map();
  }

  candidates(model, sessionId) {
    const available = this.config.routes.filter((route) => modelMatches(route, model));
    const normal = available.filter((route) => !route.backup).sort((a, b) => b.priority - a.priority);
    const backup = available.filter((route) => route.backup).sort((a, b) => b.priority - a.priority);
    const now = Date.now();
    const healthy = (route) => (this.cooldowns.get(route.id) ?? 0) <= now;
    const active = [...normal, ...backup].filter(healthy);
    const cooled = [...normal, ...backup].filter((route) => !healthy(route));
    const ordered = [...active, ...cooled];
    if (this.config.sessionAffinity && sessionId) {
      const bound = active.find((route) => route.id === this.affinity.get(sessionId));
      if (bound) return [bound, ...ordered.filter((route) => route.id !== bound.id)];
    }
    return ordered;
  }

  markFailure(route, error) {
    if (TRANSIENT_STATUSES.has(Number(error?.status)) || error?.code === 'ECONNRESET') {
      this.cooldowns.set(route.id, Date.now() + this.config.cooldownMs);
    }
  }

  markSuccess(route, sessionId) {
    this.cooldowns.delete(route.id);
    if (this.config.sessionAffinity && sessionId) this.affinity.set(sessionId, route.id);
  }

  async execute(model, request, sessionId, operation = this.transport) {
    const candidates = this.candidates(model, sessionId).slice(0, this.config.maxAttempts);
    if (candidates.length === 0) {
      const error = new Error(`no configured channel can serve model "${model}"`);
      error.code = 'NO_ROUTE';
      throw error;
    }
    let lastError;
    request.candidateCount = candidates.length;
    for (let index = 0; index < candidates.length; index += 1) {
      const route = candidates[index];
      request.attempt = index + 1;
      const startedAt = Date.now();
      try {
        const result = await operation(route, model, request);
        if (result instanceof Response && !result.ok) {
          const error = new Error(`${route.displayName} returned HTTP ${result.status}`);
          error.status = result.status;
          error.routeId = route.id;
          await result.body?.cancel(error).catch(() => {});
          throw error;
        }
        this.markSuccess(route, sessionId);
        const attempt = this.onAttempt?.({ route, model, request, ok: true, status: result instanceof Response ? result.status : 200, latencyMs: Date.now() - startedAt });
        return { result, route, attempt };
      } catch (error) {
        lastError = error;
        this.markFailure(route, error);
        this.onAttempt?.({ route, model, request, ok: false, status: Number(error?.status) || 0, latencyMs: Date.now() - startedAt, error });
      }
    }
    const error = new Error(`all configured channels failed for model "${model}"`);
    error.code = 'UPSTREAM_UNAVAILABLE';
    error.cause = lastError;
    throw error;
  }
}
