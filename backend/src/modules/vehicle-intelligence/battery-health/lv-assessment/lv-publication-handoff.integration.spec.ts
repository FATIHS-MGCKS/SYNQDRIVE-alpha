import { arbitrateLvPublicationTrack } from './lv-publication-track-arbitration.policy';
import { LvPublicationHandoffService } from './lv-publication-handoff.service';
import { validateBatteryV2JobPayload } from '../jobs/battery-v2-job.validation';
import { BatteryPublicationUpdateHandler } from '../jobs/handlers/battery-publication-update.handler';
import { BatteryPublicationService } from '../battery-publication.service';
import { LV_PUBLICATION_CONTRACT_VERSION } from './lv-publication-contract.policy';
import {
  LV_PUBLICATION_HANDOFF_STATUS,
  readPublicationHandoffFromAssessmentSummary,
} from './lv-publication-handoff.metadata';

jest.mock('@config/battery-health-v2.config', () => ({
  isBatteryV2PublicationEnabled: jest.fn().mockReturnValue(false),
}));

describe('LV publication handoff service-chain integration', () => {
  const organizationId = 'clorg1234567890123456789012';
  const vehicleId = 'clveh1234567890123456789012';
  const workshopId = 'assess-workshop';
  const telemetryId = 'assess-telemetry';

  function buildHandoffHarness() {
    const stores = new Map<string, Record<string, unknown>>();
    stores.set(workshopId, {
      assessmentTrack: 'WORKSHOP_OVERRIDE',
      assessmentMode: 'CANONICAL',
    });

    const prisma: {
      $transaction: jest.Mock;
      $queryRaw: jest.Mock;
      batteryAssessment: {
        findFirst: jest.Mock;
        updateMany: jest.Mock;
      };
    } = {
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
      batteryAssessment: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
      fn(prisma),
    );
    prisma.$queryRaw.mockImplementation(async () => [
      { input_summary: stores.get(workshopId) ?? {} },
    ]);
    prisma.batteryAssessment.findFirst.mockImplementation(
      async ({ where }: { where: { id: string } }) => {
        const summary = stores.get(where.id);
        if (!summary) return null;
        return { id: where.id, organizationId, vehicleId, inputSummary: summary };
      },
    );
    prisma.batteryAssessment.updateMany.mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { inputSummary: Record<string, unknown> };
      }) => {
        stores.set(where.id, data.inputSummary);
        return { count: 1 };
      },
    );

    const enqueuedJobs: unknown[] = [];
    const jobProducer = {
      enqueue: jest.fn(async (_type: string, payload: unknown) => {
        enqueuedJobs.push(payload);
        return 'bull-job-1';
      }),
      hasLiveJob: jest.fn().mockResolvedValue(false),
    };

    const handoffService = new LvPublicationHandoffService(
      prisma as never,
      jobProducer as never,
      { isDeadLetter: jest.fn().mockResolvedValue(false) } as never,
    );

    return { handoffService, jobProducer, stores, enqueuedJobs, prisma };
  }

  it('PUBLICATION OFF: D4 arbitration → handoff → validated job payload', async () => {
    const { handoffService, enqueuedJobs } = buildHandoffHarness();
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

    const arbitration = arbitrateLvPublicationTrack(epochCandidates);
    expect(arbitration.selected?.assessmentId).toBe(workshopId);

    const result = await handoffService.ensurePublicationHandoff({
      organizationId,
      vehicleId,
      epochCandidates,
    });

    expect(result.enqueued).toBe(true);
    expect(result.idempotencyKey).toBe(`pub:${workshopId}:v1`);
    expect(enqueuedJobs).toHaveLength(1);

    const validated = validateBatteryV2JobPayload(
      'BATTERY_PUBLICATION_UPDATE',
      {
        organizationId,
        vehicleId,
        idempotencyKey: `pub:${workshopId}:v1`,
        assessmentId: workshopId,
        publicationVersion: LV_PUBLICATION_CONTRACT_VERSION,
        sourceEntityId: workshopId,
        requestedAt: new Date().toISOString(),
        correlationId: 'integration-test',
        modelVersion: '1.0.0',
        attemptContext: {
          attemptNumber: 1,
          maxAttempts: 3,
          enqueuedAt: new Date().toISOString(),
          previousFailureCode: null,
        },
      },
    );

    expect(validated.assessmentId).toBe(workshopId);
    expect(validated.publicationVersion).toBe(1);
  });

  it('PUBLICATION ON config: handler delegates to BatteryPublicationService', async () => {
    const publicationService = {
      updateLvPublication: jest.fn().mockResolvedValue({
        ok: true,
        decision: { maturity: 'STABLE', reasons: [] },
        persistedPublicationId: 'pub-1',
        supersededPublicationId: null,
      }),
    };
    const publicationHandoff = {
      acknowledgeExecuted: jest.fn().mockResolvedValue(undefined),
    };

    const handler = new BatteryPublicationUpdateHandler(
      publicationService as unknown as BatteryPublicationService,
      publicationHandoff as never,
    );

    await handler.handle({
      organizationId,
      vehicleId,
      assessmentId: workshopId,
      publicationVersion: 1,
      idempotencyKey: `pub:${workshopId}:v1`,
      sourceEntityId: workshopId,
      requestedAt: new Date().toISOString(),
      correlationId: 'integration-on',
      modelVersion: 1,
      attemptContext: {
        attemptNumber: 1,
        maxAttempts: 3,
        enqueuedAt: new Date().toISOString(),
        previousFailureCode: null,
      },
    } as never);

    expect(publicationService.updateLvPublication).toHaveBeenCalledWith(
      expect.objectContaining({
        assessmentId: workshopId,
        publicationVersion: 1,
      }),
    );
    expect(publicationHandoff.acknowledgeExecuted).toHaveBeenCalled();
  });

  it('persists durable ENQUEUED handoff metadata on selected assessment', async () => {
    const { handoffService, stores } = buildHandoffHarness();
    await handoffService.ensurePublicationHandoff({
      organizationId,
      vehicleId,
      epochCandidates: [
        {
          assessmentId: workshopId,
          assessmentTrack: 'WORKSHOP_OVERRIDE',
          assessmentMode: 'CANONICAL',
        },
      ],
    });

    const handoff = readPublicationHandoffFromAssessmentSummary(stores.get(workshopId));
    expect(handoff?.status).toBe(LV_PUBLICATION_HANDOFF_STATUS.ENQUEUED);
    expect(handoff?.epochAssessmentIds).toEqual([workshopId]);
  });
});
