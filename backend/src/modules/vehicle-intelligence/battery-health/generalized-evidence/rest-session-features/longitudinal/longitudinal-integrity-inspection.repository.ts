import {
  Prisma,
  type BatteryLongitudinalProfileRevision,
  type BatteryRestSessionFeature,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS } from '../rest-session-feature.constants';
import type { RestSessionFeatureRevisionIntegrityAggregate } from '../rest-session-feature-inspection.repository.types';
import { D4InspectionDbRoundTripBudget } from './longitudinal-integrity-inspection.db-round-trips';
import type { D4InspectionRequest } from './longitudinal-integrity-inspection.types';
import { buildD4SessionVersionKey } from './longitudinal-integrity-inspection.source-integrity';

export type D4SessionVersionKeyInput = {
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  featureModelVersion: string;
  retentionPolicyVersion: string;
  chargeOpportunityPolicyVersion: string;
  canonicalFeatureRowId: string | null;
};

export type D4InspectionBatchSnapshot = {
  revision: BatteryLongitudinalProfileRevision;
  sourceRowsById: Map<string, BatteryRestSessionFeature>;
  aggregatesBySessionKey: Map<string, RestSessionFeatureRevisionIntegrityAggregate>;
  totalRowsBySessionKey: Map<string, number>;
  latestRowsBySessionKey: Map<string, BatteryRestSessionFeature[]>;
};

export type D4SourceEvidenceBatch = Omit<D4InspectionBatchSnapshot, 'revision'>;

export type LongitudinalIntegrityInspectionRepositoryDb = Pick<
  PrismaService,
  'batteryLongitudinalProfileRevision' | 'batteryRestSessionFeature' | '$transaction' | '$queryRaw'
>;

export type LongitudinalIntegrityInspectionTx = Pick<
  PrismaService,
  'batteryRestSessionFeature' | '$queryRaw'
>;

type RawD4FeatureRow = {
  id: string;
  organization_id: string;
  vehicle_id: string;
  rest_session_id: string;
  feature_model_version: string;
  retention_policy_version: string;
  charge_opportunity_policy_version: string;
  semantic_revision: number;
  input_digest: string;
  input_summary: unknown;
  computation_phase: BatteryRestSessionFeature['computationPhase'];
  session_trust: BatteryRestSessionFeature['sessionTrust'];
  charge_opportunity_class: BatteryRestSessionFeature['chargeOpportunityClass'];
  charge_opportunity_raw: unknown | null;
  shutdown_to_first_rest_delta_mv: number | null;
  robust_rest_slope_mv_per_hour: number | null;
  minimum_rest_voltage_mv: number | null;
  maximum_rest_voltage_mv: number | null;
  median_rest_voltage_mv: number | null;
  rest_voltage_variance_mv2: number | null;
  number_of_valid_rest_points: number;
  max_actual_rest_age_ms: number | null;
  max_inter_observation_gap_ms: number | null;
  observation_span_ms: number | null;
  missing_rung_count: number | null;
  pairwise_rest_deltas: unknown | null;
  computed_at: Date;
  created_at: Date;
};

function mapRawD4FeatureRow(row: RawD4FeatureRow): BatteryRestSessionFeature {
  return {
    id: row.id,
    organizationId: row.organization_id,
    vehicleId: row.vehicle_id,
    restSessionId: row.rest_session_id,
    featureModelVersion: row.feature_model_version,
    retentionPolicyVersion: row.retention_policy_version,
    chargeOpportunityPolicyVersion: row.charge_opportunity_policy_version,
    semanticRevision: row.semantic_revision,
    inputDigest: row.input_digest,
    inputSummary: row.input_summary as BatteryRestSessionFeature['inputSummary'],
    computationPhase: row.computation_phase,
    sessionTrust: row.session_trust,
    chargeOpportunityClass: row.charge_opportunity_class,
    chargeOpportunityRaw: row.charge_opportunity_raw as BatteryRestSessionFeature['chargeOpportunityRaw'],
    shutdownToFirstRestDeltaMv: row.shutdown_to_first_rest_delta_mv,
    robustRestSlopeMvPerHour: row.robust_rest_slope_mv_per_hour,
    minimumRestVoltageMv: row.minimum_rest_voltage_mv,
    maximumRestVoltageMv: row.maximum_rest_voltage_mv,
    medianRestVoltageMv: row.median_rest_voltage_mv,
    restVoltageVarianceMv2: row.rest_voltage_variance_mv2,
    numberOfValidRestPoints: row.number_of_valid_rest_points,
    maxActualRestAgeMs: row.max_actual_rest_age_ms,
    maxInterObservationGapMs: row.max_inter_observation_gap_ms,
    observationSpanMs: row.observation_span_ms,
    missingRungCount: row.missing_rung_count,
    pairwiseRestDeltas: row.pairwise_rest_deltas as BatteryRestSessionFeature['pairwiseRestDeltas'],
    computedAt: row.computed_at,
    createdAt: row.created_at,
  };
}

