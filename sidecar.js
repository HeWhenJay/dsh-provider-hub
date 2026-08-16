import { createHash, randomBytes } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';

export const SIDECAR_VERSION = '7.2.133';
export const SIDECAR_CLIENT_KEY_ENV = 'DSH_PROVIDER_HUB_SIDECAR_KEY';
export const SIDECAR_MANAGEMENT_KEY_ENV = 'DSH_PROVIDER_HUB_MANAGEMENT_KEY';
const RELEASE_BASE = `https://github.com/router-for-me/CLIProxyAPI/releases/download/v${SIDECAR_VERSION}`;
const READY_TIMEOUT_MS = 30000;

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function errorMessage(error) { return error instanceof Error ? error.message : String(error); }
function quoteYaml(value) { return JSON.stringify(String(value).replaceAll('\\', '/')); }
function combinedSignal(signal, timeoutMs) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export function sidecarAsset(platform = process.platform, arch = process.arch) {
  const suffix = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : '';
  if (!suffix) throw new Error(`unsupported sidecar architecture ${arch}`);
  if (platform === 'win32') return `CLIProxyAPI_${SIDECAR_VERSION}_windows_${suffix}.zip`;
  if (platform === 'darwin') return `CLIProxyAPI_${SIDECAR_VERSION}_darwin_${suffix}.tar.gz`;
  if (platform === 'linux') return `CLIProxyAPI_${SIDECAR_VERSION}_linux_${suffix}.tar.gz`;
  throw new Error(`unsupported sidecar platform ${platform}`);
}

export function parseChecksum(document, asset) {
  for (const line of String(document).split(/\r?\n/)) {
    const match = /^([a-fA-F0-9]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match && match[2] === asset) return match[1].toLowerCase();
  }
  throw new Error(`official checksum for ${asset} was not found`);
}

async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function download(url, filename, signal) {
  const response = await fetch(url, { signal: combinedSignal(signal, 180000), redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`download ${basename(filename)} returned HTTP ${response.status}`);
  await mkdir(dirname(filename), { recursive: true });
  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(filename, { flags: 'w', mode: 0o600 }), { signal });
  } catch (error) {
    await rm(filename, { force: true });
    throw error;
  }
}

