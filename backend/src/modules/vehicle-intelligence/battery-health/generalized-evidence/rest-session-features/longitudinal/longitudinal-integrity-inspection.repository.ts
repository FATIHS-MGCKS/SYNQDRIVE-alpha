import { Prisma, type BatteryLongitudinalProfileRevision, type BatteryRestSessionFeature } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS } from '../rest-session-feature.constants';
import type { RestSessionFeatureRevisionIntegrityAggregate } from '../rest-session-feature-inspection.repository.types';
import { D4_INSPECTION_DB_ROUND_TRIP_BOUND } from './longitudinal-integrity-inspection.constants';
import {
  getDbRoundTripCount,
  incrementDbRoundTripCount,
  resetDbRoundTripCount,
} from './longitudinal-integrity-inspection.db-round-trips';
import type { D4InspectionRequest } from './longitudinal-integrity-inspection.types';
import { buildD4SessionVersionKey } from './longitudinal-integrity-inspection.source-integrity';

export { getDbRoundTripCount, resetDbRoundTripCount };

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

export type LongitudinalIntegrityInspectionRepositoryDb = Pick<
  PrismaService,
  'batteryLongitudinalProfileRevision' | 'batteryRestSessionFeature' | '$transaction' | '$queryRaw'
>;

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

  async loadInspectionBatch(input: {
    request: D4InspectionRequest;
    sessionKeys: D4SessionVersionKeyInput[];
    referencedRowIds: string[];
  }): Promise<D4InspectionBatchSnapshot | null> {
    resetDbRoundTripCount();

    return this.db.$transaction(
      async (tx) => {
        incrementDbRoundTripCount();
        const revision = await tx.batteryLongitudinalProfileRevision.findFirst({
          where: {
            id: input.request.revisionId,
            organizationId: input.request.organizationId,
            vehicleId: input.request.vehicleId,
          },
        });
        if (!revision) return null;

        const referencedIds = [...new Set(input.referencedRowIds.filter(Boolean))];
        incrementDbRoundTripCount();
        const sourceRows =
          referencedIds.length === 0
            ? []
            : await tx.batteryRestSessionFeature.findMany({
                where: {
                  organizationId: input.request.organizationId,
                  vehicleId: input.request.vehicleId,
                  id: { in: referencedIds },
                },
              });

        const keys = input.sessionKeys;
        const aggregatesBySessionKey = new Map<
          string,
          RestSessionFeatureRevisionIntegrityAggregate
        >();
        const totalRowsBySessionKey = new Map<string, number>();

        incrementDbRoundTripCount();
        if (keys.length > 0) {
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
              COUNT(*)::int AS total_rows,
              COUNT(*) FILTER (WHERE f.computation_phase = 'INCREMENTAL')::int AS incremental_rows,
              COUNT(*) FILTER (WHERE f.computation_phase = 'FINAL')::int AS final_rows,
              COUNT(*) FILTER (WHERE f.session_trust = 'VALID')::int AS valid_rows,
              COUNT(*) FILTER (WHERE f.session_trust = 'INVALIDATED')::int AS invalidated_rows,
              MAX(f.semantic_revision)::int AS latest_semantic_revision,
              COUNT(*) FILTER (WHERE f.semantic_revision > 0)::int AS positive_revision_row_count,
              COUNT(DISTINCT f.semantic_revision) FILTER (WHERE f.semantic_revision > 0)::int AS distinct_positive_revision_count,
              MIN(f.semantic_revision) FILTER (WHERE f.semantic_revision > 0)::int AS min_positive_semantic_revision,
              MAX(f.semantic_revision) FILTER (WHERE f.semantic_revision > 0)::int AS max_positive_semantic_revision,
              COUNT(*) FILTER (WHERE f.semantic_revision <= 0)::int AS non_positive_revision_row_count
            FROM keys k
            LEFT JOIN battery_rest_session_features f
              ON f.organization_id = ${input.request.organizationId}
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

        incrementDbRoundTripCount();
        const latestRowsBySessionKey = new Map<string, BatteryRestSessionFeature[]>();
        if (keys.length > 0) {
          const referencedSet = new Set(referencedIds);
          const historyRows = await tx.batteryRestSessionFeature.findMany({
            where: {
              organizationId: input.request.organizationId,
              vehicleId: input.request.vehicleId,
              OR: keys.map((k) => ({
                restSessionId: k.restSessionId,
                featureModelVersion: k.featureModelVersion,
                retentionPolicyVersion: k.retentionPolicyVersion,
                chargeOpportunityPolicyVersion: k.chargeOpportunityPolicyVersion,
              })),
            },
            orderBy: [{ restSessionId: 'asc' }, { semanticRevision: 'asc' }],
          });

          const grouped = new Map<string, BatteryRestSessionFeature[]>();
          for (const row of historyRows) {
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
            const byRevisionDesc = [...rows].sort(
              (a, b) => b.semanticRevision - a.semanticRevision,
            );
            const latestK = byRevisionDesc.slice(
              0,
              REST_SESSION_FEATURE_SHADOW_INSPECTION_MAX_REVISIONS,
            );
            const union = new Map<string, BatteryRestSessionFeature>();
            for (const row of latestK) union.set(row.id, row);
            for (const row of rows) {
              if (referencedSet.has(row.id)) union.set(row.id, row);
            }
            latestRowsBySessionKey.set(
              key,
              [...union.values()].sort((a, b) => a.semanticRevision - b.semanticRevision),
            );
          }
        }

        if (getDbRoundTripCount() > D4_INSPECTION_DB_ROUND_TRIP_BOUND) {
          throw new Error(
            `D4 inspection exceeded DB round trip bound (${getDbRoundTripCount()} > ${D4_INSPECTION_DB_ROUND_TRIP_BOUND})`,
          );
        }

        const sourceRowsById = new Map<string, BatteryRestSessionFeature>();
        for (const row of sourceRows) {
          sourceRowsById.set(row.id, row);
        }

        return {
          revision,
          sourceRowsById,
          aggregatesBySessionKey,
          totalRowsBySessionKey,
          latestRowsBySessionKey,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
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
