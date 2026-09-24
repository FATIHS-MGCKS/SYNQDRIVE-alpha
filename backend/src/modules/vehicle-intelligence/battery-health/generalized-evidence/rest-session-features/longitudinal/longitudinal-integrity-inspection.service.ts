import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION } from './longitudinal-integrity-inspection.constants';
import { aggregateD4InspectionOverlay } from './longitudinal-integrity-inspection.aggregate';
import {
  LongitudinalIntegrityInspectionRepository,
  buildD4SessionKeysFromProjection,
} from './longitudinal-integrity-inspection.repository';
import { evaluateMaterializedRevisionSelfIntegrity } from './longitudinal-integrity-inspection.self-integrity';
import type {
  D4InspectionOutcome,
  D4InspectionRequest,
  D4RevisionSelfIntegrityFailureV1,
} from './longitudinal-integrity-inspection.types';

export type LongitudinalIntegrityInspectionClock = {
  nowIso(): string;
};

const defaultClock: LongitudinalIntegrityInspectionClock = {
  nowIso: () => new Date().toISOString(),
};

export class LongitudinalIntegrityInspectionService {
  private readonly repository: LongitudinalIntegrityInspectionRepository;

  constructor(
    prisma: Pick<PrismaService, 'batteryLongitudinalProfileRevision' | 'batteryRestSessionFeature' | '$transaction' | '$queryRaw'>,
    private readonly clock: LongitudinalIntegrityInspectionClock = defaultClock,
  ) {
    this.repository = new LongitudinalIntegrityInspectionRepository(prisma);
  }

  async inspectRevision(request: D4InspectionRequest): Promise<D4InspectionOutcome> {
    const revision = await this.repository.findRevisionForInspection(request);
    if (!revision) {
      return { status: 'REVISION_NOT_FOUND' };
    }

    const selfCheck = evaluateMaterializedRevisionSelfIntegrity(revision);
    if (selfCheck.status === 'PARSE_FAILED') {
      const failure: D4RevisionSelfIntegrityFailureV1 = {
        inspectionContractVersion: REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION,
        inspectionGeneratedAt: this.clock.nowIso(),
        snapshotIsolation: 'REPEATABLE_READ',
        identity: {
          organizationId: request.organizationId,
          vehicleId: request.vehicleId,
          revisionId: request.revisionId,
        },
        storedRevisionEnvelope: {
          canonicalProfileFingerprint: revision.canonicalProfileFingerprint,
          longitudinalProfileContractVersion: revision.longitudinalProfileContractVersion,
          profilePolicyVersion: revision.profilePolicyVersion,
        },
        selfIntegrity: 'SELF_INTEGRITY_FAILED',
        reasons: selfCheck.reasons,
      };
      return { status: 'REVISION_SELF_INTEGRITY_FAILED', failure };
    }

    const projection = selfCheck.projection;
    const selfIntegrityFailed = selfCheck.status === 'SELF_INTEGRITY_FAILED';
    const selfIntegrityReasons =
      selfCheck.status === 'SELF_INTEGRITY_FAILED' ? selfCheck.reasons : [];

    const { sessionKeys, referencedRowIds } = buildD4SessionKeysFromProjection({
      organizationId: projection.organizationId,
      vehicleId: projection.vehicleId,
      observations: projection.observations,
      provisionalObservations: projection.provisionalObservations,
      excludedSessions: projection.excludedSessions,
    });

    const batch = await this.repository.loadInspectionBatch({
      request,
      sessionKeys,
      referencedRowIds,
    });
    if (!batch) {
      return { status: 'REVISION_NOT_FOUND' };
    }

    const inspection = aggregateD4InspectionOverlay({
      projection,
      revisionId: request.revisionId,
      canonicalProfileFingerprint: revision.canonicalProfileFingerprint,
      inspectionGeneratedAt: this.clock.nowIso(),
      selfIntegrityFailed,
      selfIntegrityReasons,
      batchContext: {
        organizationId: request.organizationId,
        vehicleId: request.vehicleId,
        revisionCreatedAt: batch.revision.createdAt,
        selfIntegrityFailed,
        sourceRowsById: batch.sourceRowsById,
        aggregatesBySessionKey: batch.aggregatesBySessionKey,
        totalRowsBySessionKey: batch.totalRowsBySessionKey,
        latestRowsBySessionKey: batch.latestRowsBySessionKey,
      },
    });

    return { status: 'OK', inspection };
  }
}

/** Exported for tests — ensures RR isolation is wired for service consumers. */
export const D4_INSPECTION_PRISMA_ISOLATION = Prisma.TransactionIsolationLevel.RepeatableRead;