async function runProgram(command, args, cwd, signal) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: 'ignore' });
    const abort = () => child.kill();
    signal?.addEventListener('abort', abort, { once: true });
    child.once('error', reject);
    child.once('exit', (code) => {
      signal?.removeEventListener('abort', abort);
      if (signal?.aborted) reject(signal.reason ?? new Error('operation aborted'));
      else if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function extractArchive(archive, destination, platform = process.platform, signal) {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  if (platform === 'win32') {
    const escapedArchive = archive.replaceAll("'", "''");
    const escapedDestination = destination.replaceAll("'", "''");
    const shell = process.env.SystemRoot ? join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe') : 'powershell.exe';
    await runProgram(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${escapedArchive}' -DestinationPath '${escapedDestination}' -Force`], destination, signal);
    return;
  }
  await runProgram('tar', ['-xzf', archive, '-C', destination], destination, signal);
}

function executableName(platform = process.platform) { return platform === 'win32' ? 'cli-proxy-api.exe' : 'cli-proxy-api'; }

export async function freePort(host, preferred) {
  for (let port = preferred; port <= Math.min(65535, preferred + 49); port += 1) {
    const available = await new Promise((resolve) => {
      const server = createNetServer();
      server.once('error', () => resolve(false));
      server.listen(port, host, () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error(`no free sidecar port found from ${preferred} to ${Math.min(65535, preferred + 49)}`);
}

export function sidecarConfig({ port, authDir, managementKey, clientKey }) {
  return `host: "127.0.0.1"\nport: ${port}\ntls:\n  enable: false\nremote-management:\n  allow-remote: false\n  secret-key: ${quoteYaml(managementKey)}\n  disable-control-panel: true\nauth-dir: ${quoteYaml(authDir)}\napi-keys:\n  - ${quoteYaml(clientKey)}\ndebug: false\nlogging-to-file: true\nlogs-max-total-size-mb: 64\nerror-logs-max-files: 10\nusage-statistics-enabled: true\nrequest-log: false\nrequest-retry: 3\nmax-retry-credentials: 6\nmax-retry-interval: 30\nrouting:\n  strategy: "round-robin"\n  session-affinity: true\nws-auth: true\nenable-gemini-cli-endpoint: false\n`;
}

export class ProviderSidecar {
  constructor(options) {
    this.root = options.root;
    this.preferredPort = options.port ?? 19629;
    this.credentials = options.credentials;
    this.clientKeyEnv = options.clientKeyEnv ?? SIDECAR_CLIENT_KEY_ENV;
    this.managementKeyEnv = options.managementKeyEnv ?? SIDECAR_MANAGEMENT_KEY_ENV;
    this.onStateChange = options.onStateChange;
    this.child = undefined;
    this.owned = false;
    this.port = undefined;
    this.models = [];
    this.phase = 'idle';
    this.error = undefined;
    this.operation = undefined;
    this.abortController = undefined;
    this.callbackServer = undefined;
    this.callbackSession = undefined;
  }

  get versionRoot() { return join(this.root, 'bin', SIDECAR_VERSION); }
  get executable() { return join(this.versionRoot, executableName()); }
  get configFile() { return join(this.root, 'config.yaml'); }
  get authDir() { return join(this.root, 'auth'); }
  get baseURL() { return this.port ? `http://127.0.0.1:${this.port}` : ''; }

  async ensureCredential(ref) {
    const existing = await this.credentials.resolve(ref);
    if (existing?.value) return existing.value;
    const generated = `ph_${randomBytes(32).toString('base64url')}`;
    await this.credentials.set(ref, generated);
    return generated;
  }

  async performInstall(signal) {
    if (existsSync(this.executable)) return true;
    const asset = sidecarAsset();
    const downloads = join(this.root, 'downloads');
    const archive = join(downloads, asset);
    const staging = `${this.versionRoot}.staging-${process.pid}`;
    try {
      await mkdir(downloads, { recursive: true });
      const checksumResponse = await fetch(`${RELEASE_BASE}/checksums.txt`, { signal: combinedSignal(signal, 60000), redirect: 'follow' });
      if (!checksumResponse.ok) throw new Error(`download checksums.txt returned HTTP ${checksumResponse.status}`);
      const expected = parseChecksum(await checksumResponse.text(), asset);
      await download(`${RELEASE_BASE}/${asset}`, archive, signal);
      const actual = await sha256(archive);
      if (actual !== expected) throw new Error(`sidecar SHA-256 mismatch for ${asset}`);
      await extractArchive(archive, staging, process.platform, signal);
      if (!existsSync(join(staging, executableName()))) throw new Error(`sidecar archive does not contain ${executableName()}`);
      if (process.platform !== 'win32') await chmod(join(staging, executableName()), 0o700);
      await mkdir(join(this.root, 'bin'), { recursive: true });
      await rm(this.versionRoot, { recursive: true, force: true });
      await rename(staging, this.versionRoot);
      return true;
    } finally {
      await rm(archive, { force: true }).catch(() => {});
      await rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  }

  async install() {
    if (existsSync(this.executable)) {
      if (!['running', 'starting'].includes(this.phase)) this.phase = 'installed';
      return true;
    }
    if (this.operation) return this.operation;
    const controller = new AbortController();
    this.abortController = controller;
    this.phase = 'installing';
    this.error = undefined;
    this.operation = this.performInstall(controller.signal)
      .then(() => { if (!controller.signal.aborted) this.phase = 'installed'; return true; })
      .catch((error) => {
        if (controller.signal.aborted) { this.phase = 'stopped'; return false; }
        this.phase = 'error'; this.error = errorMessage(error); return false;
      })
      .finally(() => { if (this.abortController === controller) this.abortController = undefined; this.operation = undefined; });
    return this.operation;
  }

  async probe(port = this.port) {
    if (!port) return false;
    const key = (await this.credentials.resolve(this.clientKeyEnv))?.value;
    if (!key) return false;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/v1/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(2500) });
      if (!response.ok) return false;
      const body = await response.json();
      this.models = Array.isArray(body?.data) ? body.data.map((item) => {
        const id = text(item?.id);
        const name = text(item?.name ?? item?.display_name);
        const contextWindow = Number(item?.context_window ?? item?.context_length ?? item?.contextWindow);
        const maxTokens = Number(item?.max_output_tokens ?? item?.max_tokens ?? item?.maxTokens);
        return {
          id,
          ...(name && name !== id ? { name } : {}),
          ...(Number.isInteger(contextWindow) && contextWindow > 0 ? { contextWindow } : {}),
          ...(Number.isInteger(maxTokens) && maxTokens > 0 ? { maxTokens } : {})
        };
      }).filter((item) => item.id) : [];
      return true;
    } catch { return false; }
  }

  async start({ install = true } = {}) {
    if (this.child && await this.probe()) { this.phase = 'running'; return true; }
    if (this.operation) {
      await this.operation;
      if (this.phase === 'running') return true;
    }
    if (!existsSync(this.executable) && !install) {
      this.phase = 'not-installed';
      this.error = undefined;
      return false;
    }
    const controller = new AbortController();
    this.abortController = controller;
    this.phase = existsSync(this.executable) ? 'starting' : 'installing';
    this.error = undefined;
    this.operation = (async () => {
      if (!existsSync(this.executable)) await this.performInstall(controller.signal);
      if (controller.signal.aborted) return false;
      this.phase = 'starting';
      const clientKey = await this.ensureCredential(this.clientKeyEnv);
      const managementKey = await this.ensureCredential(this.managementKeyEnv);
      const port = await freePort('127.0.0.1', this.preferredPort);
      await mkdir(this.authDir, { recursive: true });
      await writeFile(this.configFile, sidecarConfig({ port, authDir: this.authDir, managementKey, clientKey }), { encoding: 'utf8', mode: 0o600 });
      if (controller.signal.aborted) return false;
      const child = spawn(this.executable, ['-config', this.configFile], { cwd: this.root, windowsHide: true, stdio: 'ignore' });
      this.child = child;
      this.owned = true;
      this.port = port;
      child.once('exit', (code) => {
        if (this.child !== child) return;
        this.child = undefined;
        this.owned = false;
        this.port = undefined;
        this.models = [];
        if (this.phase !== 'stopped') { this.phase = 'error'; this.error = `sidecar exited with code ${code}`; }
        this.onStateChange?.();
      });
      const deadline = Date.now() + READY_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (controller.signal.aborted) return false;
        if (await this.probe(port)) { this.phase = 'running'; return true; }
        if (child.exitCode !== null) throw new Error(`sidecar exited with code ${child.exitCode}`);
        await delay(300, undefined, { signal: controller.signal });
      }
      throw new Error('sidecar did not become ready within 30 seconds');
    })()
      .catch(async (error) => {
        await this.terminateOwned();
        if (controller.signal.aborted) { this.phase = 'stopped'; this.error = undefined; return false; }
        this.phase = 'error'; this.error = errorMessage(error); return false;
      })
      .finally(() => { if (this.abortController === controller) this.abortController = undefined; this.operation = undefined; });
    return this.operation;
  }

  async terminateOwned() {
    const child = this.child;
    const owned = this.owned;
    this.child = undefined;
    this.owned = false;
    this.port = undefined;
    this.models = [];
    if (!child || !owned || child.exitCode !== null) return;
    child.kill();
    await new Promise((done) => {
      const timer = setTimeout(done, 5000);
      child.once('exit', () => { clearTimeout(timer); done(); });
    });
  }

  async stop() {
    this.abortController?.abort(new Error('sidecar stopped'));
    const operation = this.operation;
    if (operation) await operation.catch(() => {});
    await this.stopOAuthCallback();
    await this.terminateOwned();
    this.phase = 'stopped';
    this.error = undefined;
  }

  async startOAuthCallback(provider, state) {
    const ports = { anthropic: 54545, codex: 1455, gemini: 8085 };
    const paths = { anthropic: '/anthropic/callback', codex: '/codex/callback', gemini: '/google/callback' };
    const port = ports[provider];
    if (!port || !this.port || !state) throw new Error('OAuth callback cannot start without a running account service');
    if (this.callbackServer) {
      if (this.callbackSession?.provider === provider && this.callbackSession?.state === state) return;
      await this.stopOAuthCallback();
    }
    const targetBase = `http://127.0.0.1:${this.port}${paths[provider]}`;
    const server = createHttpServer((req, res) => {
      const incoming = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      const incomingState = text(incoming.searchParams.get('state'));
      if (!incomingState || incomingState !== state) {
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
        res.end('OAuth state mismatch. Return to DSH Provider Hub and start login again.');
        return;
      }
      const target = new URL(targetBase);
      target.search = incoming.search;
      res.writeHead(302, { location: target.toString(), 'cache-control': 'no-store' });
      res.end();
    });
    await new Promise((resolve, reject) => {
      const onError = reject;
      server.once('error', onError);
      server.listen(port, '127.0.0.1', () => { server.off('error', onError); resolve(); });
    });
    this.callbackServer = server;
    this.callbackSession = { provider, state, port };
  }

  async stopOAuthCallback(state) {
    const server = this.callbackServer;
    if (!server || (state && this.callbackSession?.state !== state)) return;
    this.callbackServer = undefined;
    this.callbackSession = undefined;
    if (!server.listening) return;
    server.closeAllConnections?.();
    await new Promise((done) => server.close(done));
  }

  async management(path, options = {}) {
    if (this.phase !== 'running' && !(await this.probe())) throw new Error('built-in account service is not running');
    const key = (await this.credentials.resolve(this.managementKeyEnv))?.value;
    if (!key) throw new Error('built-in management credential is missing');
    const url = new URL(`/v0/management/${path}`, this.baseURL);
    for (const [name, value] of Object.entries(options.query ?? {})) if (text(value)) url.searchParams.set(name, text(value));
    const hasBody = options.body !== undefined;
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: { accept: 'application/json', authorization: `Bearer ${key}`, ...(hasBody ? { 'content-type': 'application/json' } : {}) },
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
      signal: AbortSignal.timeout(15000)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(text(body?.error) || `account service returned HTTP ${response.status}`);
    return body;
  }

  snapshot() {
    return {
      version: SIDECAR_VERSION,
      installed: existsSync(this.executable),
      phase: this.phase,
      running: this.phase === 'running',
      port: this.port,
      baseURL: this.baseURL,
      modelCount: this.models.length,
      models: this.models,
      callbackBusy: Boolean(this.callbackServer),
      error: this.error
    };
  }
}
