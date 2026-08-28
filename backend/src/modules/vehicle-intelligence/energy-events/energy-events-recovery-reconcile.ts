import type { EnergyRecoveryCandidate } from './energy-events-recovery.types';

const SUBSTANTIAL_OVERLAP_RATIO = 0.5;

function parseTime(value: string): number {
  return new Date(value).getTime();
}

function overlapDurationMs(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): number {
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return Math.max(0, end - start);
}

function rangesSubstantiallyOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  const aStartMs = parseTime(aStart);
  const aEndMs = parseTime(aEnd);
  const bStartMs = parseTime(bStart);
  const bEndMs = parseTime(bEnd);
  const overlap = overlapDurationMs(aStartMs, aEndMs, bStartMs, bEndMs);
  if (overlap <= 0) return false;

  const aDuration = Math.max(1, aEndMs - aStartMs);
  const bDuration = Math.max(1, bEndMs - bStartMs);
  const shorter = Math.min(aDuration, bDuration);
  return overlap / shorter >= SUBSTANTIAL_OVERLAP_RATIO;
}

function hasMaterialPayloadMismatch(
  left: EnergyRecoveryCandidate,
  right: EnergyRecoveryCandidate,
): boolean {
  return (
    left.startTime !== right.startTime ||
    left.endTime !== right.endTime ||
    left.durationSeconds !== right.durationSeconds ||
    left.fuelDeltaLiters !== right.fuelDeltaLiters ||
    left.fuelDeltaPercent !== right.fuelDeltaPercent ||
    left.socDeltaPercent !== right.socDeltaPercent ||
    left.energyDeltaKwh !== right.energyDeltaKwh ||
    left.confidence !== right.confidence ||
    (left.odometerStartKm ?? null) !== (right.odometerStartKm ?? null) ||
    (left.odometerEndKm ?? null) !== (right.odometerEndKm ?? null)
  );
}

function mergeManualReviewReasons(
  left: EnergyRecoveryCandidate,
  right: EnergyRecoveryCandidate,
  extra: string[] = [],
): string[] {
  return [...new Set([...left.manualReviewReasons, ...right.manualReviewReasons, ...extra])];
}

function mergeSameIdCandidates(
  current: EnergyRecoveryCandidate,
  incoming: EnergyRecoveryCandidate,
): EnergyRecoveryCandidate {
  const payloadMismatch = hasMaterialPayloadMismatch(current, incoming);
  const reasons = mergeManualReviewReasons(
    current,
    incoming,
    payloadMismatch ? ['same_id_material_payload_mismatch'] : [],
  );

  const requiresManualReview =
    current.classification === 'MANUAL_REVIEW_REQUIRED' ||
    incoming.classification === 'MANUAL_REVIEW_REQUIRED' ||
    payloadMismatch;

  if (requiresManualReview) {
    return {
      ...incoming,
      classification: 'MANUAL_REVIEW_REQUIRED',
      manualReviewReasons: reasons,
      overlapRelation: current.overlapRelation ?? incoming.overlapRelation,
      existingDbRelation: current.existingDbRelation ?? incoming.existingDbRelation,
      existingRowId: current.existingRowId ?? incoming.existingRowId,
    };
  }

  const rank = (candidate: EnergyRecoveryCandidate): number => {
    switch (candidate.classification) {
      case 'ALREADY_IDENTICAL':
        return 6;
      case 'WOULD_CREATE':
        return 5;
      case 'WOULD_UPDATE':
        return 4;
      case 'WOULD_SKIP_NOT_PERSISTABLE':
        return 2;
      default:
        return 1;
    }
  };

  return rank(incoming) >= rank(current) ? incoming : current;
}

function markManualReview(
  candidate: EnergyRecoveryCandidate,
  reason: string,
  overlapRelation?: string,
  existingDbRelation?: string,
): EnergyRecoveryCandidate {
  const reasons = candidate.manualReviewReasons.includes(reason)
    ? candidate.manualReviewReasons
    : [...candidate.manualReviewReasons, reason];
  return {
    ...candidate,
    classification: 'MANUAL_REVIEW_REQUIRED',
    manualReviewReasons: reasons,
    overlapRelation: overlapRelation ?? candidate.overlapRelation,
    existingDbRelation: existingDbRelation ?? candidate.existingDbRelation,
  };
}

function isSubsumedExistingSubsegmentOverlap(
  candidate: EnergyRecoveryCandidate,
  existingStart: Date,
  existingEnd: Date,
): boolean {
  if (!candidate.existingRowId) return false;
  const candidateStart = parseTime(candidate.startTime);
  const candidateEnd = parseTime(candidate.endTime);
  const existingStartMs = existingStart.getTime();
  const existingEndMs = existingEnd.getTime();
  return (
    existingStartMs >= candidateStart &&
    existingEndMs <= candidateEnd &&
  candidate.classification !== 'WOULD_CREATE'
  );
}

