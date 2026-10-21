import type {
  ManualReviewDisposition,
  ManualReviewEntry,
} from './energy-events-recovery.types';

export type ReviewedManualReviewDisposition = {
  /** Stable event identity — dimoSegmentId from recovery reconciliation. */
  dimoSegmentId: string;
  mechanism: 'refuel' | 'recharge';
  disposition: Exclude<ManualReviewDisposition, 'NEEDS_FURTHER_EVIDENCE'>;
  evidenceCategory: string;
  reviewedAt?: string;
};

/**
 * Explicit input for a historical recovery / backfill plan.
 * Reviewed dispositions bind to one candidate via dimoSegmentId — never coarse buckets.
 */
export interface EnergyEventsRecoveryPlan {
  planVersion: string;
  reviewProvenance: string;
  reviewedDispositions: ReviewedManualReviewDisposition[];
}

export type RecoveryPlanMatchFailure =
  | {
      kind: 'UNMATCHED_REVIEWED_DISPOSITION';
      dimoSegmentId: string;
      mechanism: 'refuel' | 'recharge';
    }
  | {
      kind: 'AMBIGUOUS_MANUAL_REVIEW_MATCH';
      dimoSegmentId: string;
      mechanism: 'refuel' | 'recharge';
      matchCount: number;
    };

export interface ApplyRecoveryPlanResult {
  entries: ManualReviewEntry[];
  matchFailures: RecoveryPlanMatchFailure[];
  appliedCount: number;
}

function candidateEventKey(entry: Pick<ManualReviewEntry, 'mechanism' | 'dimoSegmentId'>): string {
  return `${entry.mechanism}:${entry.dimoSegmentId}`;
}

/**
 * Applies human-reviewed dispositions from an explicit recovery plan.
 * Fail closed: each plan entry must match exactly one manual-review candidate.
 */
export function applyRecoveryPlanManualReview(
  entries: ManualReviewEntry[],
  plan: EnergyEventsRecoveryPlan,
): ApplyRecoveryPlanResult {
  const entriesByKey = new Map<string, ManualReviewEntry[]>();
  for (const entry of entries) {
    const key = candidateEventKey(entry);
    const bucket = entriesByKey.get(key) ?? [];
    bucket.push(entry);
    entriesByKey.set(key, bucket);
  }

  const matchFailures: RecoveryPlanMatchFailure[] = [];
  const overridesByKey = new Map<string, ReviewedManualReviewDisposition>();
  let appliedCount = 0;

  for (const reviewed of plan.reviewedDispositions) {
    const key = candidateEventKey(reviewed);
    const matches = entriesByKey.get(key) ?? [];

    if (matches.length === 0) {
      matchFailures.push({
        kind: 'UNMATCHED_REVIEWED_DISPOSITION',
        dimoSegmentId: reviewed.dimoSegmentId,
        mechanism: reviewed.mechanism,
      });
      continue;
    }

    if (matches.length > 1) {
      matchFailures.push({
        kind: 'AMBIGUOUS_MANUAL_REVIEW_MATCH',
        dimoSegmentId: reviewed.dimoSegmentId,
        mechanism: reviewed.mechanism,
        matchCount: matches.length,
      });
      continue;
    }

    overridesByKey.set(key, reviewed);
    appliedCount += 1;
  }

  const updatedEntries = entries.map((entry) => {
    const override = overridesByKey.get(candidateEventKey(entry));
    if (!override) return entry;

    return {
      ...entry,
      recommendation: override.disposition,
      telemetryEvidenceNotes: [
        ...entry.telemetryEvidenceNotes,
        `human_review_evidence_category:${override.evidenceCategory}`,
        `human_review_plan_version:${plan.planVersion}`,
        `human_review_provenance:${plan.reviewProvenance}`,
        ...(override.reviewedAt
          ? [`human_review_reviewed_at:${override.reviewedAt}`]
          : []),
      ],
    };
  });

  return {
    entries: updatedEntries,
    matchFailures,
    appliedCount,
  };
}

export function summarizeRecoveryPlanMatchFailures(
  failures: RecoveryPlanMatchFailure[],
): { unmatched: number; ambiguous: number } {
  return failures.reduce(
    (counts, failure) => {
      if (failure.kind === 'UNMATCHED_REVIEWED_DISPOSITION') {
        counts.unmatched += 1;
      } else {
        counts.ambiguous += 1;
      }
      return counts;
    },
    { unmatched: 0, ambiguous: 0 },
  );
}

export function parseEnergyEventsRecoveryPlan(
  raw: unknown,
): EnergyEventsRecoveryPlan {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Recovery plan must be a JSON object');
  }

  const plan = raw as Partial<EnergyEventsRecoveryPlan>;
  if (!plan.planVersion || typeof plan.planVersion !== 'string') {
    throw new Error('Recovery plan missing planVersion');
  }
  if (!plan.reviewProvenance || typeof plan.reviewProvenance !== 'string') {
    throw new Error('Recovery plan missing reviewProvenance');
  }
  if (!Array.isArray(plan.reviewedDispositions)) {
    throw new Error('Recovery plan missing reviewedDispositions array');
  }

  const reviewedDispositions = plan.reviewedDispositions.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`reviewedDispositions[${index}] must be an object`);
    }
    const row = item as Partial<ReviewedManualReviewDisposition>;
    if (!row.dimoSegmentId || typeof row.dimoSegmentId !== 'string') {
      throw new Error(`reviewedDispositions[${index}] missing dimoSegmentId`);
    }
    if (row.mechanism !== 'refuel' && row.mechanism !== 'recharge') {
      throw new Error(`reviewedDispositions[${index}] invalid mechanism`);
    }
    if (
      row.disposition !== 'APPROVE_FOR_BACKFILL' &&
      row.disposition !== 'EXCLUDE_FROM_BACKFILL'
    ) {
      throw new Error(`reviewedDispositions[${index}] invalid disposition`);
    }
    if (!row.evidenceCategory || typeof row.evidenceCategory !== 'string') {
      throw new Error(`reviewedDispositions[${index}] missing evidenceCategory`);
    }
    return {
      dimoSegmentId: row.dimoSegmentId,
      mechanism: row.mechanism,
      disposition: row.disposition,
      evidenceCategory: row.evidenceCategory,
      ...(row.reviewedAt ? { reviewedAt: row.reviewedAt } : {}),
    };
  });

  return {
    planVersion: plan.planVersion,
    reviewProvenance: plan.reviewProvenance,
    reviewedDispositions,
  };
}
