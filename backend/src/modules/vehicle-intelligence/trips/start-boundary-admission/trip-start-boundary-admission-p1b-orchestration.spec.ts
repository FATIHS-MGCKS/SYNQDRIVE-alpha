import {
  DetectionConfidence,
  TripDetectionState,
  VehicleDetectionProfile,
} from '@prisma/client';
import { TripDetectionOrchestrationService } from '../trip-detection-orchestration.service';
import { TRIP_TRACKING_TRIGGERS } from '../trip-detection.types';
import * as modality from './trip-start-boundary-integration-modality';
import * as shadowRuntime from './trip-start-boundary-admission-shadow.runtime';
import {
  TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV,
} from './trip-start-boundary-admission-shadow.config';

const VEHICLE = 'veh-p1b';
const LEGACY_START = new Date('2026-10-16T03:36:00.000Z');
const CANDIDATE = new Date('2026-10-16T03:38:26.989Z');
const NOW = new Date('2026-10-16T03:39:10.000Z');

function boundaryResolution() {
  return {
    legacy: {
      startAt: LEGACY_START,
      source: 'DIMO_SEGMENT' as const,
      startLatitude: 51,
      startLongitude: 9,
      adjustedMs: LEGACY_START.getTime() - CANDIDATE.getTime(),
      dimoSegmentId: 'dimo-seg-test',
    },
    evidence: {
      boundaryWindowFrom: new Date('2026-10-16T03:36:00.000Z'),
      segments: [],
      matchingSegment: null,
      routePoints: [],
      legacyRouteFetchPerformed: false,
    },
  };
}

function buildHarness() {
  const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
  const transitionState = jest.fn().mockResolvedValue({});
  const createTrip = jest.fn().mockResolvedValue({
    id: 'trip-p1b',
    startTime: LEGACY_START,
  });
  const maybeRecoverLifecycleInvariant = jest.fn().mockResolvedValue('continue');
  const fetchRouteEnrichment = jest.fn().mockResolvedValue([]);

  const det = {
    vehicleId: VEHICLE,
    organizationId: 'org-p1b',
    state: TripDetectionState.POSSIBLE_START,
    detectionProfile: VehicleDetectionProfile.EV,
    possibleStartAt: CANDIDATE,
    possibleStartEnteredAt: CANDIDATE,
    activeTripId: null,
    lastEvidenceSummary: {},
  };

  const svc = {
    logger: { warn: jest.fn(), log: jest.fn(), debug: jest.fn() },
    CONFIRM_MAX_WAIT_MS: 180_000,
    BACKFILL_MS: 60_000,
    tripStartBoundaryMaxLookbackMs: 180_000,
    maxSameTripQualifiedStopMs: 300_000,
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    maybeRecoverLifecycleInvariant,
    logTrackingRun: jest.fn().mockResolvedValue(undefined),
    scheduleActiveTick,
    schedulePossibleStart: jest.fn(),
    transitionState,
    decisionEngine: { createTrip, reopenTripForMerge: jest.fn() },
    batteryTripStartProducer: { enqueueStartProxy: jest.fn().mockResolvedValue('job') },
    fetchAndStoreStartTemperature: jest.fn().mockResolvedValue(undefined),
    fetchAndStoreInitialRoute: jest.fn().mockResolvedValue(undefined),
    segments: {
      fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
      fetchRouteEnrichment,
    },
    prisma: {
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue({ speedKmh: 10, updatedAt: NOW }),
      },
      vehicleTrip: { findFirst: jest.fn().mockResolvedValue(null) },
      vehicleDataSourceLink: { findFirst: jest.fn().mockResolvedValue(null) },
    },
    policyResolver: {
      resolve: jest.fn().mockReturnValue({
        detectors: ['StartConfirmationDetector'],
        timeoutMs: 5000,
      }),
    },
    detectorRegistry: {
      runAll: jest.fn().mockResolvedValue([
        {
          detectorName: 'StartConfirmationDetector',
          verdict: 'TRIGGERED',
          confidence: 'HIGH',
          evidence: { mode: 'IGNITION_PRIMARY', summary: { confirmed: true } },
        },
      ]),
    },
    hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(false),
    resolveConfirmedStartBoundary: jest.fn().mockResolvedValue(boundaryResolution()),
    tripMetrics: {
      tripEvidencePaths: { inc: jest.fn() },
      tripStartsConfirmed: { inc: jest.fn() },
      tripStartRecognitionLatency: { observe: jest.fn() },
      tripStartBoundaryAdjustment: { observe: jest.fn() },
      tripStartBoundaryAdmissionShadowComparisons: { inc: jest.fn() },
      tripStartBoundaryAdmissionShadowDeltaSeconds: { observe: jest.fn() },
    },
    logTripStartTimeline: jest.fn(),
    dimoProviderContext: jest.fn().mockReturnValue({}),
  };

  return {
    svc: svc as unknown as TripDetectionOrchestrationService,
    scheduleActiveTick,
    transitionState,
    createTrip,
    maybeRecoverLifecycleInvariant,
    fetchRouteEnrichment,
    prismaFindFirst: svc.prisma.vehicleDataSourceLink.findFirst,
  };
}

