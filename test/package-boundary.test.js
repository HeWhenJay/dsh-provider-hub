import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

test('host entry and browser bundle use distinct files', () => {
  assert.equal(pkg.exports['.'], './index.js');
  assert.equal(pkg.exports['./client'], './web-client.js');
  assert.equal(pkg.exports['./package.json'], './package.json');
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
