import {
 DetectionConfidence,
 TripDetectionState,
 VehicleDetectionProfile,
} from '@prisma/client';
import { TripDetectionOrchestrationService } from '../trip-detection-orchestration.service';

export const P1B_ORCH_LEGACY_START = new Date('2026-10-16T03:36:00.000Z');
export const P1B_ORCH_CANDIDATE = new Date('2026-10-16T03:38:26.989Z');
export const P1B_ORCH_NOW = new Date('2026-10-16T03:39:10.000Z');

export function boundaryResolution() {
 return {
 legacy: {
 startAt: P1B_ORCH_LEGACY_START,
 source: 'DIMO_SEGMENT' as const,
 startLatitude: 51,
 startLongitude: 9,
 adjustedMs: P1B_ORCH_LEGACY_START.getTime() - P1B_ORCH_CANDIDATE.getTime(),
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

/** Canonical test vehicle UUID (not a production pilot ID). */
export const P1B_ORCH_TEST_VEHICLE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

export function buildOrchestrationHarness(options?: {
 vehicleId?: string;
 dimoTokenId?: number;
}) {
 const vehicleId = options?.vehicleId ?? P1B_ORCH_TEST_VEHICLE_ID;
 const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
 const transitionState = jest.fn().mockResolvedValue({});
 const createTrip = jest.fn().mockResolvedValue({
 id: 'trip-p1b',
 startTime: P1B_ORCH_LEGACY_START,
 });
 const maybeRecoverLifecycleInvariant = jest.fn().mockResolvedValue('continue');
 const fetchRouteEnrichment = jest.fn().mockResolvedValue([]);

 const det = {
 vehicleId,
 organizationId: 'org-p1b',
 state: TripDetectionState.POSSIBLE_START,
 detectionProfile: VehicleDetectionProfile.EV,
 possibleStartAt: P1B_ORCH_CANDIDATE,
 possibleStartEnteredAt: P1B_ORCH_CANDIDATE,
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
 findUnique: jest.fn().mockResolvedValue({ speedKmh: 10, updatedAt: P1B_ORCH_NOW }),
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
 vehicleId,
 dimoTokenId: options?.dimoTokenId ?? 186946,
 scheduleActiveTick,
 transitionState,
 createTrip,
 maybeRecoverLifecycleInvariant,
 fetchRouteEnrichment,
 prismaFindFirst: svc.prisma.vehicleDataSourceLink.findFirst,
 };
}
