import { Prisma } from '@prisma/client';
import {
  BatteryRestSessionFeatureComputationPhase,
  BatteryRestSessionFeatureSessionTrust,
} from '@prisma/client';
import { isBatteryV2RestSessionFeaturesShadowEnabled } from '@config/battery-health-v2.config';
import type { PrismaService } from '@shared/database/prisma.service';
import { computeFeatureInputDigestFromSnapshot } from './feature-input-canonical.serializer';
import { buildRestSessionFeatureInputSnapshotV1 } from './rest-session-feature-input-snapshot.builder';
import type { RestSessionFeatureInputSnapshotV1 } from './rest-session-feature-input-snapshot.types';
import {
  createRestSessionFeatureInputReaderForTx,
  lockBatteryRestSessionForFeatureComputation,
  type RestSessionFeatureInputLoadInput,
} from './rest-session-feature-input.reader';
import { REST_SESSION_FEATURE_COMPUTATION_MAX_CONFLICT_RETRIES } from './rest-session-feature.constants';
import { RestSessionFeatureRepository } from './rest-session-feature.repository';
import { computeRestSessionRetentionFeatures } from './rest-session-retention.policy';

export type RestSessionFeatureComputationInput = RestSessionFeatureInputLoadInput & {
  /** Persistence metadata only — excluded from digest. */
  computedAt?: Date;
};

export type RestSessionFeatureComputationOutcome =
  | { status: 'SKIPPED_FLAG_OFF' }
  | { status: 'SESSION_NOT_FOUND' }
  | {
      status: 'DUPLICATE_EXISTING';
      row: Awaited<ReturnType<RestSessionFeatureRepository['findByInputDigest']>>;
    }
  | {
      status: 'CREATED';
      row: NonNullable<Awaited<ReturnType<RestSessionFeatureRepository['findByInputDigest']>>>;
    };

function isRetryableTransactionConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034' || error.code === 'P2002';
  }
  return false;
}

function mapComputationPhase(
  phase: RestSessionFeatureInputSnapshotV1['session']['computationPhase'],
): BatteryRestSessionFeatureComputationPhase {
  return phase === 'INCREMENTAL'
    ? BatteryRestSessionFeatureComputationPhase.INCREMENTAL
    : BatteryRestSessionFeatureComputationPhase.FINAL;
}

function mapSessionTrust(
  trust: RestSessionFeatureInputSnapshotV1['session']['sessionTrust'],
): BatteryRestSessionFeatureSessionTrust {
  return trust === 'INVALIDATED'
    ? BatteryRestSessionFeatureSessionTrust.INVALIDATED
    : BatteryRestSessionFeatureSessionTrust.VALID;
}

/**
 * M3.3C C3 — deterministic rest-session feature computation (shadow flag gated).
 * Not registered on live Nest modules in C3; tests instantiate directly.
 */
export class RestSessionFeatureComputationService {
  constructor(private readonly prisma: PrismaService) {}

  async computeAndPersist(
    input: RestSessionFeatureComputationInput,
  ): Promise<RestSessionFeatureComputationOutcome> {
    if (!isBatteryV2RestSessionFeaturesShadowEnabled()) {
      return { status: 'SKIPPED_FLAG_OFF' };
    }

    const computedAt = input.computedAt ?? new Date();

    return this.runWithConflictRetry(async () =>
      this.prisma.$transaction(
        async (tx) => this.computeWithinTransaction(tx, input, computedAt),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private async runWithConflictRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= REST_SESSION_FEATURE_COMPUTATION_MAX_CONFLICT_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (
          !isRetryableTransactionConflict(error) ||
          attempt >= REST_SESSION_FEATURE_COMPUTATION_MAX_CONFLICT_RETRIES
        ) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  private async computeWithinTransaction(
    tx: Prisma.TransactionClient,
    input: RestSessionFeatureComputationInput,
    computedAt: Date,
  ): Promise<RestSessionFeatureComputationOutcome> {
    await lockBatteryRestSessionForFeatureComputation(tx, input);

    const reader = createRestSessionFeatureInputReaderForTx(tx);
    const loaded = await reader.loadForComputation(input);
    if (loaded.status === 'SESSION_NOT_FOUND') {
      return { status: 'SESSION_NOT_FOUND' };
    }

    const snapshotAnchor =
      loaded.anchorResolution.status === 'SELECTED'
        ? loaded.anchorResolution.snapshotAnchor
        : null;

    const retentionAnchor =
      loaded.anchorResolution.status === 'SELECTED'
        ? loaded.anchorResolution.retentionAnchor
        : null;

    const snapshot = buildRestSessionFeatureInputSnapshotV1({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restSessionId: input.restSessionId,
      session: loaded.sessionBlock,
      anchor: snapshotAnchor,
      eligibleRetentionPoints: loaded.eligibleRetentionPoints,
      retentionMetadataByObservationId: loaded.retentionMetadataByObservationId,
      chargeOpportunityRaw: loaded.chargeOpportunityRaw,
    });

    const inputDigest = computeFeatureInputDigestFromSnapshot(snapshot);
    const repository = new RestSessionFeatureRepository(tx);

    const existing = await repository.findByInputDigest({
      organizationId: input.organizationId,
      restSessionId: input.restSessionId,
      inputDigest,
    });
    if (existing) {
      return { status: 'DUPLICATE_EXISTING', row: existing };
    }

    const maxRevision = await repository.findMaxSemanticRevision({
      organizationId: input.organizationId,
      restSessionId: input.restSessionId,
    });
    const semanticRevision = maxRevision + 1;

    const retention = computeRestSessionRetentionFeatures({
      restSessionId: input.restSessionId,
      anchor: retentionAnchor,
      candidates: loaded.retentionCandidates,
    });

    const row = await repository.createAppendOnlyRow({
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      restSessionId: input.restSessionId,
      semanticRevision,
      inputDigest,
      inputSummary: snapshot as unknown as Prisma.InputJsonValue,
      computationPhase: mapComputationPhase(snapshot.session.computationPhase),
      sessionTrust: mapSessionTrust(snapshot.session.sessionTrust),
      chargeOpportunityClass: loaded.chargeOpportunityRaw.chargeOpportunityClass,
      chargeOpportunityRaw: loaded.chargeOpportunityRaw as unknown as Prisma.InputJsonValue,
      shutdownToFirstRestDeltaMv: retention.shutdownToFirstRestDeltaMv,
      robustRestSlopeMvPerHour: retention.robustRestSlopeMvPerHour,
      minimumRestVoltageMv: retention.minimumRestVoltageMv,
      maximumRestVoltageMv: retention.maximumRestVoltageMv,
      medianRestVoltageMv: retention.medianRestVoltageMv,
      restVoltageVarianceMv2: retention.restVoltageVarianceMv2,
      numberOfValidRestPoints: retention.numberOfValidRestPoints,
      maxActualRestAgeMs: retention.maxActualRestAgeMs,
      maxInterObservationGapMs: retention.maxInterObservationGapMs,
      observationSpanMs: retention.observationSpanMs,
      missingRungCount: retention.missingRungCount,
      pairwiseRestDeltas: retention.pairwiseRestDeltas as Prisma.InputJsonValue | null,
      computedAt,
    });
    return { status: 'CREATED', row };
  }
}