describe('P1B orchestration — shadow gate wiring', () => {
  const modalitySpy = jest.spyOn(modality, 'resolveTripStartIntegrationModality');
  const shadowSpy = jest.spyOn(shadowRuntime, 'runStartBoundaryAdmissionShadow');

  const originalEnv = process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV];

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    modalitySpy.mockReset().mockResolvedValue('SOFTWARE_INTEGRATION');
    shadowSpy.mockReset().mockResolvedValue({
      vehicleId: VEHICLE,
      dimoTokenId: 186946,
      integrationModality: 'SOFTWARE_INTEGRATION',
      providerSegmentId: null,
      providerSegmentDetectionMechanism: null,
      candidateStartAt: CANDIDATE.toISOString(),
      legacyCanonicalStartAt: LEGACY_START.toISOString(),
      proposedCanonicalStartAt: CANDIDATE.toISOString(),
      shadowProposedStartAt: CANDIDATE.toISOString(),
      shadowDeltaMs: 146989,
      shadowDecision: 'PROVIDER_START_UNCORROBORATED',
      deltaMs: 146989,
      decision: 'PROVIDER_START_UNCORROBORATED',
      movementEvidenceSources: [],
      movementEvidenceCoverage: 'NO_DATA_IN_WINDOW',
      routeEvidenceAvailable: false,
      additionalShadowRouteFetchPerformed: false,
      legacyRouteFetchPerformed: false,
      uncorroboratedPrefixFromAt: null,
      uncorroboratedPrefixToAt: null,
      shadowExecutionFailure: null,
      observedAt: NOW.toISOString(),
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (originalEnv === undefined) {
      delete process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV];
    } else {
      process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = originalEnv;
    }
  });

  async function runConfirm(h: ReturnType<typeof buildHarness>) {
    await TripDetectionOrchestrationService.prototype.processPossibleStart.call(
      h.svc,
      {
        vehicleId: VEHICLE,
        organizationId: 'org-p1b',
        dimoTokenId: 186946,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        requestedAt: NOW.toISOString(),
      },
    );
  }

  it('Shadow OFF — no modality DB read, no shadow runner, legacy canonical only', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'false';
    const h = buildHarness();

    await runConfirm(h);

    expect(modalitySpy).not.toHaveBeenCalled();
    expect(shadowSpy).not.toHaveBeenCalled();
    expect(h.fetchRouteEnrichment).not.toHaveBeenCalled();
    expect(h.prismaFindFirst).not.toHaveBeenCalled();
    expect(h.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: LEGACY_START,
        lifecycleRecovery: expect.objectContaining({
          effectiveStartAt: LEGACY_START,
          candidateStartAt: CANDIDATE,
        }),
      }),
    );
    expect(h.maybeRecoverLifecycleInvariant).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ expectedStartAt: LEGACY_START }),
      }),
    );
    const summary = h.transitionState.mock.calls[0][2].lastEvidenceSummary as Record<
      string,
      unknown
    >;
    expect(summary.confirmedStartAt).toBe(LEGACY_START.toISOString());
    expect(summary.shadowStartBoundaryAdmission).toBeUndefined();
  });

  it('Shadow ON — modality once, shadow runs, legacy canonical unchanged', async () => {
    process.env[TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED_ENV] = 'true';
    const h = buildHarness();

    await runConfirm(h);

    expect(modalitySpy).toHaveBeenCalledTimes(1);
    expect(shadowSpy).toHaveBeenCalledTimes(1);
    expect(h.createTrip).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: LEGACY_START }),
    );
    const summary = h.transitionState.mock.calls[0][2].lastEvidenceSummary as Record<
      string,
      unknown
    >;
    expect(summary.confirmedStartAt).toBe(LEGACY_START.toISOString());
    expect(summary.shadowStartBoundaryAdmission).toBeDefined();
  });
});
