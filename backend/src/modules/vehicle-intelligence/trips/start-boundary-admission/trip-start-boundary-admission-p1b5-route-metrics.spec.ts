import { runStartBoundaryAdmissionShadow } from './trip-start-boundary-admission-shadow.runtime';

const PILOT_TESLA_VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const NON_PILOT_VEHICLE_ID = '00000000-0000-4000-8000-000000000099';

const seg = {
  segmentId: 'seg-1',
  mechanism: 'changePointDetection',
  startTime: '2026-10-16T03:36:00.000Z',
  endTime: '2026-10-16T04:00:00.000Z',
  isOngoing: false,
  startedBeforeRange: false,
  durationSeconds: 3600,
  startLatitude: 51,
  startLongitude: 9,
  endLatitude: 51.1,
  endLongitude: 9.1,
  odometerStartKm: null,
  odometerEndKm: null,
  distanceKm: 1,
  maxSpeedKmh: 10,
};

describe('P1B.5 — shadow route-fetch provider observability', () => {
  it('non-allowlisted vehicle returns null without provider fetch', async () => {
    const fetchRoute = jest.fn();
    const attempts = { inc: jest.fn() };
    const out = await runStartBoundaryAdmissionShadow({
      vehicleId: NON_PILOT_VEHICLE_ID,
      dimoTokenId: 186946,
      candidateStartAt: new Date('2026-10-16T03:38:26.989Z'),
      confirmedAt: new Date('2026-10-16T03:39:10.000Z'),
      corePoints: [],
      profile: 'EV',
      integrationModality: 'SOFTWARE_INTEGRATION',
      legacy: {
        startAt: new Date('2026-10-16T03:36:00.000Z'),
        source: 'DIMO_SEGMENT',
        dimoSegmentId: 'seg-1',
      },
      evidence: {
        boundaryWindowFrom: new Date('2026-10-16T03:36:00.000Z'),
        segments: [seg as never],
        matchingSegment: seg as never,
        routePoints: [],
        legacyRouteFetchPerformed: false,
      },
      segments: { fetchRouteEnrichment: fetchRoute } as never,
      providerContext: {},
      tripMetrics: {
        tripStartBoundaryAdmissionShadowRouteFetchAttempts: attempts,
        tripStartBoundaryAdmissionShadowRouteFetchErrors: { inc: jest.fn() },
      } as never,
      env: {
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED: 'true',
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS: PILOT_TESLA_VEHICLE_ID,
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED: 'true',
      },
    });
    expect(out).toBeNull();
    expect(fetchRoute).not.toHaveBeenCalled();
    expect(attempts.inc).not.toHaveBeenCalled();
  });

  it('records route-fetch attempt before provider call and error on failure', async () => {
    const fetchRoute = jest.fn().mockRejectedValue(new Error('provider-down'));
    const attempts = { inc: jest.fn() };
    const errors = { inc: jest.fn() };
    const result = await runStartBoundaryAdmissionShadow({
      vehicleId: PILOT_TESLA_VEHICLE_ID,
      dimoTokenId: 186946,
      candidateStartAt: new Date('2026-10-16T03:38:26.989Z'),
      confirmedAt: new Date('2026-10-16T03:39:10.000Z'),
      corePoints: [],
      profile: 'EV',
      integrationModality: 'SOFTWARE_INTEGRATION',
      legacy: {
        startAt: new Date('2026-10-16T03:36:00.000Z'),
        source: 'DIMO_SEGMENT',
        dimoSegmentId: 'seg-1',
      },
      evidence: {
        boundaryWindowFrom: new Date('2026-10-16T03:36:00.000Z'),
        segments: [seg as never],
        matchingSegment: seg as never,
        routePoints: [],
        legacyRouteFetchPerformed: false,
      },
      segments: { fetchRouteEnrichment: fetchRoute } as never,
      providerContext: {},
      tripMetrics: {
        tripStartBoundaryAdmissionShadowRouteFetchAttempts: attempts,
        tripStartBoundaryAdmissionShadowRouteFetchErrors: errors,
        tripStartBoundaryAdmissionShadowErrors: { inc: jest.fn() },
        tripStartBoundaryAdmissionShadowComparisons: { inc: jest.fn() },
        tripStartBoundaryAdmissionShadowDeltaSeconds: { observe: jest.fn() },
      } as never,
      env: {
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED: 'true',
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS: PILOT_TESLA_VEHICLE_ID,
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED: 'true',
      },
    });
    expect(attempts.inc).toHaveBeenCalledTimes(1);
    expect(fetchRoute).toHaveBeenCalledTimes(1);
    expect(errors.inc).toHaveBeenCalledTimes(1);
    expect(result?.shadowExecutionFailure).toBe('provider-down');
  });

  it('route-fetch OFF — no attempt metric and no provider call', async () => {
    const fetchRoute = jest.fn();
    const attempts = { inc: jest.fn() };
    await runStartBoundaryAdmissionShadow({
      vehicleId: PILOT_TESLA_VEHICLE_ID,
      dimoTokenId: 186946,
      candidateStartAt: new Date('2026-10-16T03:38:26.989Z'),
      confirmedAt: new Date('2026-10-16T03:39:10.000Z'),
      corePoints: [],
      profile: 'EV',
      integrationModality: 'UNKNOWN',
      legacy: {
        startAt: new Date('2026-10-16T03:36:00.000Z'),
        source: 'DIMO_SEGMENT',
        dimoSegmentId: 'seg-1',
      },
      evidence: {
        boundaryWindowFrom: new Date('2026-10-16T03:36:00.000Z'),
        segments: [seg as never],
        matchingSegment: seg as never,
        routePoints: [],
        legacyRouteFetchPerformed: false,
      },
      segments: { fetchRouteEnrichment: fetchRoute } as never,
      providerContext: {},
      tripMetrics: {
        tripStartBoundaryAdmissionShadowRouteFetchAttempts: attempts,
      } as never,
      env: {
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED: 'true',
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS: PILOT_TESLA_VEHICLE_ID,
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED: 'false',
      },
    });
    expect(fetchRoute).not.toHaveBeenCalled();
    expect(attempts.inc).not.toHaveBeenCalled();
  });
});
