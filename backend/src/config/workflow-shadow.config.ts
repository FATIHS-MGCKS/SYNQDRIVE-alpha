import { registerAs } from '@nestjs/config';

export default registerAs('workflowShadow', () => ({
  /** Global kill-switch — org settings still required per tenant. */
  globallyEnabled: process.env.WORKFLOW_SHADOW_GLOBALLY_ENABLED === 'true',
  defaultRetentionDays: Number(process.env.WORKFLOW_SHADOW_RETENTION_DAYS ?? 30),
  /** Max shadow evaluations per processEvent batch (safety cap). */
  maxEvaluationsPerEvent: Number(process.env.WORKFLOW_SHADOW_MAX_EVALS_PER_EVENT ?? 20),
}));
