import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProviderSidecar, freePort, parseChecksum, sidecarAsset, sidecarConfig } from '../sidecar.js';

function credentials() {
  const store = new Map();
  return {
    store,
    async resolve(ref) { const value = store.get(String(ref)); return value ? { value } : undefined; },
    async set(ref, value) { store.set(String(ref), value); }
  };
}

test('sidecar release asset mapping covers supported targets', () => {
  assert.equal(sidecarAsset('win32', 'x64'), 'CLIProxyAPI_7.2.133_windows_amd64.zip');
  assert.equal(sidecarAsset('win32', 'arm64'), 'CLIProxyAPI_7.2.133_windows_arm64.zip');
  assert.equal(sidecarAsset('darwin', 'arm64'), 'CLIProxyAPI_7.2.133_darwin_arm64.tar.gz');
  assert.equal(sidecarAsset('linux', 'x64'), 'CLIProxyAPI_7.2.133_linux_amd64.tar.gz');
  assert.throws(() => sidecarAsset('freebsd', 'x64'), /unsupported sidecar platform/);
});

test('checksum parser requires an exact asset row', () => {
  const hash = 'a'.repeat(64);
  assert.equal(parseChecksum(`${hash}  CLIProxyAPI_7.2.133_windows_amd64.zip\n`, 'CLIProxyAPI_7.2.133_windows_amd64.zip'), hash);
  assert.throws(() => parseChecksum(`${hash}  wrong.zip\n`, 'expected.zip'), /was not found/);
});

test('generated sidecar config is loopback-only and contains no control panel', () => {
  const config = sidecarConfig({ port: 19629, authDir: 'C:\\private\\auth', managementKey: 'management-secret', clientKey: 'client-secret' });
  assert.match(config, /^host: "127\.0\.0\.1"/);
  assert.match(config, /allow-remote: false/);
  assert.match(config, /disable-control-panel: true/);
  assert.match(config, /port: 19629/);
  assert.match(config, /management-secret/);
  assert.match(config, /client-secret/);
  assert.doesNotMatch(config, /0\.0\.0\.0/);
});

test('freePort skips an occupied listener without touching it', async () => {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const occupied = server.address().port;
  try {
    const selected = await freePort('127.0.0.1', occupied);
    assert.notEqual(selected, occupied);
    assert.equal(server.listening, true);
  } finally { await new Promise((done) => server.close(done)); }
});

test('auto-install off leaves an absent sidecar untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'provider-sidecar-test-'));
  const sidecar = new ProviderSidecar({ root: dir, credentials: credentials(), port: 19629 });
  try {
    assert.equal(await sidecar.start({ install: false }), false);
    assert.equal(sidecar.phase, 'not-installed');
    assert.equal(sidecar.snapshot().installed, false);
  } finally { await sidecar.stop(); rmSync(dir, { recursive: true, force: true }); }
});

test('generated credentials are stored through the credential service only once', async () => {
  const service = credentials();
  const dir = mkdtempSync(join(tmpdir(), 'provider-sidecar-credential-'));
  const sidecar = new ProviderSidecar({ root: dir, credentials: service });
  try {
    const first = await sidecar.ensureCredential('TEST_SIDECAR_KEY');
    const second = await sidecar.ensureCredential('TEST_SIDECAR_KEY');
    assert.equal(first, second);
    assert.match(first, /^ph_/);
    assert.equal(service.store.get('TEST_SIDECAR_KEY'), first);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