function mapAggregateRow(row: {
  total_rows: number;
  incremental_rows: number;
  final_rows: number;
  valid_rows: number;
  invalidated_rows: number;
  latest_semantic_revision: number | null;
  positive_revision_row_count: number;
  distinct_positive_revision_count: number;
  min_positive_semantic_revision: number | null;
  max_positive_semantic_revision: number | null;
  non_positive_revision_row_count: number;
}): RestSessionFeatureRevisionIntegrityAggregate {
  return {
    totalRows: row.total_rows ?? 0,
    incrementalRows: row.incremental_rows ?? 0,
    finalRows: row.final_rows ?? 0,
    validRows: row.valid_rows ?? 0,
    invalidatedRows: row.invalidated_rows ?? 0,
    latestSemanticRevision: row.latest_semantic_revision ?? null,
    positiveRevisionRowCount: row.positive_revision_row_count ?? 0,
    distinctPositiveRevisionCount: row.distinct_positive_revision_count ?? 0,
    minPositiveSemanticRevision: row.min_positive_semantic_revision ?? null,
    maxPositiveSemanticRevision: row.max_positive_semantic_revision ?? null,
    nonPositiveRevisionRowCount: row.non_positive_revision_row_count ?? 0,
  };
}

function assertRoundTripBound(budget: D4InspectionDbRoundTripBudget): void {
  budget.assertWithinBound();
}

export class LongitudinalIntegrityInspectionRepository {
  constructor(private readonly db: LongitudinalIntegrityInspectionRepositoryDb) {}

  findRevisionForInspection(
    request: D4InspectionRequest,
  ): Promise<BatteryLongitudinalProfileRevision | null> {
    return this.db.batteryLongitudinalProfileRevision.findFirst({
      where: {
        id: request.revisionId,
        organizationId: request.organizationId,
        vehicleId: request.vehicleId,
      },
    });
  }

