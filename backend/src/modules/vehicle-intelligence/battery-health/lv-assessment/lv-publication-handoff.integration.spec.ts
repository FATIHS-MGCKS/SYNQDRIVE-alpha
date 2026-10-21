import { BatteryPolicyProfileService } from '../../battery-policy-profile/battery-policy-profile.service';
import { resolveBatteryPolicy } from '../../battery-policy-profile/battery-policy-profile.resolver';
import {
  BatteryChemistry,
  BatteryDriveProfile,
} from '../battery-v2-domain';
import { BatteryPublicationRepository } from '../battery-publication.repository';
import { BatteryPublicationService } from '../battery-publication.service';
import { BatteryPublicationUpdateHandler } from '../jobs/handlers/battery-publication-update.handler';
import { LvPublicationHandoffService } from './lv-publication-handoff.service';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';
import {
  LV_PUBLICATION_HANDOFF_OUTCOME,
  LV_PUBLICATION_HANDOFF_STATUS,
  readPublicationHandoffFromAssessmentSummary,
} from './lv-publication-handoff.metadata';
import {
  createConcurrentJobProducer,
  createRowLockedAssessmentPrisma,
} from './lv-publication-handoff.integration.harness';
import { isBatteryV2PublicationEnabled } from '@config/battery-health-v2.config';
import {
  BatteryEvidenceScope,
  BatteryEvidenceStrength,
  SohPublicationState,
  type BatteryAssessment,
  type BatteryPublication,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2PublicationEnabled: jest.fn(),
}));

const organizationId = 'clorg1234567890123456789012';
const vehicleId = 'clveh1234567890123456789012';
const workshopId = 'assess-workshop';
const telemetryId = 'assess-telemetry';

function assessmentClock() {
  const now = new Date();
  return {
    now,
    validFrom: new Date(now.getTime() - 3 * 24 * 60 * 60_000),
    validUntil: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
    firstEvidenceObservedAt: new Date(
      now.getTime() - 20 * 24 * 60 * 60_000,
    ).toISOString(),
  };
}

function stableAssessmentRow(
  id: string,
  track: 'WORKSHOP_OVERRIDE' | 'TELEMETRY',
  clock = assessmentClock(),
) {
  return {
    id,
    organizationId,
    vehicleId,
    scope: BatteryEvidenceScope.LV,
    type: 'LV_ESTIMATED_HEALTH',
    scoreValue: track === 'WORKSHOP_OVERRIDE' ? 76 : 82,
    confidence: 'HIGH',
    evidenceStrength: BatteryEvidenceStrength.PRIMARY,
    dataQuality: 'ESTIMATED',
    modelVersion: 1,
    validFrom: clock.validFrom,
    validUntil: clock.validUntil,
    computedAt: clock.now,
    idempotencyKey: `assess-key-${id}`,
    inputSummary: {
      assessmentTrack: track,
      assessmentMode: 'CANONICAL',
      confidenceScore: 0.85,
      publicationEligible: true,
      measurementCoverage: {
        selectedCount: 6,
        rejectedCount: 0,
        restMeasurementCount: 6,
        startProxyCount: 0,
        workshopMeasurementCount: track === 'WORKSHOP_OVERRIDE' ? 2 : 0,
        shadowExperimentalCount: 0,
        weightedInputCount: 6,
        coverageRatio: 1,
      },
      selectedMeasurementIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
      firstEvidenceObservedAt: clock.firstEvidenceObservedAt,
    },
  } as unknown as BatteryAssessment;
}

