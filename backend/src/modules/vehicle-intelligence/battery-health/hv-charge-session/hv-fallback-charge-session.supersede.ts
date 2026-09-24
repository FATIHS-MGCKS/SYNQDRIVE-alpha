import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import type { ErdPhysicalMatchEvidence } from './erd-physical-episode-matcher';
import { ERD_PHYSICAL_MATCHER_VERSION } from './erd-physical-episode-matcher';
import type { HvChargeSessionMetadata, HvChargeSessionRow } from './hv-charge-session.types';

export function buildFallbackSupersessionUpdate(input: {
  existing: HvChargeSessionRow;
  dimoSegment: NormalizedDimoRechargeSegment;
  reconciledAt?: Date;
  matchEvidence?: ErdPhysicalMatchEvidence | null;
}): Record<string, unknown> {
  const reconciledAt = input.reconciledAt ?? new Date();
  const existingMeta = (input.existing.metadata ?? {}) as unknown as HvChargeSessionMetadata;

  const metadata: HvChargeSessionMetadata = {
    ...existingMeta,
    supersededBySegmentFingerprint: input.dimoSegment.fingerprint,
    supersededAt: reconciledAt.toISOString(),
    lastReconciledAt: reconciledAt.toISOString(),
    reconcileVersion: (existingMeta.reconcileVersion ?? 0) + 1,
    erdMatchVersion: ERD_PHYSICAL_MATCHER_VERSION,
    erdMatchReason: input.matchEvidence?.reasons?.join(',') ?? 'same_physical_episode',
    changeHistory: [
      ...(existingMeta.changeHistory ?? []),
      { at: reconciledAt.toISOString(), kind: 'superseded' as const },
    ].slice(-20),
  };

  return {
    isOngoing: false,
    metadata: metadata as object,
    receivedAt: reconciledAt,
  };
}
