import type { PrismaClient } from '@prisma/client';
import {
  P25_APD_B2_V1,
  P25_APD_B4_V1,
} from '../adaptive-polling-policy/p25-apd-policy-versions';
import {
  P25_APD_SHADOW_ADVANCING_DECISIONS,
  P25_APD_SHADOW_EXECUTION_V2,
} from './p25-apd-shadow-execution-versions';

/** Read-only checkpoint helper — baseline SUCCESS real polls only (V2 contract). */
export async function computeApdShadowBaselineCheckpoint(
  prisma: PrismaClient,
  input: { organizationId: string; vehicleIds: string[]; since: Date; until?: Date },
) {
  const until = input.until ?? new Date();
  const baseWhere = {
    organizationId: input.organizationId,
    vehicleId: { in: input.vehicleIds },
    shadowExecutionVersion: P25_APD_SHADOW_EXECUTION_V2,
    reconciliation: true,
    realPollStatus: 'SUCCESS',
    realPollId: { not: null },
    realPollCompletedAt: { not: null, gte: input.since, lte: until },
  };

  const baselineRows = await prisma.apdShadowReconciliationDecision.findMany({
    where: baseWhere,
    select: {
      realPollId: true,
      opportunityId: true,
      policyVersion: true,
      decision: true,
    },
    distinct: ['realPollId', 'policyVersion'],
  });

  const distinctPollIds = new Set(
    baselineRows.map((r) => r.realPollId).filter((id): id is string => id != null),
  );

  const b2Rows = baselineRows.filter((r) => r.policyVersion === P25_APD_B2_V1);
  const b4Rows = baselineRows.filter((r) => r.policyVersion === P25_APD_B4_V1);

  const countWould = (rows: typeof baselineRows) => ({
    keep: rows.filter((r) =>
      (P25_APD_SHADOW_ADVANCING_DECISIONS as readonly string[]).includes(r.decision),
    ).length,
    skip: rows.filter(
      (r) =>
        !(P25_APD_SHADOW_ADVANCING_DECISIONS as readonly string[]).includes(r.decision),
    ).length,
  });

  const b2 = countWould(b2Rows);
  const b4 = countWould(b4Rows);

  return {
    BASELINE_REAL_RECONCILIATION_POLLS: distinctPollIds.size,
    B2_WOULD_KEEP_REAL_POLL: b2.keep,
    B2_WOULD_SKIP_REAL_POLL: b2.skip,
    B4_WOULD_KEEP_REAL_POLL: b4.keep,
    B4_WOULD_SKIP_REAL_POLL: b4.skip,
  };
}
