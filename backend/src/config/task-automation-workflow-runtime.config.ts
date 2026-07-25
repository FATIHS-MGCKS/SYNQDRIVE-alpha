import { registerAs } from '@nestjs/config';

export type TaskAutomationWorkflowRuntimeMode = 'legacy' | 'shadow' | 'cutover';

function parseMode(raw: string | undefined): TaskAutomationWorkflowRuntimeMode {
  if (raw === 'shadow' || raw === 'cutover') return raw;
  return 'legacy';
}

export default registerAs('taskAutomationWorkflowRuntime', () => ({
  /**
   * legacy  — catalog automation writes tasks directly (default, production-safe)
   * shadow  — legacy writes + workflow task.create preview (no duplicate writes)
   * cutover — workflow task.create adapter only (legacy upsert skipped)
   */
  mode: parseMode(process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE),
}));

export function resolveTaskAutomationWorkflowRuntimeMode(
  env: string | undefined = process.env.TASK_AUTOMATION_WORKFLOW_RUNTIME_MODE,
): TaskAutomationWorkflowRuntimeMode {
  return parseMode(env);
}
