import {
  BatteryAssessmentType,
  BatteryEvidenceScope,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';

export interface PublicationHandoffReconcileCandidate {
  id: string;
  organizationId: string;
  vehicleId: string;
  inputSummary: Prisma.JsonValue;
  computedAt: Date;
}

/**
 * Targeted query for assessments with incomplete publication handoff metadata.
 * Structural invariants are enforced in SQL before LIMIT so malformed legacy rows
 * cannot starve valid canonical backlog or abort ordering via unsafe casts.
 *
 * publicationVersion must be a JSON number exactly equal to LV_PUBLICATION_CONTRACT_VERSION
 * (reader parity: integer canonical D5 version only).
 *
 * epochAssessmentIds membership uses jsonb `?` only — no jsonb_array_length on legacy JSON.
 *
 * lastAttemptAt is fairness metadata only: invalid values sort as NULL (oldest) and do
 * not exclude repairable carriers; reconciliation fairness touch normalizes to ISO.
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
      AND COALESCE(ba.input_summary->>'assessmentMode', '') = 'CANONICAL'
      AND ba.input_summary IS NOT NULL
      AND jsonb_typeof(ba.input_summary->'publicationHandoff') = 'object'
      AND ba.input_summary->'publicationHandoff'->>'status' IN ('MISSING', 'ENQUEUED')
      AND COALESCE(ba.input_summary->'publicationHandoff'->>'selectedAssessmentId', '') <> ''
      AND ba.input_summary->'publicationHandoff'->>'selectedAssessmentId' = ba.id::text
      AND ba.input_summary->'publicationHandoff'->>'assessmentTrack' IN ('TELEMETRY', 'WORKSHOP_OVERRIDE')
      AND COALESCE(ba.input_summary->'publicationHandoff'->>'idempotencyKey', '') <> ''
      AND jsonb_typeof(ba.input_summary->'publicationHandoff'->'publicationVersion') = 'number'
      AND (ba.input_summary->'publicationHandoff'->'publicationVersion') = to_jsonb(${LV_PUBLICATION_CONTRACT_VERSION}::int)
      AND jsonb_typeof(ba.input_summary->'publicationHandoff'->'epochAssessmentIds') = 'array'
      AND ba.input_summary->'publicationHandoff'->'epochAssessmentIds' ? ba.id::text
    ORDER BY
      CASE
        WHEN (ba.input_summary->'publicationHandoff'->>'lastAttemptAt') ~ '^\\d{4}-\\d{2}-\\d{2}T'
        THEN ba.input_summary->'publicationHandoff'->>'lastAttemptAt'
        ELSE NULL
      END ASC NULLS FIRST,
      ba.id ASC
    LIMIT ${input.limit}
  `;

  return rows;
}