function createPublicationHarness(publicationEnabled: boolean) {
  (isBatteryV2PublicationEnabled as jest.Mock).mockReturnValue(publicationEnabled);

  const clock = assessmentClock();
  const assessments = new Map<string, Record<string, unknown>>([
    [
      workshopId,
      stableAssessmentRow(workshopId, 'WORKSHOP_OVERRIDE', clock).inputSummary as Record<
        string,
        unknown
      >,
    ],
    [
      telemetryId,
      stableAssessmentRow(telemetryId, 'TELEMETRY', clock).inputSummary as Record<string, unknown>,
    ],
  ]);

  const publications = new Map<string, BatteryPublication>();
  const assessmentRows = new Map<string, BatteryAssessment>([
    [workshopId, stableAssessmentRow(workshopId, 'WORKSHOP_OVERRIDE', clock)],
    [telemetryId, stableAssessmentRow(telemetryId, 'TELEMETRY', clock)],
  ]);

  const prisma = createRowLockedAssessmentPrisma({
    organizationId,
    vehicleId,
    assessments,
    assessmentIdForLock: workshopId,
  }) as unknown as PrismaService & {
    batteryPublication: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      findFirstOrThrow: jest.Mock;
    };
    batteryAssessment: {
      findFirst: jest.Mock;
    };
  };

  prisma.batteryAssessment.findFirst.mockImplementation(
    async ({ where }: { where: { id: string; organizationId?: string } }) => {
      const row = assessmentRows.get(where.id);
      if (!row) return null;
      const summary = assessments.get(where.id) ?? row.inputSummary;
      return { ...row, inputSummary: summary };
    },
  );

  prisma.batteryPublication.findMany.mockImplementation(
    async ({ where }: { where: { organizationId: string; vehicleId: string } }) =>
      [...publications.values()].filter(
        (row) =>
          row.organizationId === where.organizationId &&
          row.vehicleId === where.vehicleId,
      ),
  );

  prisma.batteryPublication.findFirst.mockImplementation(
    async ({ where }: { where: Record<string, unknown> }) => {
      if (typeof where.id === 'string') {
        return publications.get(where.id) ?? null;
      }
      if (typeof where.idempotencyKey === 'string') {
        return (
          [...publications.values()].find(
            (row) =>
              row.idempotencyKey === where.idempotencyKey &&
              row.organizationId === where.organizationId &&
              row.vehicleId === where.vehicleId,
          ) ?? null
        );
      }
      return null;
    },
  );

  prisma.batteryPublication.create.mockImplementation(async ({ data }) => {
    const row = {
      id: `pub-${data.assessmentId}`,
      ...data,
      createdAt: clock.now,
    } as BatteryPublication;
    publications.set(row.id, row);
    return row;
  });

  prisma.batteryPublication.update.mockImplementation(
    async ({ where, data }: { where: { id: string }; data: { reason?: string } }) => {
      const existing = publications.get(where.id);
      if (!existing) throw new Error('publication_not_found');
      const updated = { ...existing, ...data };
      publications.set(where.id, updated);
      return updated;
    },
  );

  prisma.batteryPublication.findFirstOrThrow.mockImplementation(
    async ({ where }: { where: { id: string } }) => {
      const row = publications.get(where.id);
      if (!row) throw new Error('publication_not_found');
      return row;
    },
  );

  const { jobProducer, liveJobs, getLastValidatedPayload } = createConcurrentJobProducer();
  const publicationRepository = new BatteryPublicationRepository(prisma);
  const policyProfile = {
    resolveForVehicle: jest.fn().mockResolvedValue(
      resolveBatteryPolicy({
        driveProfile: BatteryDriveProfile.ICE,
        chemistry: BatteryChemistry.AGM,
        lvSignalPresent: true,
      }),
    ),
  };

  const publicationService = new BatteryPublicationService(
    policyProfile as unknown as BatteryPolicyProfileService,
    publicationRepository,
  );

  const handoffService = new LvPublicationHandoffService(
    prisma,
    jobProducer as never,
    { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
  );

  const handler = new BatteryPublicationUpdateHandler(
    publicationService,
    handoffService,
  );

  return {
    prisma,
    assessments,
    publications,
    publicationRepository,
    publicationService,
    handoffService,
    handler,
    jobProducer,
    liveJobs,
    getLastValidatedPayload,
  };
}

