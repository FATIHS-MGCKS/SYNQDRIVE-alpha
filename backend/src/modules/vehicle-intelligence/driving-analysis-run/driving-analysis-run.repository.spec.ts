import { DrivingAnalysisRunRepository } from './driving-analysis-run.repository';
import type { BeginDrivingAnalysisRunInput } from './driving-analysis-run.types';

function makePrisma() {
  return {
    vehicleTrip: { findFirst: jest.fn() },
    drivingAnalysisRun: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  } as any;
}

function beginInput(overrides: Partial<BeginDrivingAnalysisRunInput> = {}): BeginDrivingAnalysisRunInput {
  return {
    organizationId: 'org-1',
    vehicleId: 'vehicle-1',
    tripId: 'trip-1',
    analysisType: 'TRIP_ASSESSABILITY',
    modelVersion: 'assessability-v1',
    capabilityVersion: 'cap-v1',
    inputIdentity: {
      organizationId: 'org-1',
      tripId: 'trip-1',
      vehicleId: 'vehicle-1',
      analysisType: 'TRIP_ASSESSABILITY',
      dimoSegmentId: 'seg-1',
      tripEndTimeIso: '2026-07-16T08:45:00.000Z',
      behaviorEnrichmentStatus: 'COMPLETED',
      routeEnrichmentStatus: 'COMPLETED',
      nativeEventCount: 2,
      hfPointsCleaned: 100,
      waypointCount: 50,
      capabilityVersion: 'cap-v1',
    },
    startedAt: new Date('2026-07-16T09:00:00Z'),
    ...overrides,
  };
}

describe('DrivingAnalysisRunRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: DrivingAnalysisRunRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repository = new DrivingAnalysisRunRepository(prisma);
    prisma.vehicleTrip.findFirst.mockResolvedValue({ id: 'trip-1', vehicleId: 'vehicle-1' });
  });

  it('deduplicates identical completed run (same model + fingerprint)', async () => {
    prisma.drivingAnalysisRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'run-completed', status: 'COMPLETED', supersedesRunId: null });

    const result = await repository.resolveOrBeginRun(beginInput());
    expect(result.created).toBe(false);
    expect(result.deduplicated).toBe(true);
    expect(result.run.id).toBe('run-completed');
    expect(prisma.drivingAnalysisRun.create).not.toHaveBeenCalled();
  });

  it('creates new run when input identity changes and supersedes prior completed run', async () => {
    prisma.drivingAnalysisRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'run-old',
        modelVersion: 'assessability-v1',
        inputFingerprint: 'old-fingerprint-value',
        status: 'COMPLETED',
      });
    prisma.drivingAnalysisRun.update.mockResolvedValue({ id: 'run-old', status: 'SUPERSEDED' });
    prisma.drivingAnalysisRun.create.mockResolvedValue({
      id: 'run-new',
      status: 'IN_PROGRESS',
      supersedesRunId: 'run-old',
      inputFingerprint: 'new-fp',
      modelVersion: 'assessability-v1',
      analysisType: 'TRIP_ASSESSABILITY',
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      tripId: 'trip-1',
      capabilityVersion: 'cap-v1',
      recomputeReason: 'INPUT_OR_MODEL_CHANGED',
    });

    const result = await repository.resolveOrBeginRun(
      beginInput({
        inputIdentity: {
          ...beginInput().inputIdentity,
          waypointCount: 99,
        },
        recomputeReason: 'ROUTE_REENRICHED',
      }),
    );

    expect(result.created).toBe(true);
    expect(result.deduplicated).toBe(false);
    expect(result.supersededRunId).toBe('run-old');
    expect(prisma.drivingAnalysisRun.update).toHaveBeenCalledWith({
      where: { id: 'run-old' },
      data: { status: 'SUPERSEDED', maturity: 'SUPERSEDED' },
    });
    expect(prisma.drivingAnalysisRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supersedesRunId: 'run-old',
          status: 'IN_PROGRESS',
          recomputeReason: 'ROUTE_REENRICHED',
        }),
      }),
    );
  });

  it('creates new run when model version changes', async () => {
    prisma.drivingAnalysisRun.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'run-v1',
        modelVersion: 'assessability-v1',
        inputFingerprint: 'same-fp',
        status: 'COMPLETED',
      });
    prisma.drivingAnalysisRun.create.mockResolvedValue({
      id: 'run-v2',
      status: 'IN_PROGRESS',
      supersedesRunId: 'run-v1',
      modelVersion: 'assessability-v2',
      inputFingerprint: 'same-fp',
      analysisType: 'TRIP_ASSESSABILITY',
      organizationId: 'org-1',
      vehicleId: 'vehicle-1',
      tripId: 'trip-1',
      capabilityVersion: 'cap-v1',
      recomputeReason: 'INPUT_OR_MODEL_CHANGED',
    });

    const result = await repository.resolveOrBeginRun(
      beginInput({ modelVersion: 'assessability-v2' }),
    );

    expect(result.created).toBe(true);
    expect(result.supersededRunId).toBe('run-v1');
    expect(prisma.drivingAnalysisRun.update).toHaveBeenCalled();
  });

  it('marks run completed with stage summary', async () => {
    prisma.drivingAnalysisRun.findFirst.mockResolvedValue({
      id: 'run-1',
      maturity: 'SHADOW',
    });
    prisma.drivingAnalysisRun.update.mockResolvedValue({ id: 'run-1', status: 'COMPLETED' });

    await repository.markCompleted({
      organizationId: 'org-1',
      runId: 'run-1',
      stageSummary: { assessability: 'done', route: 'done' },
    });

    expect(prisma.drivingAnalysisRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          stageSummaryJson: { assessability: 'done', route: 'done' },
        }),
      }),
    );
  });
});
