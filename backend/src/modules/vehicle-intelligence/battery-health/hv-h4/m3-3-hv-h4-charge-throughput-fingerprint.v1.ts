import { createHash } from 'crypto';
import type { HvChargeSessionMetadata } from '../hv-charge-session/hv-charge-session.types';
import type { M3_3HvH4ChargeSessionScientificRowV1 } from './m3-3-hv-h4-charge-session-scientific-row.v1';
import type {
  M3_3HvH4ChargeThroughputCompositionStatus,
  M3_3HvH4ChargeThroughputSessionClassificationV1,
} from './m3-3-hv-h4-charge-throughput.types';

function canonicalSessionIdentity(session: M3_3HvH4ChargeSessionScientificRowV1): {
  sessionId: string;
  segmentFingerprint: string;
  canonicalDimoSegmentFingerprintId: string | null;
  providerSegmentId: string | null;
  source: string;
  startAt: string;
  endAt: string | null;
  energyAddedKwh: number | null;
  providerObservedAt: string | null;
  addedEnergyProvenance: string | null;
  qualityStatus: string | null;
} {
  const meta = (session.metadata ?? {}) as unknown as HvChargeSessionMetadata;
  return {
    sessionId: session.id,
    segmentFingerprint: session.segmentFingerprint,
    canonicalDimoSegmentFingerprintId: session.dimoSegmentId,
    providerSegmentId: meta.providerSegmentId ?? null,
    source: session.source,
    startAt: session.startAt.toISOString(),
    endAt: session.endAt?.toISOString() ?? null,
    energyAddedKwh: session.energyAddedKwh,
    providerObservedAt: session.providerObservedAt?.toISOString() ?? null,
    addedEnergyProvenance: meta.addedEnergyProvenance ?? null,
    qualityStatus: meta.qualityStatus ?? null,
  };
}

function canonicalClassificationIdentity(
  c: M3_3HvH4ChargeThroughputSessionClassificationV1,
): {
  sessionId: string;
  lifecycleSegmentId: string;
  contributionEligibility: string;
  reasonCodes: string[];
} {
  return {
    sessionId: c.sessionId,
    lifecycleSegmentId: c.lifecycleSegmentId,
    contributionEligibility: c.contributionEligibility,
    reasonCodes: [...c.reasonCodes].sort(),
  };
}

/** Fixed field order; arrays sorted by stable keys — no arbitrary object key order. */
export function buildM3_3HvH4SegmentSourceFingerprintV1(input: {
  contractVersion: string;
  coverageReportVersion: string;
  exposureSourceAuthorityVersion: string;
  organizationId: string;
  vehicleId: string;
  lifecycleSegmentId: string;
  evaluationAt: string;
  compositionStatus: M3_3HvH4ChargeThroughputCompositionStatus;
  segmentReasonCodes: string[];
  chargeSessionSourceLoad: {
    loadedCount: number;
    hardLimit: number;
    sourceTruncated: boolean;
    hardLimitReached: boolean;
  };
  includedSessions: M3_3HvH4ChargeSessionScientificRowV1[];
  conflictCandidateSessions: M3_3HvH4ChargeSessionScientificRowV1[];
  segmentSessionClassifications: M3_3HvH4ChargeThroughputSessionClassificationV1[];
}): string {
  const segmentReasonCodes = [...input.segmentReasonCodes].sort();
  const includedSessions = [...input.includedSessions]
    .sort((a, b) => {
      const d = a.startAt.getTime() - b.startAt.getTime();
      if (d !== 0) return d;
      const e = (a.endAt?.getTime() ?? 0) - (b.endAt?.getTime() ?? 0);
      if (e !== 0) return e;
      return a.id.localeCompare(b.id);
    })
    .map((s) => canonicalSessionIdentity(s));

  const conflictCandidates = [...input.conflictCandidateSessions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => canonicalSessionIdentity(s));

  const observedClassifications = [...input.segmentSessionClassifications]
    .sort((a, b) => a.sessionId.localeCompare(b.sessionId))
    .map((c) => canonicalClassificationIdentity(c));

  const payload = [
    input.contractVersion,
    input.coverageReportVersion,
    input.exposureSourceAuthorityVersion,
    input.organizationId,
    input.vehicleId,
    input.lifecycleSegmentId,
    input.evaluationAt,
    input.compositionStatus,
    segmentReasonCodes,
    input.chargeSessionSourceLoad.loadedCount,
    input.chargeSessionSourceLoad.hardLimit,
    input.chargeSessionSourceLoad.sourceTruncated,
    input.chargeSessionSourceLoad.hardLimitReached,
    includedSessions,
    conflictCandidates,
    observedClassifications,
  ];

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
