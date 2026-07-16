import { ShadowDetectorOrchestratorService } from './shadow-detector.orchestrator.service';
import { DrivingIntelligenceV2Config } from '../driving-intelligence-v2/driving-intelligence-v2.config';

describe('ShadowDetectorOrchestratorService shadow isolation', () => {
  function makeService(options?: {
    frameworkEnabled?: boolean;
    tripStatus?: string;
  }) {
    const prisma = {
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'trip-1',
          vehicleId: 'veh-1',
          startTime: new Date('2026-07-16T10:00:00Z'),
          endTime: new Date('2026-07-16T10:30:00Z'),
          tripStatus: options?.tripStatus ?? 'COMPLETED',
        }),
      },
      drivingEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        createMany: jest.fn(),
      },
      tripBehaviorEvent: {
        create: jest.fn(),
        createMany: jest.fn(),
      },
      misuseCase: {
        create: jest.fn(),
      },
    };

    const detectorCapabilities = {
      resolveForVehicle: jest.fn().mockResolvedValue({
        resolverVersion: 'driving-detector-cap-v1',
        capabilityVersion: 'cap-preflight-v1',
        hardwareType: 'LTE_R1',
        fuelType: 'PETROL',
        hardwareBaselineLabel: 'LTE_R1',
        resolvedAt: new Date().toISOString(),
        detectors: [
          {
            detectorKey: 'cold_engine_load',
            label: 'Cold Engine Load',
            status: 'SHADOW',
            reasons: [],
            requiredSignals: ['obdEngineLoad'],
            requiredNativeEvents: [],
            requiredSegmentDetectors: [],
            missingRequirements: [],
            capabilityVersion: 'cap-v1',
            effectiveCadenceMs: 5000,
            p95CadenceMs: 8000,
            coverage: 0.8,
            hardwareType: 'LTE_R1',
          },
          {
            detectorKey: 'wheel_slip',
            label: 'Wheel Slip',
            status: 'UNSUPPORTED',
            reasons: [],
            requiredSignals: ['chassisAxleRow1WheelLeftSpeed'],
            requiredNativeEvents: [],
            requiredSegmentDetectors: [],
            missingRequirements: ['chassisAxleRow1WheelLeftSpeed'],
            capabilityVersion: 'cap-v1',
            effectiveCadenceMs: null,
            p95CadenceMs: null,
            coverage: null,
            hardwareType: 'LTE_R1',
          },
        ],
      }),
    };

    const evidence = {
      record: jest.fn().mockResolvedValue({ row: { id: 'ev-1' }, created: true }),
    };

    const v2Config = {
      isMasterEnabled: () => options?.frameworkEnabled ?? true,
      isEngineDetectorShadowEnabled: () => options?.frameworkEnabled ?? true,
      isHfDetectorShadowEnabled: () => options?.frameworkEnabled ?? true,
    } as DrivingIntelligenceV2Config;

    const enrichment = {
      buildExecutionContext: jest.fn().mockResolvedValue({
        fuelType: 'PETROL',
        isEvPowertrain: false,
        isPhev: false,
        iceOperationConfirmed: true,
        hfSamples: [],
        effectiveCadenceMs: 5000,
        p95CadenceMs: 8000,
        hfCoverage: 0.8,
        coolantSampleCount: 0,
        exteriorTempSampleCount: 0,
        misuseCases: [],
        tripContext: {
          tripStartTime: '2026-07-16T10:00:00.000Z',
          tripEndTime: '2026-07-16T10:30:00.000Z',
          tripDurationMs: 1_800_000,
        },
        dimoIdlingSegments: [],
        dimoIdlingProviderError: null,
        ignitionSampleCount: 0,
        rpmSampleCount: 0,
        speedSampleCount: 0,
        engineRuntimeSampleCount: 0,
        tractionBatteryPowerSampleCount: 0,
        socSampleCount: 0,
        tractionBatteryTemperatureSampleCount: 0,
        providerGaps: ['DIMO_IDLING_SEGMENTS_UNAVAILABLE'],
      }),
    };

    const tripMetrics = {
      shadowDetectorRun: { inc: jest.fn() },
      shadowDetectorSkipped: { inc: jest.fn() },
      shadowDetectorCandidates: { inc: jest.fn() },
      shadowDetectorFrameworkSkipped: { inc: jest.fn() },
    };

    const service = new ShadowDetectorOrchestratorService(
      prisma as any,
      detectorCapabilities as any,
      evidence as any,
      v2Config,
      enrichment as any,
      tripMetrics as any,
    );

    return { service, prisma, evidence, tripMetrics, enrichment };
  }

  it('persists only DrivingEvidence and never productive DrivingEvent rows', async () => {
    const { service, prisma, evidence } = makeService();

    await service.runForTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
    });

    expect(evidence.record).toHaveBeenCalled();
    expect(evidence.record.mock.calls[0][0].sourceType).toBe('ESTIMATED_PROXY');
    expect(evidence.record.mock.calls[0][0].context.publicationBlocked).toBe(true);
    expect(prisma.drivingEvent.create).not.toHaveBeenCalled();
    expect(prisma.drivingEvent.createMany).not.toHaveBeenCalled();
    expect(prisma.tripBehaviorEvent.create).not.toHaveBeenCalled();
    expect(prisma.tripBehaviorEvent.createMany).not.toHaveBeenCalled();
    expect(prisma.misuseCase.create).not.toHaveBeenCalled();
  });

  it('skips framework when shadow flags are disabled', async () => {
    const { service, evidence, tripMetrics } = makeService({ frameworkEnabled: false });

    const outcome = await service.runForTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
    });

    expect(outcome.skippedFramework).toBe(true);
    expect(evidence.record).not.toHaveBeenCalled();
    expect(tripMetrics.shadowDetectorFrameworkSkipped.inc).toHaveBeenCalled();
  });

  it('uses stable idempotency keys per trip and detector', async () => {
    const { service, evidence } = makeService();

    await service.runForTrip({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      analysisRunId: 'run-1',
    });

    const key = evidence.record.mock.calls[0][0].idempotencyKey as string;
    expect(key).toMatch(/^shadow-detector:trip-1:cold_engine_load:/);
  });
});