  /** Steps 2–4 inside an existing RepeatableRead transaction (revision already loaded). */
  async readSourceEvidenceBatchInTransaction(
    tx: LongitudinalIntegrityInspectionTx,
    input: {
      request: D4InspectionRequest;
      sessionKeys: D4SessionVersionKeyInput[];
      referencedRowIds: string[];
    },
    budget: D4InspectionDbRoundTripBudget,
  ): Promise<D4SourceEvidenceBatch> {
    const referencedIds = [...new Set(input.referencedRowIds.filter(Boolean))];
    let sourceRows: BatteryRestSessionFeature[] = [];
    if (referencedIds.length > 0) {
      budget.increment();
      sourceRows = await tx.batteryRestSessionFeature.findMany({
        where: {
          organizationId: input.request.organizationId,
          vehicleId: input.request.vehicleId,
          id: { in: referencedIds },
        },
      });
    }

    const keys = input.sessionKeys;
    const aggregatesBySessionKey = new Map<string, RestSessionFeatureRevisionIntegrityAggregate>();
    const totalRowsBySessionKey = new Map<string, number>();

    if (keys.length > 0) {
      budget.increment();
      const restSessionIds = keys.map((k) => k.restSessionId);
      const featureModelVersions = keys.map((k) => k.featureModelVersion);
      const retentionPolicyVersions = keys.map((k) => k.retentionPolicyVersion);
      const chargeOpportunityPolicyVersions = keys.map(
        (k) => k.chargeOpportunityPolicyVersion,
      );

      const aggregateRows = await tx.$queryRaw<
        Array<{
          rest_session_id: string;
          feature_model_version: string;
          retention_policy_version: string;
          charge_opportunity_policy_version: string;
          total_rows: number;
          incremental_rows: number;
          final_rows: number;
          valid_rows: number;
          invalidated_rows: number;
          latest_semantic_revision: number | null;
          positive_revision_row_count: number;
          distinct_positive_revision_count: number;
          min_positive_semantic_revision: number | null;
          max_positive_semantic_revision: number | null;
          non_positive_revision_row_count: number;
        }>
      >`
        WITH keys AS (
          SELECT *
          FROM unnest(
            ${restSessionIds}::text[],
            ${featureModelVersions}::text[],
            ${retentionPolicyVersions}::text[],
            ${chargeOpportunityPolicyVersions}::text[]
          ) AS t(
            rest_session_id,
            feature_model_version,
            retention_policy_version,
            charge_opportunity_policy_version
          )
        )
        SELECT
          k.rest_session_id,
          k.feature_model_version,
          k.retention_policy_version,
          k.charge_opportunity_policy_version,
          COUNT(f.id)::int AS total_rows,
          COUNT(f.id) FILTER (WHERE f.computation_phase = 'INCREMENTAL')::int AS incremental_rows,
          COUNT(f.id) FILTER (WHERE f.computation_phase = 'FINAL')::int AS final_rows,
          COUNT(f.id) FILTER (WHERE f.session_trust = 'VALID')::int AS valid_rows,
          COUNT(f.id) FILTER (WHERE f.session_trust = 'INVALIDATED')::int AS invalidated_rows,
          MAX(f.semantic_revision)::int AS latest_semantic_revision,
          COUNT(f.id) FILTER (WHERE f.semantic_revision > 0)::int AS positive_revision_row_count,
          COUNT(DISTINCT f.semantic_revision) FILTER (WHERE f.semantic_revision > 0)::int AS distinct_positive_revision_count,
          MIN(f.semantic_revision) FILTER (WHERE f.semantic_revision > 0)::int AS min_positive_semantic_revision,
          MAX(f.semantic_revision) FILTER (WHERE f.semantic_revision > 0)::int AS max_positive_semantic_revision,
          COUNT(f.id) FILTER (WHERE f.semantic_revision <= 0)::int AS non_positive_revision_row_count
        FROM keys k
        LEFT JOIN battery_rest_session_features f
          ON f.organization_id = ${input.request.organizationId}
         AND f.vehicle_id = ${input.request.vehicleId}
         AND f.rest_session_id = k.rest_session_id
         AND f.feature_model_version = k.feature_model_version
         AND f.retention_policy_version = k.retention_policy_version
         AND f.charge_opportunity_policy_version = k.charge_opportunity_policy_version
        GROUP BY
          k.rest_session_id,
          k.feature_model_version,
          k.retention_policy_version,
          k.charge_opportunity_policy_version
      `;

      for (const row of aggregateRows) {
        const key = buildD4SessionVersionKey({
          restSessionId: row.rest_session_id,
          featureModelVersion: row.feature_model_version,
          retentionPolicyVersion: row.retention_policy_version,
          chargeOpportunityPolicyVersion: row.charge_opportunity_policy_version,
        });
        aggregatesBySessionKey.set(key, mapAggregateRow(row));
        totalRowsBySessionKey.set(key, row.total_rows ?? 0);
      }
    }

    const latestRowsBySessionKey = new Map<string, BatteryRestSessionFeature[]>();
    if (keys.length > 0) {
      budget.increment();
      const restSessionIds = keys.map((k) => k.restSessionId);
      const featureModelVersions = keys.map((k) => k.featureModelVersion);
      const retentionPolicyVersions = keys.map((k) => k.retentionPolicyVersion);
      const chargeOpportunityPolicyVersions = keys.map(
        (k) => k.chargeOpportunityPolicyVersion,
      );
      const boundedRows = await tx.$queryRaw<RawD4FeatureRow[]>`
        WITH keys AS (
          SELECT *
          FROM unnest(
            ${restSessionIds}::text[],
            ${featureModelVersions}::text[],
            ${retentionPolicyVersions}::text[],
            ${chargeOpportunityPolicyVersions}::text[]
          ) AS t(
            rest_session_id,
            feature_model_version,
            retention_policy_version,
            charge_opportunity_policy_version
          )
        ),
        ranked AS (
          SELECT
            f.id,
            f.organization_id,
            f.vehicle_id,
            f.rest_session_id,
            f.feature_model_version,
            f.retention_policy_version,
            f.charge_opportunity_policy_version,
            f.semantic_revision,
            f.input_digest,
            f.input_summary,
            f.computation_phase,
            f.session_trust,
            f.charge_opportunity_class,
            f.charge_opportunity_raw,
            f.shutdown_to_first_rest_delta_mv,
            f.robust_rest_slope_mv_per_hour,
            f.minimum_rest_voltage_mv,
            f.maximum_rest_voltage_mv,
            f.median_rest_voltage_mv,
            f.rest_voltage_variance_mv2,
            f.number_of_valid_rest_points,
            f.max_actual_rest_age_ms,
            f.max_inter_observation_gap_ms,
            f.observation_span_ms,
            f.missing_rung_count,
            f.pairwise_rest_deltas,
            f.computed_at,
            f.created_at,
            ROW_NUMBER() OVER (
              PARTITION BY
                f.rest_session_id,
                f.feature_model_version,
                f.retention_policy_version,
                f.charge_opportunity_policy_version
              ORDER BY f.semantic_revision DESC
            ) AS rn
          FROM battery_rest_session_features f
          INNER JOIN keys k
            ON f.organization_id = ${input.request.organizationId}
           AND f.vehicle_id = ${input.request.vehicleId}
           AND f.rest_session_id = k.rest_session_id
           AND f.feature_model_version = k.feature_model_version
           AND f.retention_policy_version = k.retention_policy_version
           AND f.charge_opportunity_policy_version = k.charge_opportunity_policy_version
        )
        SELECT
          id,
          organization_id,
          vehicle_id,
          rest_session_id,
          feature_model_version,
          retention_policy_version,
          charge_opportunity_policy_version,
          semantic_revision,
          input_digest,
          input_summary,
          computation_phase,
          session_trust,
          charge_opportunity_class,
          charge_opportunity_raw,
          shutdown_to_first_rest_delta_mv,
          robust_rest_slope_mv_per_hour,
          minimum_rest_voltage_mv,
          maximum_rest_voltage_mv,
          median_rest_voltage_mv,
          rest_voltage_variance_mv2,
          number_of_valid_rest_points,
          max_actual_rest_age_ms,
          max_inter_observation_gap_ms,
          observation_span_ms,
          missing_rung_count,
          pairwise_rest_deltas,
          computed_at,
          created_at
        FROM ranked
        WHERE rn <= ${REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS}
           OR id = ANY(${referencedIds}::text[])
      `;

      const grouped = new Map<string, BatteryRestSessionFeature[]>();
      for (const raw of boundedRows) {
        const row = mapRawD4FeatureRow(raw);
        const key = buildD4SessionVersionKey({
          restSessionId: row.restSessionId,
          featureModelVersion: row.featureModelVersion,
          retentionPolicyVersion: row.retentionPolicyVersion,
          chargeOpportunityPolicyVersion: row.chargeOpportunityPolicyVersion,
        });
        const bucket = grouped.get(key) ?? [];
        bucket.push(row);
        grouped.set(key, bucket);
      }

      for (const [key, rows] of grouped.entries()) {
        latestRowsBySessionKey.set(
          key,
          [...rows].sort((a, b) => a.semanticRevision - b.semanticRevision),
        );
      }
    }

    assertRoundTripBound(budget);

    const sourceRowsById = new Map<string, BatteryRestSessionFeature>();
    for (const row of sourceRows) {
      sourceRowsById.set(row.id, row);
    }

    return {
      sourceRowsById,
      aggregatesBySessionKey,
      totalRowsBySessionKey,
      latestRowsBySessionKey,
    };
  }

