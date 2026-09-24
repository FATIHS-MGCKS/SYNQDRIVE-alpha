import { Prisma } from '@prisma/client';
import type { PrismaService } from '@shared/database/prisma.service';
import { REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION } from './longitudinal-integrity-inspection.constants';
import { aggregateD4InspectionOverlay } from './longitudinal-integrity-inspection.aggregate';
import { D4InspectionDbRoundTripBudget } from './longitudinal-integrity-inspection.db-round-trips';
import {
  LongitudinalIntegrityInspectionRepository,
  buildD4SessionKeysFromProjection,
  type LongitudinalIntegrityInspectionRepositoryDb,
  type LongitudinalIntegrityInspectionTx,
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

export type LongitudinalIntegrityInspectionServiceDb = LongitudinalIntegrityInspectionRepositoryDb;

export class LongitudinalIntegrityInspectionService {
  private readonly repository: LongitudinalIntegrityInspectionRepository;
  private lastInspectionDbRoundTrips: number | null = null;

  constructor(
    private readonly prisma: LongitudinalIntegrityInspectionServiceDb,
    private readonly clock: LongitudinalIntegrityInspectionClock = defaultClock,
  ) {
    this.repository = new LongitudinalIntegrityInspectionRepository(prisma);
  }

  getLastInspectionDbRoundTrips(): number | null {
    return this.lastInspectionDbRoundTrips;
  }

  async inspectRevision(request: D4InspectionRequest): Promise<D4InspectionOutcome> {
    const budget = new D4InspectionDbRoundTripBudget();
    let outcome: D4InspectionOutcome = { status: 'REVISION_NOT_FOUND' };

    await this.prisma.$transaction(
      async (tx) => {
        budget.increment();
        const revision = await tx.batteryLongitudinalProfileRevision.findFirst({
          where: {
            id: request.revisionId,
            organizationId: request.organizationId,
            vehicleId: request.vehicleId,
          },
        });
        if (!revision) {
          outcome = { status: 'REVISION_NOT_FOUND' };
          this.lastInspectionDbRoundTrips = budget.getCount();
          return;
        }

        const selfCheck = evaluateMaterializedRevisionSelfIntegrity(revision);
        if (selfCheck.status === 'PARSE_FAILED') {
          const failure: D4RevisionSelfIntegrityFailureV1 = {
            inspectionContractVersion:
              REST_SESSION_LONGITUDINAL_INTEGRITY_INSPECTION_CONTRACT_VERSION,
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
          outcome = { status: 'REVISION_SELF_INTEGRITY_FAILED', failure };
          this.lastInspectionDbRoundTrips = budget.getCount();
          return;
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

        const batch = await this.repository.readSourceEvidenceBatchInTransaction(
          tx as LongitudinalIntegrityInspectionTx,
          {
            request,
            sessionKeys,
            referencedRowIds,
          },
          budget,
        );

        budget.assertWithinBound();

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
            revisionCreatedAt: revision.createdAt,
            selfIntegrityFailed,
            sourceRowsById: batch.sourceRowsById,
            aggregatesBySessionKey: batch.aggregatesBySessionKey,
            totalRowsBySessionKey: batch.totalRowsBySessionKey,
            latestRowsBySessionKey: batch.latestRowsBySessionKey,
          },
        });

        outcome = { status: 'OK', inspection };
        this.lastInspectionDbRoundTrips = budget.getCount();
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );

    return outcome;
  }
}

/** Exported for tests — ensures RR isolation is wired for service consumers. */
export const D4_INSPECTION_PRISMA_ISOLATION = Prisma.TransactionIsolationLevel.RepeatableRead;
