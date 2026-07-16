import { TripAnalysisCoordinatorService } from './trip-analysis-coordinator.service';
import { parseAnalysisStagesDocument } from './trip-analysis-status';

function makeTripRow(overrides: Record<string, unknown> = {}) {
  return {
    analysisQueuedAt: new Date('2026-07-16T09:00:00.000Z'),
    analysisPartialAt: null,
    analysisStagesJson: {
      behavior: { state: 'skipped', attempts: 1, completedAt: '2026-07-16T09:01:00.000Z', errorCode: 'NO_HF_DATA' },
      nativeEvents: { state: 'done', attempts: 1, completedAt: '2026-07-16T09:02:00.000Z', errorCode: null },
      route: { state: 'done', attempts: 1, completedAt: '2026-07-16T09:03:00.000Z', errorCode: null },
      eventContext: { state: 'pending', attempts: 0 },
      misuse: { state: 'pending', attempts: 0 },
      drivingImpact: { state: 'pending', attempts: 0 },
      attribution: { state: 'pending', attempts: 0 },
    },
    behaviorEnrichmentStatus: 'SKIPPED_NO_HF_DATA',
    behaviorSummaryStatus: 'SKIPPED',
    behaviorSummaryJson: {
      analysisAssessability: 'LIMITED',
      nativeBehaviorEventsAvailable: true,
      hfInsufficientForAbuse: true,
    },
    drivingImpactStatus: 'PENDING',
    vehicleId: 'vehicle-1',
    ...overrides,
  };
}

describe('TripAnalysisCoordinatorService mixed stage outcomes', () => {
  function createService() {
    const updates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
    const prisma = {
      vehicleTrip: {
        findUnique: jest.fn(),
        update: jest.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args);
          return args;
        }),
      },
    };
    const service = new TripAnalysisCoordinatorService(prisma as any);
    return { service, prisma, updates };
  }

  it('keeps route and native events done when eventContext fails', async () => {
    const { service, prisma, updates } = createService();
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeTripRow());

    await service.markStageFailed('trip-1', 'eventContext', 'EVENT_CONTEXT_FAILED');

    expect(updates).toHaveLength(1);
    const doc = parseAnalysisStagesDocument(updates[0].data.analysisStagesJson);
    expect(doc.route?.state).toBe('done');
    expect(doc.nativeEvents?.state).toBe('done');
    expect(doc.eventContext?.state).toBe('failed');
    expect(doc.eventContext?.errorCode).toBe('EVENT_CONTEXT_FAILED');
    expect(updates[0].data.tripAnalysisStatus).toBe('PARTIAL');
    expect(updates[0].data.behaviorSummaryStatus).toBe('SKIPPED');
  });

  it('uses global FAILED only for behavior critical failure', async () => {
    const { service, prisma, updates } = createService();
    prisma.vehicleTrip.findUnique.mockResolvedValue(
      makeTripRow({
        analysisStagesJson: {
          behavior: { state: 'pending', attempts: 0 },
          route: { state: 'done', attempts: 1, completedAt: '2026-07-16T09:03:00.000Z' },
          nativeEvents: { state: 'done', attempts: 1, completedAt: '2026-07-16T09:02:00.000Z' },
          eventContext: { state: 'pending', attempts: 0 },
          misuse: { state: 'pending', attempts: 0 },
          drivingImpact: { state: 'pending', attempts: 0 },
          attribution: { state: 'pending', attempts: 0 },
        },
      }),
    );

    await service.onAnalysisFailed('trip-1', 'behavior_enrichment_failed', 'behavior');

    expect(updates[0].data.tripAnalysisStatus).toBe('FAILED');
    const doc = parseAnalysisStagesDocument(updates[0].data.analysisStagesJson);
    expect(doc.behavior?.state).toBe('failed');
    expect(doc.route?.state).toBe('done');
    expect(doc.nativeEvents?.state).toBe('done');
  });

  it('delegates non-behavior failures to stage-local PARTIAL handling', async () => {
    const { service, prisma, updates } = createService();
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeTripRow());

    await service.onAnalysisFailed('trip-1', 'misuse_aggregation_failed', 'misuse');

    expect(updates[0].data.tripAnalysisStatus).toBe('PARTIAL');
    const doc = parseAnalysisStagesDocument(updates[0].data.analysisStagesJson);
    expect(doc.misuse?.state).toBe('failed');
    expect(doc.route?.state).toBe('done');
  });

  it('records misuse NOT_ASSESSABLE without global failure', async () => {
    const { service, prisma, updates } = createService();
    prisma.vehicleTrip.findUnique.mockResolvedValue(makeTripRow());

    await service.markStageNotAssessable('trip-1', 'misuse', 'INSUFFICIENT_HF');

    const doc = parseAnalysisStagesDocument(updates[0].data.analysisStagesJson);
    expect(doc.misuse?.state).toBe('not_assessable');
    expect(doc.misuse?.errorCode).toBe('INSUFFICIENT_HF');
    expect(updates[0].data.tripAnalysisStatus).not.toBe('FAILED');
  });

  it('behavior skip does not cascade-skip route or native events', async () => {
    const { service, prisma, updates } = createService();
    prisma.vehicleTrip.findUnique.mockResolvedValue(
      makeTripRow({
        analysisStagesJson: {
          behavior: { state: 'pending', attempts: 0 },
          route: { state: 'done', attempts: 1, completedAt: '2026-07-16T09:03:00.000Z' },
          nativeEvents: { state: 'done', attempts: 1, completedAt: '2026-07-16T09:02:00.000Z' },
          eventContext: { state: 'pending', attempts: 0 },
          misuse: { state: 'pending', attempts: 0 },
          drivingImpact: { state: 'pending', attempts: 0 },
          attribution: { state: 'pending', attempts: 0 },
        },
      }),
    );

    await service.onBehaviorSkipped('trip-1', 'NO_HF_DATA', {
      analysisAssessability: 'NOT_ASSESSABLE',
      analysisLimitReason: 'INSUFFICIENT_HF',
      shortTermMisuseAssessable: false,
      nativeBehaviorEventsAvailable: false,
      hfInsufficientForAbuse: true,
    });

    const lastUpdate = updates[updates.length - 1];
    const doc = parseAnalysisStagesDocument(lastUpdate.data.analysisStagesJson);
    expect(doc.behavior?.state).toBe('skipped');
    expect(doc.route?.state).toBe('done');
    expect(doc.nativeEvents?.state).toBe('done');
  });
});