function isSamePhysicalRechargeSession(
  candidate: EnergyRecoveryCandidate,
  existing: {
    startTime: Date;
    endTime: Date;
    socDeltaPercent: number | null;
    energyDeltaKwh: number | null;
  },
): boolean {
  if (candidate.mechanism !== 'recharge') return false;
  const overlapStart = Math.max(
    parseTime(candidate.startTime),
    existing.startTime.getTime(),
  );
  const overlapEnd = Math.min(
    parseTime(candidate.endTime),
    existing.endTime.getTime(),
  );
  const overlapMs = Math.max(0, overlapEnd - overlapStart);
  if (overlapMs <= 0) return false;

  const candidateDuration = Math.max(
    1,
    parseTime(candidate.endTime) - parseTime(candidate.startTime),
  );
  const existingDuration = Math.max(
    1,
    existing.endTime.getTime() - existing.startTime.getTime(),
  );
  const shorter = Math.min(candidateDuration, existingDuration);
  if (overlapMs / shorter < 0.5) return false;

  const candidateOdo =
    candidate.odometerStartKm != null && candidate.odometerEndKm != null
      ? Math.abs(candidate.odometerEndKm - candidate.odometerStartKm)
      : 0;
  const socClose =
    candidate.socDeltaPercent != null &&
    existing.socDeltaPercent != null &&
    Math.abs(candidate.socDeltaPercent - existing.socDeltaPercent) <= 3;
  const energyClose =
    candidate.energyDeltaKwh != null &&
    existing.energyDeltaKwh != null &&
    Math.abs(candidate.energyDeltaKwh - existing.energyDeltaKwh) <= 2;
  const stationary = candidateOdo <= 2;

  return stationary && (socClose || energyClose);
}

export interface ReconcileRecoveryCandidatesResult {
  candidates: EnergyRecoveryCandidate[];
  deduplicatedCount: number;
  crossWindowOverlapFlags: number;
  existingDbOverlapFlags: number;
}

export function reconcileRecoveryCandidates(
  candidates: EnergyRecoveryCandidate[],
  existingEventsByVehicle: Map<
    string,
    Array<{
      id: string;
      dimoSegmentId: string;
      kind: string;
      startTime: Date;
      endTime: Date;
      socDeltaPercent?: number | null;
      energyDeltaKwh?: number | null;
    }>
  >,
): ReconcileRecoveryCandidatesResult {
  const passthrough = candidates.filter(
    (candidate) =>
      candidate.classification === 'FETCH_FAILED' ||
      candidate.classification === 'WOULD_REPLACE_LEGACY_SUBSEGMENTS',
  );
  const logical = candidates.filter(
    (candidate) =>
      candidate.classification !== 'FETCH_FAILED' &&
      candidate.classification !== 'WOULD_REPLACE_LEGACY_SUBSEGMENTS',
  );

  const byDimoSegmentId = new Map<string, EnergyRecoveryCandidate>();
  let deduplicatedCount = 0;

  for (const candidate of logical) {
    const existing = byDimoSegmentId.get(candidate.dimoSegmentId);
    if (!existing) {
      byDimoSegmentId.set(candidate.dimoSegmentId, candidate);
      continue;
    }
    deduplicatedCount += 1;
    byDimoSegmentId.set(
      candidate.dimoSegmentId,
      mergeSameIdCandidates(existing, candidate),
    );
  }

  let reconciled = [...byDimoSegmentId.values()];
  let crossWindowOverlapFlags = 0;
  let existingDbOverlapFlags = 0;

  for (let i = 0; i < reconciled.length; i++) {
    for (let j = i + 1; j < reconciled.length; j++) {
      const left = reconciled[i];
      const right = reconciled[j];
      if (left.vehicleId !== right.vehicleId || left.mechanism !== right.mechanism) {
        continue;
      }
      if (left.dimoSegmentId === right.dimoSegmentId) continue;
      if (
        rangesSubstantiallyOverlap(
          left.startTime,
          left.endTime,
          right.startTime,
          right.endTime,
        )
      ) {
        crossWindowOverlapFlags += 1;
        reconciled[i] = markManualReview(
          left,
          'cross_window_overlapping_different_id',
          `overlaps ${right.dimoSegmentId}`,
        );
        reconciled[j] = markManualReview(
          right,
          'cross_window_overlapping_different_id',
          `overlaps ${left.dimoSegmentId}`,
        );
      }
    }
  }

  reconciled = reconciled.map((candidate) => {
    const existingRows = existingEventsByVehicle.get(candidate.vehicleId) ?? [];
    for (const existing of existingRows) {
      if (existing.dimoSegmentId === candidate.dimoSegmentId) continue;
      const existingKind =
        candidate.mechanism === 'refuel' ? 'REFUEL' : 'RECHARGE';
      if (existing.kind !== existingKind) continue;
      if (
        rangesSubstantiallyOverlap(
          candidate.startTime,
          candidate.endTime,
          existing.startTime.toISOString(),
          existing.endTime.toISOString(),
        )
      ) {
        if (
          isSubsumedExistingSubsegmentOverlap(
            candidate,
            existing.startTime,
            existing.endTime,
          )
        ) {
          continue;
        }
        if (
          isSamePhysicalRechargeSession(candidate, {
            startTime: existing.startTime,
            endTime: existing.endTime,
            socDeltaPercent: existing.socDeltaPercent ?? null,
            energyDeltaKwh: existing.energyDeltaKwh ?? null,
          })
        ) {
          existingDbOverlapFlags += 1;
          return {
            ...candidate,
            classification: 'MANUAL_REVIEW_REQUIRED',
            manualReviewReasons: [
              ...new Set([
                ...candidate.manualReviewReasons,
                'same_physical_session_existing_db',
              ]),
            ],
            existingDbRelation: `same physical session as existing row ${existing.id} (${existing.dimoSegmentId})`,
            existingRowId: candidate.existingRowId ?? existing.id,
          };
        }
        existingDbOverlapFlags += 1;
        return markManualReview(
          candidate,
          'existing_db_overlap_different_id',
          undefined,
          `overlaps existing row ${existing.id} (${existing.dimoSegmentId})`,
        );
      }
    }
    return candidate;
  });

  return {
    candidates: [...passthrough, ...reconciled],
    deduplicatedCount,
    crossWindowOverlapFlags,
    existingDbOverlapFlags,
  };
}
