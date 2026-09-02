import {
  BatteryAssessmentType,
  BatteryEvidenceScope,
  Prisma,
  type PrismaClient,
} from '@prisma/client';

export interface PublicationHandoffReconcileCandidate {
  id: string;
  organizationId: string;
  vehicleId: string;
  inputSummary: Prisma.JsonValue;
  computedAt: Date;
}

/**
 * Targeted query for assessments with incomplete publication handoff metadata.
 * Uses durable epoch correlation stored on the selected assessment row.
 */
export async function fetchPublicationHandoffReconcileCandidates(
  prisma: PrismaClient,
  input: {
    lookbackFrom: Date;
    limit: number;
  },
): Promise<PublicationHandoffReconcileCandidate[]> {
  const rows = await prisma.$queryRaw<PublicationHandoffReconcileCandidate[]>`
    SELECT
      ba.id,
      ba."organizationId",
      ba."vehicleId",
      ba."inputSummary",
      ba."computedAt"
    FROM "BatteryAssessment" ba
    WHERE ba.scope = ${BatteryEvidenceScope.LV}::"BatteryEvidenceScope"
      AND ba.type = ${BatteryAssessmentType.LV_ESTIMATED_HEALTH}::"BatteryAssessmentType"
      AND ba."computedAt" >= ${input.lookbackFrom}
      AND ba."inputSummary" IS NOT NULL
      AND (ba."inputSummary"->'publicationHandoff'->>'status') IS NOT NULL
      AND (ba."inputSummary"->'publicationHandoff'->>'status') <> 'EXECUTED'
    ORDER BY
      (ba."inputSummary"->'publicationHandoff'->>'lastAttemptAt')::timestamptz NULLS FIRST,
      (ba."inputSummary"->'publicationHandoff'->>'lastAttemptAt')::timestamptz ASC,
      ba.id ASC
    LIMIT ${input.limit}
  `;

  return rows;
}
