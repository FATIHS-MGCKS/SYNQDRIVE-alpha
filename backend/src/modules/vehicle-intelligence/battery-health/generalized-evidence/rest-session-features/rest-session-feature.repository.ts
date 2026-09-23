import {
  Prisma,
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
  type BatteryRestSessionFeature,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from './rest-session-feature.constants';
import type {
  RestSessionFeatureInspectionSessionScope,
  RestSessionFeatureRevisionIntegrityAggregate,
} from './rest-session-feature-inspection.repository.types';

export type RestSessionFeatureRepositoryDb = Pick<
  PrismaService,
  'batteryRestSessionFeature' | '$queryRaw'
>;

export type RestSessionFeatureCreateInput = {
  organizationId: string;
  vehicleId: string;
  restSessionId: string;
  semanticRevision: number;
  inputDigest: string;
  inputSummary: Prisma.InputJsonValue;
  computationPhase: BatteryRestSessionFeatureComputationPhase;
  sessionTrust: BatteryRestSessionFeatureSessionTrust;
  chargeOpportunityClass: BatteryRestSessionFeature['chargeOpportunityClass'];
  chargeOpportunityRaw: Prisma.InputJsonValue;
  shutdownToFirstRestDeltaMv: number | null;
  robustRestSlopeMvPerHour: number | null;
  minimumRestVoltageMv: number | null;
  maximumRestVoltageMv: number | null;
  medianRestVoltageMv: number | null;
  restVoltageVarianceMv2: number | null;
  numberOfValidRestPoints: number;
  maxActualRestAgeMs: number | null;
  maxInterObservationGapMs: number | null;
  observationSpanMs: number | null;
  missingRungCount: number | null;
  pairwiseRestDeltas: Prisma.InputJsonValue | null;
  computedAt: Date;
};

function sessionVersionWhere(input: RestSessionFeatureInspectionSessionScope) {
  return {
    organizationId: input.organizationId,
    restSessionId: input.restSessionId,
    featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
    retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
    chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  };
}

export class RestSessionFeatureRepository {
  constructor(private readonly db: RestSessionFeatureRepositoryDb) {}

  findByInputDigest(input: {
    organizationId: string;
    restSessionId: string;
    inputDigest: string;
  }): Promise<BatteryRestSessionFeature | null> {
    return this.db.batteryRestSessionFeature.findFirst({
      where: {
        organizationId: input.organizationId,
        restSessionId: input.restSessionId,
        featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
        inputDigest: input.inputDigest,
      },
    });
  }

  findMaxSemanticRevision(input: {
    organizationId: string;
    restSessionId: string;
  }): Promise<number> {
    return this.db.batteryRestSessionFeature
      .aggregate({
        where: sessionVersionWhere(input),
        _max: { semanticRevision: true },
      })
      .then((result) => result._max.semanticRevision ?? 0);
  }

  /** Legacy unbounded list — avoid in inspection paths (C5A.1). */
  listFeatureRowsForSession(input: RestSessionFeatureInspectionSessionScope): Promise<BatteryRestSessionFeature[]> {
    return this.db.batteryRestSessionFeature.findMany({
      where: sessionVersionWhere(input),
      orderBy: [{ semanticRevision: 'asc' }],
    });
  }

  countFeatureRowsForSession(input: RestSessionFeatureInspectionSessionScope): Promise<number> {
    return this.db.batteryRestSessionFeature.count({
      where: sessionVersionWhere(input),
    });
  }

  async listLatestFeatureRowsForSession(input: {
    organizationId: string;
    restSessionId: string;
    limit: number;
  }): Promise<BatteryRestSessionFeature[]> {
    const rows = await this.db.batteryRestSessionFeature.findMany({
      where: sessionVersionWhere(input),
      orderBy: [{ semanticRevision: 'desc' }],
      take: input.limit,
    });
    return rows.reverse();
  }

  async readRevisionIntegrityAggregate(
    input: RestSessionFeatureInspectionSessionScope,
  ): Promise<RestSessionFeatureRevisionIntegrityAggregate> {
    const rows = await this.db.$queryRaw<
      Array<{
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
      SELECT
        COUNT(*)::int AS total_rows,
        COUNT(*) FILTER (WHERE computation_phase = 'INCREMENTAL')::int AS incremental_rows,
        COUNT(*) FILTER (WHERE computation_phase = 'FINAL')::int AS final_rows,
        COUNT(*) FILTER (WHERE session_trust = 'VALID')::int AS valid_rows,
        COUNT(*) FILTER (WHERE session_trust = 'INVALIDATED')::int AS invalidated_rows,
        MAX(semantic_revision)::int AS latest_semantic_revision,
        COUNT(*) FILTER (WHERE semantic_revision > 0)::int AS positive_revision_row_count,
        COUNT(DISTINCT semantic_revision) FILTER (WHERE semantic_revision > 0)::int AS distinct_positive_revision_count,
        MIN(semantic_revision) FILTER (WHERE semantic_revision > 0)::int AS min_positive_semantic_revision,
        MAX(semantic_revision) FILTER (WHERE semantic_revision > 0)::int AS max_positive_semantic_revision,
        COUNT(*) FILTER (WHERE semantic_revision <= 0)::int AS non_positive_revision_row_count
      FROM battery_rest_session_features
      WHERE organization_id = ${input.organizationId}
        AND rest_session_id = ${input.restSessionId}
        AND feature_model_version = ${REST_SESSION_FEATURE_MODEL_VERSION}
        AND retention_policy_version = ${REST_SESSION_RETENTION_POLICY_VERSION}
        AND charge_opportunity_policy_version = ${REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION}
    `;
    const row = rows[0];
    return {
      totalRows: row?.total_rows ?? 0,
      incrementalRows: row?.incremental_rows ?? 0,
      finalRows: row?.final_rows ?? 0,
      validRows: row?.valid_rows ?? 0,
      invalidatedRows: row?.invalidated_rows ?? 0,
      latestSemanticRevision: row?.latest_semantic_revision ?? null,
      positiveRevisionRowCount: row?.positive_revision_row_count ?? 0,
      distinctPositiveRevisionCount: row?.distinct_positive_revision_count ?? 0,
      minPositiveSemanticRevision: row?.min_positive_semantic_revision ?? null,
      maxPositiveSemanticRevision: row?.max_positive_semantic_revision ?? null,
      nonPositiveRevisionRowCount: row?.non_positive_revision_row_count ?? 0,
    };
  }

  async listCanonicalCandidateRows(
    input: RestSessionFeatureInspectionSessionScope,
  ): Promise<BatteryRestSessionFeature[]> {
    const whereBase = sessionVersionWhere(input);
    const pairs: Array<{
      computationPhase: BatteryRestSessionFeatureComputationPhase;
      sessionTrust: BatteryRestSessionFeatureSessionTrust;
    }> = [
      {
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
      },
      {
        computationPhase: BatteryRestSessionFeatureComputationPhase.INCREMENTAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
      },
      {
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.VALID,
      },
      {
        computationPhase: BatteryRestSessionFeatureComputationPhase.FINAL,
        sessionTrust: BatteryRestSessionFeatureSessionTrust.INVALIDATED,
      },
    ];

    const candidates = await Promise.all(
      pairs.map((pair) =>
        this.db.batteryRestSessionFeature.findFirst({
          where: {
            ...whereBase,
            computationPhase: pair.computationPhase,
            sessionTrust: pair.sessionTrust,
          },
          orderBy: { semanticRevision: 'desc' },
        }),
      ),
    );
    return candidates.filter((row): row is BatteryRestSessionFeature => row != null);
  }

  createAppendOnlyRow(data: RestSessionFeatureCreateInput): Promise<BatteryRestSessionFeature> {
    return this.db.batteryRestSessionFeature.create({
      data: {
        organizationId: data.organizationId,
        vehicleId: data.vehicleId,
        restSessionId: data.restSessionId,
        featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
        retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
        chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
        semanticRevision: data.semanticRevision,
        inputDigest: data.inputDigest,
        inputSummary: data.inputSummary,
        computationPhase: data.computationPhase,
        sessionTrust: data.sessionTrust,
        chargeOpportunityClass: data.chargeOpportunityClass,
        chargeOpportunityRaw: data.chargeOpportunityRaw,
        shutdownToFirstRestDeltaMv: data.shutdownToFirstRestDeltaMv,
        robustRestSlopeMvPerHour: data.robustRestSlopeMvPerHour,
        minimumRestVoltageMv: data.minimumRestVoltageMv,
        maximumRestVoltageMv: data.maximumRestVoltageMv,
        medianRestVoltageMv: data.medianRestVoltageMv,
        restVoltageVarianceMv2: data.restVoltageVarianceMv2,
        numberOfValidRestPoints: data.numberOfValidRestPoints,
        maxActualRestAgeMs: data.maxActualRestAgeMs,
        maxInterObservationGapMs: data.maxInterObservationGapMs,
        observationSpanMs: data.observationSpanMs,
        missingRungCount: data.missingRungCount,
        pairwiseRestDeltas:
          data.pairwiseRestDeltas === null
            ? Prisma.JsonNull
            : data.pairwiseRestDeltas,
        computedAt: data.computedAt,
      },
    });
  }
}
