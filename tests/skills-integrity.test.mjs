import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Agents Integrity - knowledge-guide agent has valid OpenCode V2 frontmatter', () => {
  const agentPath = path.resolve('agents/knowledge-guide.md');
  assert.ok(fs.existsSync(agentPath), 'agents/knowledge-guide.md must exist');
  const content = fs.readFileSync(agentPath, 'utf8');

  assert.ok(content.startsWith('---'), 'agents/knowledge-guide.md must start with YAML frontmatter');
  const closingIdx = content.indexOf('\n---', 3);
  assert.ok(closingIdx !== -1, 'agents/knowledge-guide.md must have closing frontmatter delimiter');

  const frontmatter = content.slice(3, closingIdx);
  assert.ok(/^name:\s*knowledge-guide/m.test(frontmatter), 'Agent must declare name: knowledge-guide');
  assert.ok(/^description:\s*.+/m.test(frontmatter), 'Agent must declare description');
  assert.ok(/^mode:\s*subagent/m.test(frontmatter), 'Agent must declare mode: subagent');
});

test('Agents Integrity - knowledge-worker agent has valid OpenCode V2 frontmatter', () => {
  const agentPath = path.resolve('agents/knowledge-worker.md');
  assert.ok(fs.existsSync(agentPath), 'agents/knowledge-worker.md must exist');
  const content = fs.readFileSync(agentPath, 'utf8');

  assert.ok(content.startsWith('---'), 'agents/knowledge-worker.md must start with YAML frontmatter');
  const closingIdx = content.indexOf('\n---', 3);
  assert.ok(closingIdx !== -1, 'agents/knowledge-worker.md must have closing frontmatter delimiter');

  const frontmatter = content.slice(3, closingIdx);
  assert.ok(/^name:\s*knowledge-worker/m.test(frontmatter), 'Agent must declare name: knowledge-worker');
  assert.ok(/^description:\s*.+/m.test(frontmatter), 'Agent must declare description');
  assert.ok(/^mode:\s*subagent/m.test(frontmatter), 'Agent must declare mode: subagent');
});

test('Skills Integrity - 10 plugin skills have valid SKILL.md with frontmatter', () => {
  const skillsDir = path.resolve('skills');
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  assert.equal(skillDirs.length, 10, `Expected 10 plugin skills, found ${skillDirs.length}`);

  for (const sName of skillDirs) {
    const skillMdPath = path.join(skillsDir, sName, 'SKILL.md');
    assert.ok(fs.existsSync(skillMdPath), `Skill ${sName} must have a SKILL.md file`);
    const content = fs.readFileSync(skillMdPath, 'utf8');

    assert.ok(content.startsWith('---'), `Skill ${sName}/SKILL.md must start with YAML frontmatter delimiter`);
    const closingIdx = content.indexOf('\n---', 3);
    assert.ok(closingIdx !== -1, `Skill ${sName}/SKILL.md must have closing frontmatter delimiter`);

    const frontmatter = content.slice(3, closingIdx);
    assert.ok(/^name:\s*.+/m.test(frontmatter), `Skill ${sName}/SKILL.md must declare name`);
    assert.ok(/^description:\s*.+/m.test(frontmatter), `Skill ${sName}/SKILL.md must declare description`);
  }
});

test('Skill Sources Integrity - 16 source templates have valid SKILL.md with frontmatter', () => {
  const sourcesDir = path.resolve('skill-sources');
  const sourceDirs = fs.readdirSync(sourcesDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  assert.equal(sourceDirs.length, 16, `Expected 16 skill-sources, found ${sourceDirs.length}`);

  for (const sName of sourceDirs) {
    const skillMdPath = path.join(sourcesDir, sName, 'SKILL.md');
    assert.ok(fs.existsSync(skillMdPath), `Skill source ${sName} must have a SKILL.md file`);
    const content = fs.readFileSync(skillMdPath, 'utf8');

    assert.ok(content.startsWith('---'), `Skill source ${sName}/SKILL.md must start with YAML frontmatter delimiter`);
    const closingIdx = content.indexOf('\n---', 3);
    assert.ok(closingIdx !== -1, `Skill source ${sName}/SKILL.md must have closing frontmatter delimiter`);

    const frontmatter = content.slice(3, closingIdx);
    assert.ok(/^name:\s*.+/m.test(frontmatter), `Skill source ${sName}/SKILL.md must declare name`);
    assert.ok(/^description:\s*.+/m.test(frontmatter), `Skill source ${sName}/SKILL.md must declare description`);
  }
});

test('Methodology Integrity - 249 research claims exist and have frontmatter', () => {
  const methDir = path.resolve('methodology');
  assert.ok(fs.existsSync(methDir), 'methodology/ directory must exist');
  const files = fs.readdirSync(methDir).filter(f => f.endsWith('.md'));

  assert.ok(files.length >= 249, `Expected at least 249 methodology claims, found ${files.length}`);

  for (const f of files) {
    const content = fs.readFileSync(path.join(methDir, f), 'utf8');
    assert.ok(content.startsWith('---'), `Methodology file ${f} must have YAML frontmatter`);
  }
});

test('Reference Documents Integrity - Core specs exist', () => {
  const requiredRefs = [
    'reference/kernel.yaml',
    'reference/three-spaces.md',
    'reference/use-case-presets.md',
    'reference/interaction-constraints.md',
    'reference/vocabulary-transforms.md',
    'reference/personality-layer.md',
    'reference/failure-modes.md',
    'reference/evolution-lifecycle.md',
    'reference/derivation-validation.md',
    'reference/dimension-claim-map.md',
    'reference/validate-kernel.mjs',
  ];

  for (const ref of requiredRefs) {
    assert.ok(fs.existsSync(ref), `Required reference document missing: ${ref}`);
    const stat = fs.statSync(ref);
    assert.ok(stat.size > 0, `Reference document must not be empty: ${ref}`);
  }
});
