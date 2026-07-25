import type { WorkflowActionRunDto, WorkflowRunDto } from '../../../lib/api';
import type { WorkflowRunHistoryFlags } from './workflow-simulate.types';

const SECRET_KEY_PATTERN = /secret|token|password|apikey|api_key|credential/i;

export function shouldAcceptSimulationResponse(
  responseSequence: number,
  latestSequence: number,
): boolean {
  return responseSequence === latestSequence;
}

export function sanitizeClientPreviewValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(sanitizeClientPreviewValue);
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) continue;
      result[key] = sanitizeClientPreviewValue(val);
    }
    return result;
  }
  return value;
}

export function deriveRunHistoryFlags(run: WorkflowRunDto): WorkflowRunHistoryFlags {
  const actionRuns = run.actionRuns ?? [];
  const successCount = actionRuns.filter((a) => a.status === 'SUCCESS').length;
  const failedCount = actionRuns.filter((a) => a.status === 'FAILED').length;
  const skippedCount = actionRuns.filter((a) => a.status === 'SKIPPED').length;
  const waitingApproval = actionRuns.some((a) => a.status === 'WAITING_APPROVAL');

  const partialFailure =
    run.status === 'SUCCESS' && (failedCount > 0 || skippedCount > 0)
    || (run.status === 'FAILED' && successCount > 0);

  const policySuppressed =
    run.status === 'SKIPPED'
    || Boolean(
      run.conditionResult
      && typeof run.conditionResult === 'object'
      && (run.conditionResult as { passed?: boolean }).passed === false,
    );

  const hasRetry = actionRuns.some((action) => hasRetryHint(action));

  return {
    partialFailure,
    policySuppressed,
    hasApproval: waitingApproval || actionRuns.some((a) => a.requiresApproval),
    hasRetry,
  };
}

function hasRetryHint(action: WorkflowActionRunDto): boolean {
  const output = action.output ?? {};
  if (typeof output !== 'object' || !output) return false;
  return Boolean(
    (output as { retryCount?: number }).retryCount
    || (output as { retried?: boolean }).retried,
  );
}

export function formatRunCorrelation(run: WorkflowRunDto): string {
  return run.idempotencyKey?.slice(0, 24) || run.id.slice(0, 12);
}

export function summarizeProviderStatus(action: WorkflowActionRunDto): string | null {
  const output = action.output;
  if (!output || typeof output !== 'object') return null;
  const status =
    (output as { providerStatus?: string }).providerStatus
    ?? (output as { deliveryStatus?: string }).deliveryStatus
    ?? (output as { status?: string }).status;
  return typeof status === 'string' ? status : null;
}
