import type { HvChargeSession, VehicleEnergyEvent } from '@prisma/client';
import { evaluateErdRechargeProjectionEligibility } from '../erd-recharge-projection/erd-recharge-projection-eligibility.policy';
import {
  mapCanonicalHvChargeSessionToErdRechargeProjectionDraft,
  type ErdRechargeProjectionDraft,
} from '../erd-recharge-projection/erd-recharge-projection-mapper';
import type {
  ErdRechargeShadowCanonicalCandidate,
  ErdRechargeShadowCanonicalSnapshot,
} from './erd-recharge-shadow-parity.types';

function readQualityStatus(metadata: unknown): string | null {
  if (metadata == null || typeof metadata !== 'object') return null;
  const value = (metadata as { qualityStatus?: unknown }).qualityStatus;
  return typeof value === 'string' ? value : null;
}

export function isCanonicalShadowChargeSession(input: {
  session: HvChargeSession;
  organizationId: string;
  vehicleId: string;
}): boolean {
  const eligibility = evaluateErdRechargeProjectionEligibility({
    session: {
      organizationId: input.session.organizationId,
      vehicleId: input.session.vehicleId,
      source: input.session.source,
      segmentFingerprint: input.session.segmentFingerprint,
      idempotencyKey: input.session.idempotencyKey,
      startAt: input.session.startAt,
      endAt: input.session.endAt,
      isOngoing: input.session.isOngoing,
      metadata: input.session.metadata,
      qualityStatus: readQualityStatus(input.session.metadata),
    },
    scope: { organizationId: input.organizationId, vehicleId: input.vehicleId },
  });
  return eligibility.projectable;
}

export function buildCanonicalShadowDraft(input: {
  session: HvChargeSession;
  organizationId: string;
  vehicleId: string;
}): ErdRechargeProjectionDraft | null {
  if (
    !isCanonicalShadowChargeSession({
      session: input.session,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    })
  ) {
    return null;
  }
  const mapped = mapCanonicalHvChargeSessionToErdRechargeProjectionDraft({
    session: input.session,
    scope: { organizationId: input.organizationId, vehicleId: input.vehicleId },
    anchorSegmentFingerprint: input.session.segmentFingerprint,
  });
  return mapped.ok ? mapped.draft : null;
}

export function toCanonicalShadowSnapshot(input: {
  session: HvChargeSession;
  draft: ErdRechargeProjectionDraft;
}): ErdRechargeShadowCanonicalSnapshot {
  return {
    chargeSessionId: input.session.id,
    segmentFingerprint: input.session.segmentFingerprint,
    source: input.session.source,
    dimoSegmentId: input.draft.dimoSegmentId,
    draft: {
      startTime: input.draft.startTime,
      endTime: input.draft.endTime,
      durationSeconds: input.draft.durationSeconds,
      socDeltaPercent: input.draft.socDeltaPercent,
      energyDeltaKwh: input.draft.energyDeltaKwh,
      odometerStartKm: input.draft.odometerStartKm,
      odometerEndKm: input.draft.odometerEndKm,
      confidence: input.draft.confidence,
      dimoSegmentId: input.draft.dimoSegmentId,
      startLatitude: input.draft.startLatitude,
      startLongitude: input.draft.startLongitude,
      endLatitude: input.draft.endLatitude,
      endLongitude: input.draft.endLongitude,
      sourceEventKey: input.draft.sourceEventKey,
      detectionSource: input.draft.detectionSource,
      detectionMechanism: input.draft.detectionMechanism,
    },
  };
}

export function buildCanonicalShadowCandidates(input: {
  sessions: HvChargeSession[];
  organizationId: string;
  vehicleId: string;
  windowFrom: Date;
  windowTo: Date;
}): ErdRechargeShadowCanonicalCandidate[] {
  const out: ErdRechargeShadowCanonicalCandidate[] = [];
  for (const session of input.sessions) {
    if (session.endAt == null) continue;
    if (session.startAt > input.windowTo || session.endAt < input.windowFrom) continue;
    const draft = buildCanonicalShadowDraft({
      session,
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
    });
    if (draft == null) continue;
    out.push({
      sessionId: session.id,
      snapshot: toCanonicalShadowSnapshot({ session, draft }),
    });
  }
  return out;
}

/** Ensures superseded fallback F is excluded while native N remains (eligibility gate). */
export function countSupersededFallbackSessions(sessions: HvChargeSession[]): number {
  return sessions.filter((session) => {
    const meta = session.metadata;
    if (meta == null || typeof meta !== 'object') return false;
    return (
      typeof (meta as { supersededBySegmentFingerprint?: unknown })
        .supersededBySegmentFingerprint === 'string'
    );
  }).length;
}

export function filterSessionsInWindow(
  sessions: HvChargeSession[],
  windowFrom: Date,
  windowTo: Date,
): HvChargeSession[] {
  return sessions.filter((session) => {
    if (session.endAt == null) return false;
    return session.startAt <= windowTo && session.endAt >= windowFrom;
  });
}

export function canonicalCandidateWouldBindProductVee(
  candidate: ErdRechargeShadowCanonicalCandidate,
  erdProjections: VehicleEnergyEvent[],
): boolean {
  return erdProjections.some(
    (row) => row.canonicalChargeSessionId === candidate.sessionId,
  );
}
