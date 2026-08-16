import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

test('host entry and browser bundle use distinct files', () => {
  assert.equal(pkg.exports['.'], './index.js');
  assert.equal(pkg.exports['./client'], './web-client.js');
  assert.equal(pkg.exports['./sidecar'], './sidecar.js');
  assert.equal(pkg.exports['./package.json'], './package.json');
  assert.ok(pkg.files.includes('sidecar.js'));
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-primitives'));
  assert.notEqual(pkg.exports['.'], pkg.exports['./client']);
  const host = readFileSync(resolve(root, pkg.exports['.']), 'utf8');
  assert.doesNotMatch(host, /(?:from|import\()\s*['"]\.\/web-client\.js['"]/);
});

test('host entry imports without evaluating browser globals', async () => {
  const loaded = await import('../index.js');
  assert.equal(typeof loaded.apply, 'function');
  assert.equal(typeof loaded.RelayRuntime, 'function');
});

test('web client contains only the built-in account service contract', () => {
  const source = readFileSync(resolve(root, pkg.exports['./client']), 'utf8');
  assert.match(source, /\/account-service\/oauth/);
  assert.match(source, /内置官方账号服务/);
  assert.doesNotMatch(source, /\/cockpit|CockpitBridge|CockpitEditor|Cockpit 账号池/);
  assert.match(source, /Lucide \"Network\"/);
  assert.match(source, /icon: ProviderHubIcon/);
  assert.match(source, /generatedCredentialRef/);
  assert.match(source, /setRouteId/);
  assert.match(source, /DSH 供应商已同步/);
  assert.doesNotMatch(source, /IconSettingsOutline/);
});

test('web client registers through the browser module loader', () => {
  const source = readFileSync(resolve(root, pkg.exports['./client']), 'utf8');
  let definition;
  const sandbox = {
    window: { __ModuleLoader__: { load(value) { definition = value; } } },
    console
  };
  vm.runInNewContext(source, sandbox, { filename: pkg.exports['./client'] });
  assert.equal(definition.id, pkg.name);
  assert.equal(typeof definition.factory, 'function');
});

test('packed tarball includes every runtime module and imports cleanly', () => {
  const npmCli = resolve(process.execPath, '..', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const output = execFileSync(process.execPath, [npmCli, 'pack', '--json', '--ignore-scripts'], { cwd: root, encoding: 'utf8' });
  const packed = JSON.parse(output)[0];
  const tarball = resolve(root, packed.filename);
  const destination = mkdtempSync(resolve(tmpdir(), 'provider-hub-pack-'));
  try {
    const files = packed.files.map((entry) => entry.path);
    assert.ok(files.includes('sidecar.js'));
    assert.ok(files.includes('index.js'));
    assert.ok(files.includes('web-client.js'));
    for (const image of ['provider-hub-entry.png', 'provider-hub-dashboard.png', 'provider-hub-add-route.png', 'provider-hub-accounts.png']) {
      assert.ok(files.includes(`docs/images/${image}`));
    }
    execFileSync('tar.exe', ['-xf', tarball, '-C', destination]);
    const entry = resolve(destination, 'package', 'index.js');
    execFileSync(process.execPath, ['--input-type=module', '--eval', `import(${JSON.stringify(new URL(`file:///${entry.replaceAll('\\', '/')}`).href)}).then(m=>{if(typeof m.apply!==\"function\")process.exit(2)})`], { stdio: 'ignore' });
  } finally {
    rmSync(tarball, { force: true });
    rmSync(destination, { recursive: true, force: true });
  }
});
