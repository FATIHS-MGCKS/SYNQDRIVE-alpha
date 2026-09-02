import { BatteryMeasurementType, Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';

export interface RestAssessmentHandoffReconcileCandidate {
  id: string;
  organizationId: string;
  vehicleId: string;
  sessionId: string;
  type: BatteryMeasurementType;
  provenance: Prisma.JsonValue;
}

/**
 * Fetch canonical REST measurements whose session target handoff is not yet
 * EXECUTED for the same measurement id (D2 reconciliation safety net).
 *
 * Narrowing directly to incomplete candidates avoids starvation behind already
 * completed rows; OFFSET rotation (see reconciliation policy) provides
 * cross-invocation coverage when the incomplete set exceeds per-run budget.
 */
export async function fetchRestAssessmentHandoffReconcileCandidates(
  prisma: PrismaService,
  input: {
    lookbackFrom: Date;
    offset: number;
    limit: number;
  },
): Promise<RestAssessmentHandoffReconcileCandidate[]> {
  const { lookbackFrom, offset, limit } = input;
  if (limit <= 0) {
    return [];
  }

  return prisma.$queryRaw<RestAssessmentHandoffReconcileCandidate[]>(Prisma.sql`
    SELECT
      m.id AS "id",
      m.organization_id AS "organizationId",
      m.vehicle_id AS "vehicleId",
      m.session_id AS "sessionId",
      m.type AS "type",
      m.provenance AS "provenance"
    FROM battery_measurements m
    INNER JOIN battery_measurement_sessions s
      ON s.id = m.session_id
      AND s.organization_id = m.organization_id
    WHERE m.type IN ('REST_60M', 'REST_6H')
      AND m.session_id IS NOT NULL
      AND m.created_at >= ${lookbackFrom}
      AND COALESCE(m.provenance->>'sourceObservationId', '') <> ''
      AND NOT (
        COALESCE(
          s.metadata #>> ARRAY['scheduledTargets', m.type::text, 'assessmentHandoff', 'status'],
          'MISSING'
        ) = 'EXECUTED'
        AND COALESCE(
          s.metadata #>> ARRAY['scheduledTargets', m.type::text, 'assessmentHandoff', 'measurementId'],
          ''
        ) = m.id
      )
    ORDER BY m.id ASC
    OFFSET ${offset}
    LIMIT ${limit}
  `);
}
