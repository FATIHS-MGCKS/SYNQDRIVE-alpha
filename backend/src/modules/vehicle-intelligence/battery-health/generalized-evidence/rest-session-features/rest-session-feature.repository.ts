import {
  Prisma,
  type BatteryRestSessionFeature,
  type BatteryRestSessionFeatureComputationPhase,
  type BatteryRestSessionFeatureSessionTrust,
} from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import {
  REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
  REST_SESSION_FEATURE_MODEL_VERSION,
  REST_SESSION_RETENTION_POLICY_VERSION,
} from './rest-session-feature.constants';

export type RestSessionFeatureRepositoryDb = Pick<
  PrismaService,
  'batteryRestSessionFeature'
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
        where: {
          organizationId: input.organizationId,
          restSessionId: input.restSessionId,
          featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
          retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
          chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
        },
        _max: { semanticRevision: true },
      })
      .then((result) => result._max.semanticRevision ?? 0);
  }

  listFeatureRowsForSession(input: {
    organizationId: string;
    restSessionId: string;
  }): Promise<BatteryRestSessionFeature[]> {
    return this.db.batteryRestSessionFeature.findMany({
      where: {
        organizationId: input.organizationId,
        restSessionId: input.restSessionId,
        featureModelVersion: REST_SESSION_FEATURE_MODEL_VERSION,
        retentionPolicyVersion: REST_SESSION_RETENTION_POLICY_VERSION,
        chargeOpportunityPolicyVersion: REST_SESSION_CHARGE_OPPORTUNITY_POLICY_VERSION,
      },
      orderBy: [{ semanticRevision: 'asc' }],
    });
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
