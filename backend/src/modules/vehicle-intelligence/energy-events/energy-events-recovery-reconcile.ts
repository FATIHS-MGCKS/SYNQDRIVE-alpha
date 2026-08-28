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

function preferCandidate(
  current: EnergyRecoveryCandidate,
  incoming: EnergyRecoveryCandidate,
): EnergyRecoveryCandidate {
  const rank = (candidate: EnergyRecoveryCandidate): number => {
    switch (candidate.classification) {
      case 'ALREADY_IDENTICAL':
        return 6;
      case 'WOULD_CREATE':
        return 5;
      case 'WOULD_UPDATE':
        return 4;
      case 'MANUAL_REVIEW_REQUIRED':
        return 3;
      case 'WOULD_SKIP_NOT_PERSISTABLE':
        return 2;
      default:
        return 1;
    }
  };
  return rank(incoming) > rank(current) ? incoming : current;
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
      preferCandidate(existing, candidate),
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
