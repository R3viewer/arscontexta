#!/usr/bin/env node
import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { GUEST_PROVIDER_LOGO_BYTES_MAX } from '@openchamber/sdk';
import { parseManifestJson } from '@openchamber/sdk/schemas';

const root = resolve(process.argv[2] ?? '.');
const problems = [];

const exists = (p) => access(p).then(() => true, () => false);

const pagesIn = (manifestText) => [
  ...new Set([...manifestText.matchAll(/"([^"]+\.html)"/g)].flatMap(([, page]) => (page ? [page] : []))),
];

const checkPage = async (page) => {
  const pagePath = join(root, page);
  if (!(await exists(pagePath))) {
    problems.push(`${page} is missing.`);
    return;
  }
  const html = await readFile(pagePath, 'utf8');
  for (const [, source] of html.matchAll(/<script[^>]*\ssrc=["']([^"']+)["']/g)) {
    if (!source || /^[a-z]+:/i.test(source)) continue;
    const script = join(dirname(pagePath), source);
    if (source.endsWith('.ts')) {
      problems.push(`${page} loads ${source}. Load the bundled .js file.`);
    } else if (!(await exists(script))) {
      problems.push(`${page} loads ${source}, which is not built yet. Run npm run build:panel.`);
    }
  }
};

const checkProviderLogo = async (logo) => {
  const logoPath = join(root, logo);
  if (!(await exists(logoPath))) {
    problems.push(`${logo} is missing.`);
    return;
  }
  const { size } = await stat(logoPath);
  if (size === 0 || size > GUEST_PROVIDER_LOGO_BYTES_MAX) {
    problems.push(`${logo} must be 1 byte to 1 MB.`);
  }
};

const manifestPath = join(root, 'package.json');
if (!(await exists(manifestPath))) {
  console.error(`No package.json in ${root}.`);
  process.exit(1);
}

const parsed = parseManifestJson(await readFile(manifestPath, 'utf8'));
if (!parsed.ok) {
  console.error(`package.json: ${parsed.code}: ${parsed.message}`);
  process.exit(1);
}

const { contributes } = parsed.manifest;
await Promise.all(pagesIn(JSON.stringify(contributes)).map(checkPage));
await Promise.all([...new Set(Object.values(contributes.providerLogos ?? {}))].map(checkProviderLogo));

if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

console.log('Package is ready to add in Settings -> Extensions.');
