import type { NormalizedDimoRechargeSegment } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';
import { sessionsOverlap } from './hv-fallback-charge-session.policy';
import type { HvChargeSessionMetadata, HvChargeSessionRow } from './hv-charge-session.types';
import { HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK } from './hv-charge-session.types';

export function findOverlappingFallbackSessions(
  fallbackSessions: HvChargeSessionRow[],
  dimoStartAt: Date,
  dimoEndAt: Date | null,
): HvChargeSessionRow[] {
  return fallbackSessions.filter(
    (session) =>
      session.source === HV_CHARGE_SESSION_SOURCE_TELEMETRY_POLL_FALLBACK &&
      sessionsOverlap(session.startAt, session.endAt, dimoStartAt, dimoEndAt),
  );
}

export function buildFallbackSupersessionUpdate(input: {
  existing: HvChargeSessionRow;
  dimoSegment: NormalizedDimoRechargeSegment;
  reconciledAt?: Date;
}): Record<string, unknown> {
  const reconciledAt = input.reconciledAt ?? new Date();
  const existingMeta = (input.existing.metadata ?? {}) as unknown as HvChargeSessionMetadata;

  const metadata: HvChargeSessionMetadata = {
    ...existingMeta,
    supersededBySegmentFingerprint: input.dimoSegment.fingerprint,
    supersededAt: reconciledAt.toISOString(),
    lastReconciledAt: reconciledAt.toISOString(),
    reconcileVersion: (existingMeta.reconcileVersion ?? 0) + 1,
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
