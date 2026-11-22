export const meta = {
  name: 'process-queue',
  description: 'Process pending Ars Contexta queue tasks in isolated workers with serialized MOC consolidation.',
  phases: ['Read Queue', 'Process Claims', 'Consolidate & Cross-Connect'],
};

const maxTasks = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 20) : 8;
const batchFilter = typeof args.batch === 'string' && args.batch.trim() ? args.batch.trim() : null;
const fastModel = typeof args.fastModel === 'string' && args.fastModel.trim() ? args.fastModel.trim() : undefined;
const primaryModel = typeof args.primaryModel === 'string' && args.primaryModel.trim() ? args.primaryModel.trim() : undefined;

phase('Read Queue');
const queueSnapshot = await agent({
  ...(fastModel ? { model: fastModel } : {}),
  phase: 'Read Queue',
  prompt:
    'Read ops/derivation-manifest.md (or ops/derivation.md) and the active queue file ' +
    '(ops/queue/queue.json, ops/queue/queue.yaml, or ops/queue.yaml). ' +
    (batchFilter ? `Filter to batch "${batchFilter}". ` : '') +
    `Return up to ${maxTasks} pending tasks (status == "pending") with the resolved notes folder.`,
  schema: {
    type: 'object',
    properties: {
      notesDir: { type: 'string' },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            file: { type: 'string' },
            target: { type: 'string' },
            batch: { type: 'string' },
            currentPhase: { type: 'string' },
          },
          required: ['id', 'file', 'target', 'currentPhase'],
          additionalProperties: false,
        },
      },
    },
    required: ['notesDir', 'tasks'],
    additionalProperties: false,
  },
});

if (!queueSnapshot || !Array.isArray(queueSnapshot.tasks) || queueSnapshot.tasks.length === 0) {
  log('No pending queue tasks found.');
  return { processed: 0, consolidated: false };
}

phase('Process Claims');
const siblingList = queueSnapshot.tasks.map((t) => `- [[${t.target}]] (${t.file})`).join('\n');

const workerResults = await parallel(
  queueSnapshot.tasks.map((task) => async () => {
    const result = await agent({
      agent: 'knowledge-worker',
      ...(fastModel ? { model: fastModel } : {}),
      phase: 'Process Claims',
      prompt:
        `Process ONLY the isolated note creation/enrichment and initial verification for task "${task.id}".\n` +
        `Task file: ops/queue/${task.file}\n` +
        `Target: ${task.target}\n` +
        `Current phase: ${task.currentPhase}\n` +
        `Notes directory: ${queueSnapshot.notesDir}\n\n` +
        `IMPORTANT CONCURRENCY RULE:\n` +
        `- Create or enrich ONLY this single note file and verify its YAML frontmatter + description.\n` +
        `- Do NOT edit shared MOCs or older notes yet (Phase 3 handles MOC updates & reweave serially).\n\n` +
        `Sibling claims in this run:\n${siblingList}\n\n` +
        `Return the created/updated note path, title, and a brief summary.`,
      schema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          noteTitle: { type: 'string' },
          notePath: { type: 'string' },
          status: { type: 'string', enum: ['completed', 'skipped', 'failed'] },
          summary: { type: 'string' },
        },
        required: ['taskId', 'noteTitle', 'notePath', 'status'],
        additionalProperties: false,
      },
    });
    return result;
  })
);

const completedWorkers = workerResults.filter((r) => r && r.status === 'completed');

phase('Consolidate & Cross-Connect');
const consolidation = await agent({
  ...(primaryModel ? { model: primaryModel } : {}),
  phase: 'Consolidate & Cross-Connect',
  prompt:
    'Run the serialized consolidation pass for the notes processed in Phase 2.\n' +
    'Completed worker outputs:\n' +
    JSON.stringify(completedWorkers, null, 2) +
    '\n\nInstructions:\n' +
    '1. Update relevant Topic Maps (MOCs) with context phrases for each new/updated note.\n' +
    '2. Add genuine cross-links between sibling notes and backward links from older notes (reweave).\n' +
    '3. Update the queue file status/completed_phases for completed tasks.\n' +
    '4. Return a concise final summary.',
});

return {
  processed: completedWorkers.length,
  attempted: queueSnapshot.tasks.length,
  consolidation,
};
