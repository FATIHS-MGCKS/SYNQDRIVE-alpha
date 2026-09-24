import {
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  type BatteryRestSession,
  type BatteryRestSessionFeature,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from '../rest-session-feature.constants';

export type LongitudinalInputRepositoryDb = Pick<
  PrismaService,
  'batteryRestSession' | '$queryRaw'
>;

export type LongitudinalInputReadSnapshot = {
  sessions: BatteryRestSession[];
  canonicalCandidates: BatteryRestSessionFeature[];
};

export type LongitudinalInputSnapshotHooks = {
  pauseAfterSessionReadInSnapshot?: () => Promise<void>;
};

export class LongitudinalInputRepository {
  constructor(private readonly db: LongitudinalInputRepositoryDb) {}

  async readBoundedRestSessions(input: {
    organizationId: string;
    vehicleId: string;
    limit: number;
  }): Promise<BatteryRestSession[]> {
    return this.db.batteryRestSession.findMany({
      where: {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      },
      orderBy: [{ anchorAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
    });
  }

  /**
   * Batch canonical candidates: at most one row per (restSessionId, phase, trust)
   * with highest semanticRevision — C5A-equivalent candidate set, single query.
   */
  async listBatchCanonicalCandidateRows(input: {
    organizationId: string;
    vehicleId: string;
    restSessionIds: string[];
  }): Promise<BatteryRestSessionFeature[]> {
    if (input.restSessionIds.length === 0) {
      return [];
    }

    const rows = await this.db.$queryRaw<BatteryRestSessionFeature[]>`
      SELECT ranked.id,
        ranked.organization_id AS "organizationId",
        ranked.vehicle_id AS "vehicleId",
        ranked.rest_session_id AS "restSessionId",
        ranked.feature_model_version AS "featureModelVersion",
        ranked.retention_policy_version AS "retentionPolicyVersion",
        ranked.charge_opportunity_policy_version AS "chargeOpportunityPolicyVersion",
        ranked.semantic_revision AS "semanticRevision",
        ranked.input_digest AS "inputDigest",
        ranked.input_summary AS "inputSummary",
        ranked.computation_phase AS "computationPhase",
        ranked.session_trust AS "sessionTrust",
        ranked.charge_opportunity_class AS "chargeOpportunityClass",
        ranked.charge_opportunity_raw AS "chargeOpportunityRaw",
        ranked.shutdown_to_first_rest_delta_mv AS "shutdownToFirstRestDeltaMv",
        ranked.robust_rest_slope_mv_per_hour AS "robustRestSlopeMvPerHour",
        ranked.minimum_rest_voltage_mv AS "minimumRestVoltageMv",
        ranked.maximum_rest_voltage_mv AS "maximumRestVoltageMv",
        ranked.median_rest_voltage_mv AS "medianRestVoltageMv",
        ranked.rest_voltage_variance_mv2 AS "restVoltageVarianceMv2",
        ranked.number_of_valid_rest_points AS "numberOfValidRestPoints",
        ranked.max_actual_rest_age_ms AS "maxActualRestAgeMs",
        ranked.max_inter_observation_gap_ms AS "maxInterObservationGapMs",
        ranked.observation_span_ms AS "observationSpanMs",
        ranked.missing_rung_count AS "missingRungCount",
        ranked.pairwise_rest_deltas AS "pairwiseRestDeltas",
        ranked.computed_at AS "computedAt",
        ranked.created_at AS "createdAt"
      FROM (
        SELECT
          f.*,
          ROW_NUMBER() OVER (
            PARTITION BY f.rest_session_id, f.computation_phase, f.session_trust
            ORDER BY f.semantic_revision DESC
          ) AS rn
        FROM battery_rest_session_features f
        WHERE f.organization_id = ${input.organizationId}
          AND f.vehicle_id = ${input.vehicleId}
          AND f.rest_session_id = ANY(${input.restSessionIds}::text[])
          AND f.feature_model_version = ${REST_SESSION_FEATURE_MODEL_VERSION}
          AND f.retention_policy_version = ${REST_SESSION_RETENTION_POLICY_VERSION}
          AND f.charge_opportunity_policy_version = ${REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION}
      ) ranked
      WHERE ranked.rn = 1
    `;

    return rows.map((row) => ({
      ...row,
      robustRestSlopeMvPerHour:
        row.robustRestSlopeMvPerHour != null
          ? Number(row.robustRestSlopeMvPerHour)
          : null,
      restVoltageVarianceMv2:
        row.restVoltageVarianceMv2 != null
          ? Number(row.restVoltageVarianceMv2)
          : null,
    }));
  }

  async loadLongitudinalInputReadSnapshot(
    input: {
      organizationId: string;
      vehicleId: string;
      sessionLimit: number;
    },
    hooks?: LongitudinalInputSnapshotHooks,
  ): Promise<LongitudinalInputReadSnapshot> {
    const sessions = await this.readBoundedRestSessions({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      limit: input.sessionLimit,
    });
    await hooks?.pauseAfterSessionReadInSnapshot?.();
    const restSessionIds = sessions.map((session) => session.id);
    const canonicalCandidates = await this.listBatchCanonicalCandidateRows({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restSessionIds,
    });
    return { sessions, canonicalCandidates };
  }
}

export function groupCanonicalCandidatesByRestSessionId(
  rows: BatteryRestSessionFeature[],
): Map<string, BatteryRestSessionFeature[]> {
  const map = new Map<string, BatteryRestSessionFeature[]>();
  for (const row of rows) {
    const existing = map.get(row.restSessionId) ?? [];
    existing.push(row);
    map.set(row.restSessionId, existing);
  }
  return map;
}

export function countCandidatePhaseTrustPairs(
  rows: BatteryRestSessionFeature[],
  restSessionId: string,
): number {
  const pairs = new Set<string>();
  for (const row of rows) {
    if (row.restSessionId !== restSessionId) continue;
    pairs.add(`${row.computationPhase}:${row.sessionTrust}`);
  }
  return pairs.size;
}