describe('LV publication handoff deterministic service-chain integration', () => {
  const epochCandidates = [
    {
      assessmentId: telemetryId,
      assessmentTrack: 'TELEMETRY' as const,
      assessmentMode: 'CANONICAL' as const,
    },
    {
      assessmentId: workshopId,
      assessmentTrack: 'WORKSHOP_OVERRIDE' as const,
      assessmentMode: 'CANONICAL' as const,
    },
  ];

  it('PUBLICATION OFF: mechanical chain through real publication service (policy skip)', async () => {
    const harness = createPublicationHarness(false);

    const handoffResult = await harness.handoffService.ensurePublicationHandoff({
      organizationId,
      vehicleId,
      epochCandidates,
    });

    expect(handoffResult.idempotencyKey).toBe(`pub:${workshopId}:v1`);
    expect(harness.jobProducer.enqueue).toHaveBeenCalledTimes(1);

    const capturedPayload = harness.getLastValidatedPayload();
    expect(capturedPayload).not.toBeNull();
    await harness.handler.handle(capturedPayload as never);

    expect(harness.publications.size).toBe(0);
    const handoff = readPublicationHandoffFromAssessmentSummary(
      harness.assessments.get(workshopId),
    );
    expect(handoff?.status).toBe(LV_PUBLICATION_HANDOFF_STATUS.EXECUTED);
    expect(handoff?.outcome).toBe(LV_PUBLICATION_HANDOFF_OUTCOME.POLICY_SKIPPED);
  });

  it('PUBLICATION ON: qualified winner materializes pub:{assessmentId}:v1 via real policy', async () => {
    const harness = createPublicationHarness(true);

    await harness.handoffService.ensurePublicationHandoff({
      organizationId,
      vehicleId,
      epochCandidates,
    });

    const capturedPayload = harness.getLastValidatedPayload();
    expect(capturedPayload).not.toBeNull();
    await harness.handler.handle(capturedPayload as never);

    const publication = [...harness.publications.values()].find(
      (row) => row.assessmentId === workshopId,
    );
    expect(publication?.idempotencyKey).toBe(`pub:${workshopId}:v1`);
    expect(publication?.version).toBe(1);
    expect(publication?.status).toBe(SohPublicationState.STABLE);

    const active =
      await harness.publicationRepository.findLatestActiveLvPublication({
        organizationId,
        vehicleId,
      });
    expect(active?.assessmentId).toBe(workshopId);
  });
});

describe('LV publication handoff concurrent replica convergence', () => {
  const ORG = organizationId;
  const VEH = vehicleId;
  const ASSESS = workshopId;

  function buildReplicaServices() {
    const assessments = new Map<string, Record<string, unknown>>([
      [
        ASSESS,
        {
          assessmentTrack: 'WORKSHOP_OVERRIDE',
          assessmentMode: 'CANONICAL',
        },
      ],
    ]);

    const prisma = createRowLockedAssessmentPrisma({
      organizationId: ORG,
      vehicleId: VEH,
      assessments,
      assessmentIdForLock: ASSESS,
    });

    const { jobProducer } = createConcurrentJobProducer();
    const deadLetters = { isDeadLetter: jest.fn().mockResolvedValue(false) };

    const createService = () =>
      new LvPublicationHandoffService(
        prisma as never,
        jobProducer as never,
        deadLetters as never,
      );

    const input = {
      organizationId: ORG,
      vehicleId: VEH,
      epochCandidates: [
        {
          assessmentId: ASSESS,
          assessmentTrack: 'WORKSHOP_OVERRIDE' as const,
          assessmentMode: 'CANONICAL' as const,
        },
      ],
    };

    return { assessments, jobProducer, createService, input };
  }

  it('overlapping replica ensurePublicationHandoff converges on one pub identity', async () => {
    const { assessments, jobProducer, createService, input } = buildReplicaServices();
    const replicaA = createService();
    const replicaB = createService();

    const [resultA, resultB] = await Promise.all([
      replicaA.ensurePublicationHandoff(input),
      replicaB.ensurePublicationHandoff(input),
    ]);

    const enqueuedCount = [resultA, resultB].filter((row) => row.enqueued).length;
    expect(enqueuedCount).toBe(1);
    expect(jobProducer.enqueue).toHaveBeenCalledTimes(1);

    const handoff = readPublicationHandoffFromAssessmentSummary(assessments.get(ASSESS));
    expect(handoff?.idempotencyKey).toBe(`pub:${ASSESS}:v1`);
    expect([
      LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED,
      LV_PUBLICATION_HANDOFF_STATUS.EXECUTED,
    ]).toContain(handoff?.status);
  });

  it('overlapping direct vs reconciliation paths share one durable identity', async () => {
    const { assessments, jobProducer, createService, input } = buildReplicaServices();
    const direct = createService();
    const reconcile = createService();

    const [directResult, reconcileResult] = await Promise.all([
      direct.ensurePublicationHandoff(input),
      reconcile.reconcilePublicationHandoff(input),
    ]);

    expect(jobProducer.enqueue).toHaveBeenCalledTimes(1);
    expect(directResult.idempotencyKey).toBe(`pub:${ASSESS}:v1`);
    expect(reconcileResult.idempotencyKey).toBe(`pub:${ASSESS}:v1`);

    const handoff = readPublicationHandoffFromAssessmentSummary(assessments.get(ASSESS));
    expect(handoff?.idempotencyKey).toBe(`pub:${ASSESS}:v1`);
    expect(handoff?.status).toBe(LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED);
  });
});
