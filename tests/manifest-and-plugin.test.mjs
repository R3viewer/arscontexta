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
  assert.match(oc.engines.openchamber, />=[1-9]\.\d+\.\d+/, 'engines.openchamber must be semver range');

  assert.ok(oc.contributes, 'openchamber.contributes must be defined');
  assert.equal(oc.contributes.opencodePlugin, 'plugin', 'contributes.opencodePlugin must point to plugin folder');
  assert.equal(oc.contributes.skills, 'skills', 'contributes.skills must point to skills folder');

  const pluginEntry = path.resolve(oc.contributes.opencodePlugin, 'index.js');
  assert.ok(fs.existsSync(pluginEntry), `Plugin entrypoint does not exist: ${pluginEntry}`);

  const skillsDir = path.resolve(oc.contributes.skills);
  assert.ok(fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory(), `Skills directory does not exist: ${skillsDir}`);

  assert.equal(oc.contributes.panel?.entry, 'panel/index.html', 'panel.entry must point to panel/index.html');
  assert.equal(oc.contributes.panel?.mobile, true, 'panel.mobile must opt in for mobile support');
  assert.equal(oc.contributes.attach, 'panel', 'attach must route chip clicks and + menu to rail panel');
  assert.equal(oc.contributes.statusSection?.entry, 'panel/status.html', 'statusSection.entry must point to panel/status.html');
  assert.equal(oc.contributes.background?.entry, 'panel/background.html', 'background.entry must point to panel/background.html');
  assert.deepEqual(oc.contributes.capabilities, ['files', 'prompt'], 'capabilities must declare files and prompt');
  assert.equal(oc.contributes.actions?.length, 3, 'actions must expose 3 quick vault actions');
  assert.equal(oc.contributes.tools?.[0]?.match, 'arscontexta_validate_kernel', 'tools card must style arscontexta_validate_kernel');

  for (const requiredFile of [
    'panel/index.html',
    'panel/main.js',
    'panel/status.html',
    'panel/status.js',
    'panel/background.html',
    'panel/background.js',
  ]) {
    const full = path.resolve(requiredFile);
    assert.ok(fs.existsSync(full), `Required extension UI file missing: ${requiredFile}`);
    assert.ok(fs.statSync(full).size > 0, `Extension UI file must not be empty: ${requiredFile}`);
  }
});

test('OpenChamber SDK Schema - parseManifestJson accepts package.json without errors', async () => {
  const pkgPath = path.resolve('package.json');
  const raw = fs.readFileSync(pkgPath, 'utf8');
  const { parseManifestJson } = await import('@openchamber/sdk/schemas');
  const parsed = parseManifestJson(raw);
  assert.equal(parsed.ok, true, parsed.ok ? '' : `${parsed.code}: ${parsed.message}`);
});

test('OpenChamber Panel Bundles - use valid https attach URLs and expose command tooltips', () => {
  const mainJs = fs.readFileSync(path.resolve('panel/main.js'), 'utf8');
  const statusJs = fs.readFileSync(path.resolve('panel/status.js'), 'utf8');

  assert.equal(mainJs.includes('vault://'), false, 'panel/main.js must never pass non-http vault:// URLs to host.attach');
  assert.ok(mainJs.includes('https://arscontexta.local/vault/'), 'panel/main.js must use valid https attach URLs');
  assert.ok(mainJs.includes('command-hint'), 'panel/main.js must include popover command-hint rendering');
  assert.ok(statusJs.includes('command-hint'), 'panel/status.js must include popover command-hint rendering');
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
