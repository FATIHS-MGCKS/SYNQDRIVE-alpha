import type { MisuseCaseConfidence, MisuseCaseSeverity } from '@prisma/client';
import { MISUSE_RECONCILE_CONFIRMED_PRESERVE_REASON, MISUSE_CASE_RECONCILE_VERSION } from './misuse-case-reconcile.config';
import type { ConfirmedPreserveAuditEntry, MisuseReconcileTrigger } from './misuse-case-reconcile.types';

export function buildConfirmedPreserveAudit(input: {
  trigger: MisuseReconcileTrigger;
  existingSeverity: MisuseCaseSeverity;
  existingConfidence: MisuseCaseConfidence;
  reconciledSeverity: MisuseCaseSeverity;
  reconciledConfidence: MisuseCaseConfidence;
  evaluatedAt?: Date;
}): ConfirmedPreserveAuditEntry | null {
  if (
    input.existingSeverity === input.reconciledSeverity &&
    input.existingConfidence === input.reconciledConfidence
  ) {
    return null;
  }

  return {
    modelVersion: MISUSE_CASE_RECONCILE_VERSION,
    evaluatedAt: (input.evaluatedAt ?? new Date()).toISOString(),
    trigger: input.trigger,
    wouldHaveSeverity: input.reconciledSeverity,
    wouldHaveConfidence: input.reconciledConfidence,
    preservedSeverity: input.existingSeverity,
    preservedConfidence: input.existingConfidence,
    reason: MISUSE_RECONCILE_CONFIRMED_PRESERVE_REASON,
  };
}

export function appendConfirmedPreserveAudit(
  existingSummary: Record<string, unknown> | null | undefined,
  entry: ConfirmedPreserveAuditEntry,
): Record<string, unknown> {
  const history = (existingSummary?.confirmedPreserveAuditHistory as ConfirmedPreserveAuditEntry[] | undefined) ?? [];
  return {
    confirmedPreserveAudit: entry,
    confirmedPreserveAuditHistory: [...history, entry],
  };
}
