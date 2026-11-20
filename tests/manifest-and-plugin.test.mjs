import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('OpenChamber Manifest - package.json is valid and conforms to OpenChamber SDK spec', () => {
  const pkgPath = path.resolve('package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist at repository root');

  const raw = fs.readFileSync(pkgPath, 'utf8');
  const pkg = JSON.parse(raw);

  assert.equal(pkg.name, 'arscontexta');
  assert.equal(pkg.type, 'module', 'package.json must be type: module');
  assert.ok(pkg.version, 'package.json must specify a version');

  const oc = pkg.openchamber;
  assert.ok(oc, 'package.json must contain an "openchamber" manifest block');
  assert.equal(oc.apiVersion, 1, 'openchamber.apiVersion must be exactly 1');
  assert.equal(oc.id, 'arscontexta', 'openchamber.id must be arscontexta');
  assert.equal(oc.name, 'Ars Contexta', 'openchamber.name must be Ars Contexta');
  assert.ok(oc.icon, 'openchamber.icon must be defined');

  assert.ok(oc.engines?.openchamber, 'openchamber.engines.openchamber must declare supported version');
  assert.match(oc.engines.openchamber, />=1\.\d+\.\d+/, 'engines.openchamber must be semver range');

  assert.ok(oc.contributes, 'openchamber.contributes must be defined');
  assert.equal(oc.contributes.opencodePlugin, 'plugin', 'contributes.opencodePlugin must point to plugin folder');
  assert.equal(oc.contributes.skills, 'skills', 'contributes.skills must point to skills folder');

  const pluginEntry = path.resolve(oc.contributes.opencodePlugin, 'index.js');
  assert.ok(fs.existsSync(pluginEntry), `Plugin entrypoint does not exist: ${pluginEntry}`);

  const skillsDir = path.resolve(oc.contributes.skills);
  assert.ok(fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory(), `Skills directory does not exist: ${skillsDir}`);
});

test('OpenCode V2 Plugin - index.js default exports { id, setup } and loads cleanly', async () => {
  const pluginEntry = path.resolve('plugin/index.js');
  assert.ok(fs.existsSync(pluginEntry), 'plugin/index.js must exist');

  // Must load cleanly via dynamic import (as OpenCode does via bare import())
  const moduleUrl = pathToFileURL(pluginEntry).href;
  const mod = await import(moduleUrl);

  assert.ok(mod.default, 'plugin/index.js must have a default export');
  assert.equal(mod.default.id, 'arscontexta', 'Plugin default export must have id: "arscontexta"');
  assert.equal(typeof mod.default.setup, 'function', 'Plugin default export must have setup function');

  // Test setup() invocation with a mock context
  const mockCtx = {
    location: { directory: process.cwd() },
  };

  const cleanup = await mod.default.setup(mockCtx);
  if (cleanup) {
    assert.equal(typeof cleanup, 'function', 'setup() cleanup return must be a function');
    cleanup();
  }
});
