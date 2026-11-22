import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const PRESETS = [
  { dir: 'research', expectedName: 'research' },
  { dir: 'personal', expectedName: 'personal-assistant' },
  { dir: 'professional', expectedName: 'professional-assistant' },
  { dir: 'experimental', expectedName: 'experimental' },
];

test('Presets Integrity - All 4 presets have preset.yaml, vocabulary.yaml, categories.yaml and valid starter files', () => {
  for (const { dir, expectedName } of PRESETS) {
    const presetDir = path.resolve('presets', dir);
    assert.ok(fs.existsSync(presetDir), `Preset directory missing: presets/${dir}`);

    const presetYamlPath = path.join(presetDir, 'preset.yaml');
    const vocabYamlPath = path.join(presetDir, 'vocabulary.yaml');
    const categoriesYamlPath = path.join(presetDir, 'categories.yaml');

    for (const requiredFile of [presetYamlPath, vocabYamlPath, categoriesYamlPath]) {
      assert.ok(fs.existsSync(requiredFile), `Required preset file missing: ${requiredFile}`);
      assert.ok(fs.statSync(requiredFile).size > 0, `Preset file must not be empty: ${requiredFile}`);
    }

    const presetYaml = fs.readFileSync(presetYamlPath, 'utf8');
    const nameMatch = presetYaml.match(/^name:\s*(.+?)\s*$/m);
    assert.ok(nameMatch, `presets/${dir}/preset.yaml must declare name`);
    assert.equal(nameMatch[1].replace(/^["']|["']$/g, ''), expectedName);

    const displayMatch = presetYaml.match(/^display_name:\s*(.+?)\s*$/m);
    assert.ok(displayMatch, `presets/${dir}/preset.yaml must declare display_name`);

    const starterDir = path.join(presetDir, 'starter');
    assert.ok(fs.existsSync(starterDir), `Starter directory missing: presets/${dir}/starter`);

    const starterFiles = fs.readdirSync(starterDir).filter((f) => f.endsWith('.md'));
    assert.ok(starterFiles.length > 0, `presets/${dir}/starter must contain at least one markdown file`);

    for (const file of starterFiles) {
      const content = fs.readFileSync(path.join(starterDir, file), 'utf8').replace(/\r\n/g, '\n');
      if (dir !== 'experimental') {
        assert.ok(content.startsWith('---\n'), `Starter file presets/${dir}/starter/${file} must start with YAML frontmatter`);
        const closingIdx = content.indexOf('\n---', 4);
        assert.ok(closingIdx !== -1, `Starter file presets/${dir}/starter/${file} must close YAML frontmatter`);
        const fm = content.slice(4, closingIdx);
        assert.ok(/^description:\s*.+/m.test(fm), `Starter file presets/${dir}/starter/${file} must have description`);
        assert.ok(/^type:\s*moc/m.test(fm), `Starter file presets/${dir}/starter/${file} must have type: moc`);
      }
    }
  }
});

test('Professional Preset - declares deliverables workspace, 4 starter MOCs, and aligned vocabulary', () => {
  const presetYaml = fs.readFileSync(path.resolve('presets/professional/preset.yaml'), 'utf8');
  assert.ok(presetYaml.includes('- "deliverables"'), 'professional preset must declare deliverables workspace folder');
  assert.ok(presetYaml.includes('self_space: true'), 'professional preset must enable self_space by default');
  assert.ok(presetYaml.includes('personality: "pragmatic-strategic"'), 'professional preset must set pragmatic-strategic personality');

  for (const moc of ['index.md', 'engagements.md', 'responsibilities.md', 'expertise.md', 'network.md']) {
    assert.ok(
      fs.existsSync(path.resolve('presets/professional/starter', moc)),
      `Missing professional starter MOC: ${moc}`
    );
  }

  const vocabYaml = fs.readFileSync(path.resolve('presets/professional/vocabulary.yaml'), 'utf8');
  for (const term of ['note: insight', 'reduce: distill', 'reflect: connect', 'verify: review', 'reweave: align', 'moc: context map', 'deliverables: deliverables']) {
    assert.ok(vocabYaml.includes(term), `professional vocabulary.yaml must include "${term}"`);
  }

  const catsYaml = fs.readFileSync(path.resolve('presets/professional/categories.yaml'), 'utf8');
  for (const cat of ['decisions', 'workstream-context', 'domain-expertise', 'stakeholder-dynamics', 'deliverable-elements', 'risks-and-tensions']) {
    assert.ok(catsYaml.includes(cat), `professional categories.yaml must include extraction category "${cat}"`);
  }
});