  async loadInspectionBatch(input: {
    request: D4InspectionRequest;
    sessionKeys: D4SessionVersionKeyInput[];
    referencedRowIds: string[];
  }): Promise<{ snapshot: D4InspectionBatchSnapshot; dbRoundTrips: number } | null> {
    const budget = new D4InspectionDbRoundTripBudget();

    const snapshot = await this.db.$transaction(
      async (tx) => {
        budget.increment();
        const revision = await tx.batteryLongitudinalProfileRevision.findFirst({
          where: {
            id: input.request.revisionId,
            organizationId: input.request.organizationId,
            vehicleId: input.request.vehicleId,
          },
        });
        if (!revision) return null;

        const batch = await this.readSourceEvidenceBatchInTransaction(
          tx as LongitudinalIntegrityInspectionTx,
          input,
          budget,
        );
        assertRoundTripBound(budget);
        return { revision, ...batch };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    if (!snapshot) return null;
    return { snapshot, dbRoundTrips: budget.getCount() };
  }
}

export function buildD4SessionKeysFromProjection(input: {
  organizationId: string;
  vehicleId: string;
  observations: Array<{
    restSessionId: string;
    canonical: { canonicalFeatureRowId: string };
    versionTuple: {
      featureModelVersion: string;
      retentionPolicyVersion: string;
      chargeOpportunityPolicyVersion: string;
    };
  }>;
  provisionalObservations: Array<{
    restSessionId: string;
    canonical: { canonicalFeatureRowId: string };
    versionTuple: {
      featureModelVersion: string;
      retentionPolicyVersion: string;
      chargeOpportunityPolicyVersion: string;
    };
  }>;
  excludedSessions: Array<{
    restSessionId: string;
    canonical: { canonicalFeatureRowId: string } | null;
    version: {
      featureModelVersion: string;
      retentionPolicyVersion: string;
      chargeOpportunityPolicyVersion: string;
    } | null;
  }>;
}): { sessionKeys: D4SessionVersionKeyInput[]; referencedRowIds: string[] } {
  const keyBySession = new Map<string, D4SessionVersionKeyInput>();
  const referencedRowIds: string[] = [];

  const add = (
    restSessionId: string,
    version: {
      featureModelVersion: string;
      retentionPolicyVersion: string;
      chargeOpportunityPolicyVersion: string;
    },
    canonicalFeatureRowId: string | null,
  ) => {
    const sessionKey = buildD4SessionVersionKey({
      restSessionId,
      featureModelVersion: version.featureModelVersion,
      retentionPolicyVersion: version.retentionPolicyVersion,
      chargeOpportunityPolicyVersion: version.chargeOpportunityPolicyVersion,
    });
    if (!keyBySession.has(sessionKey)) {
      keyBySession.set(sessionKey, {
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
        restSessionId,
        featureModelVersion: version.featureModelVersion,
        retentionPolicyVersion: version.retentionPolicyVersion,
        chargeOpportunityPolicyVersion: version.chargeOpportunityPolicyVersion,
        canonicalFeatureRowId,
      });
    }
    if (canonicalFeatureRowId) referencedRowIds.push(canonicalFeatureRowId);
  };

  for (const obs of input.observations) {
    add(obs.restSessionId, obs.versionTuple, obs.canonical.canonicalFeatureRowId);
  }
  for (const obs of input.provisionalObservations) {
    add(obs.restSessionId, obs.versionTuple, obs.canonical.canonicalFeatureRowId);
  }
  for (const excluded of input.excludedSessions) {
    if (excluded.version) {
      add(
        excluded.restSessionId,
        excluded.version,
        excluded.canonical?.canonicalFeatureRowId ?? null,
      );
    }
  }

  return { sessionKeys: [...keyBySession.values()], referencedRowIds };
}
