#!/usr/bin/env node
import path from 'node:path';
import { build } from 'esbuild';

const entryPoints = [
  { in: 'panel/main.ts', out: 'panel/main.js' },
  { in: 'panel/status.ts', out: 'panel/status.js' },
  { in: 'panel/background.ts', out: 'panel/background.js' },
];

for (const entry of entryPoints) {
  await build({
    entryPoints: [path.resolve(entry.in)],
    outfile: path.resolve(entry.out),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2022'],
    minify: false,
    sourcemap: false,
    logLevel: 'info',
  });
}
