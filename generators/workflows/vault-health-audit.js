export const meta = {
  name: 'vault-health-audit',
  description: 'Run parallel Ars Contexta vault health diagnostics across schema, links, boundaries, and MOC coherence.',
  phases: ['Parallel Diagnostics', 'Synthesize Report'],
};

const fastModel = typeof args.fastModel === 'string' && args.fastModel.trim() ? args.fastModel.trim() : undefined;
const primaryModel = typeof args.primaryModel === 'string' && args.primaryModel.trim() ? args.primaryModel.trim() : undefined;

phase('Parallel Diagnostics');
const [schemaAndLinks, boundariesAndThroughput, mocAndStale] = await parallel([
  () =>
    agent({
      ...(fastModel ? { model: fastModel } : {}),
      phase: 'Parallel Diagnostics',
      prompt:
        'Audit Categories 1-4 (Schema Compliance, Orphan Detection, Link Health, Description Quality) ' +
        'for this Ars Contexta vault. Read ops/derivation-manifest.md and ops/config.yaml for domain folder names. ' +
        'Run node reference/validate-kernel.mjs if present (or arscontexta_validate_kernel). ' +
        'Return exact counts, status (PASS/WARN/FAIL), and specific file paths.',
    }),
  () =>
    agent({
      ...(fastModel ? { model: fastModel } : {}),
      phase: 'Parallel Diagnostics',
      prompt:
        'Audit Categories 5-6 (Three-Space Boundaries across self/notes/ops, Processing Throughput inbox vs notes) ' +
        'plus condition-based maintenance signals (ops/observations/, ops/tensions/, ops/sessions/, ops/queue/). ' +
        'Return exact counts, status (PASS/WARN/FAIL), and specific file paths.',
    }),
  () =>
    agent({
      ...(fastModel ? { model: fastModel } : {}),
      phase: 'Parallel Diagnostics',
      prompt:
        'Audit Categories 7-8 (Stale Note Detection and MOC/Topic Map Coherence including bare links without context phrases). ' +
        'Return exact counts, status (PASS/WARN/FAIL), and specific file paths.',
    }),
]);

phase('Synthesize Report');
const report = await agent({
  ...(primaryModel ? { model: primaryModel } : {}),
  phase: 'Synthesize Report',
  prompt:
    'Synthesize these 3 diagnostic findings into the standard Ars Contexta Health Report, ' +
    'write it to ops/health/YYYY-MM-DD-report.md (using today\'s date without overwriting an existing report), ' +
    'and list the top 3 ranked recommended actions.\n\n' +
    '=== Schema & Links ===\n' +
    String(schemaAndLinks ?? 'No data') +
    '\n\n=== Boundaries & Throughput ===\n' +
    String(boundariesAndThroughput ?? 'No data') +
    '\n\n=== Stale Notes & MOC Coherence ===\n' +
    String(mocAndStale ?? 'No data'),
});

return report;
