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
      ba.organization_id AS "organizationId",
      ba.vehicle_id AS "vehicleId",
      ba.input_summary AS "inputSummary",
      ba.computed_at AS "computedAt"
    FROM battery_assessments ba
    WHERE ba.scope = ${BatteryEvidenceScope.LV}::"BatteryEvidenceScope"
      AND ba.type = ${BatteryAssessmentType.LV_ESTIMATED_HEALTH}::"BatteryAssessmentType"
      AND ba.computed_at >= ${input.lookbackFrom}
      AND ba.input_summary IS NOT NULL
      AND (ba.input_summary->'publicationHandoff'->>'status') IS NOT NULL
      AND (ba.input_summary->'publicationHandoff'->>'status') <> 'EXECUTED'
    ORDER BY
      (ba.input_summary->'publicationHandoff'->>'lastAttemptAt')::timestamptz NULLS FIRST,
      (ba.input_summary->'publicationHandoff'->>'lastAttemptAt')::timestamptz ASC,
      ba.id ASC
    LIMIT ${input.limit}
  `;

  return rows;
}
