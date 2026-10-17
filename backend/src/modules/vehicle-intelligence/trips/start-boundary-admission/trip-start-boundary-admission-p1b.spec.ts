import { compareStartBoundaryAdmissionShadow } from './trip-start-boundary-admission.shadow';
import {
  isTripStartBoundaryAdmissionShadowEnabled,
  isTripStartBoundaryAdmissionShadowRouteFetchEnabled,
} from './trip-start-boundary-admission-shadow.config';
import { resolveLegacyConfirmedStartBoundary } from './trip-start-boundary-legacy-resolution';
import { runStartBoundaryAdmissionShadow } from './trip-start-boundary-admission-shadow.runtime';
import { resolveEvidenceBackedStartBoundary } from './trip-start-boundary-admission.resolver';
import type { DimoTripSegment } from '../../../dimo/dimo-segments.service';

const TESLA_PROVIDER = '2026-10-16T03:36:00.000Z';
const TESLA_CANDIDATE = new Date('2026-10-16T03:38:26.989Z');
const TESLA_CONFIRMED = new Date('2026-10-16T03:39:10.000Z');

function segment(
  partial: Partial<DimoTripSegment> & Pick<DimoTripSegment, 'startTime'>,
): DimoTripSegment {
  return {
    segmentId: partial.segmentId ?? 'seg-1',
    mechanism: partial.mechanism ?? 'changePointDetection',
    startTime: partial.startTime,
    endTime: partial.endTime ?? '2026-10-16T04:00:00.000Z',
    isOngoing: false,
    startedBeforeRange: false,
    durationSeconds: 3600,
    startLatitude: partial.startLatitude ?? 51,
    startLongitude: partial.startLongitude ?? 9,
    endLatitude: partial.endLatitude ?? 51.1,
    endLongitude: partial.endLongitude ?? 9.1,
    odometerStartKm: partial.odometerStartKm ?? null,
    odometerEndKm: partial.odometerEndKm ?? null,
    distanceKm: partial.distanceKm ?? 1,
    maxSpeedKmh: partial.maxSpeedKmh ?? 10,
  };
}

function core(ts: string, speed: number, odo: number | null = null) {
  return {
    timestamp: ts,
    isIgnitionOn: true,
    speed,
    travelledDistance: odo,
    fuelAbsoluteLevel: null,
    batteryEnergy: null,
  };
}

describe('trip-start-boundary-admission P1B', () => {
  const envOff = { TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED: 'false' };
  const envOn = { TRIP_START_BOUNDARY_ADMISSION_SHADOW_ENABLED: 'true' };

  it('B1 — shadow gate default OFF', () => {
    expect(isTripStartBoundaryAdmissionShadowEnabled({})).toBe(false);
    expect(isTripStartBoundaryAdmissionShadowEnabled(envOff)).toBe(false);
  });

  it('B2 — Tesla reference offline shadow semantics', () => {
    const seg = segment({
      segmentId: 'dimo-seg-186946-1792121760000',
      startTime: TESLA_PROVIDER,
    });
    const legacy = resolveLegacyConfirmedStartBoundary({
      boundaryWindowFrom: new Date(TESLA_PROVIDER),
      candidateStartAt: TESLA_CANDIDATE,
      confirmedAt: TESLA_CONFIRMED,
      corePoints: [],
      profile: 'EV',
      segments: [seg],
      routePoints: [],
      legacyRouteFetchPerformed: false,
    });
    expect(legacy.legacy.startAt.toISOString()).toBe(TESLA_PROVIDER);

    const shadow = compareStartBoundaryAdmissionShadow({
      candidateStartAt: TESLA_CANDIDATE,
      confirmedAt: TESLA_CONFIRMED,
      segments: [seg],
      corePoints: [],
      routePoints: [],
      profile: 'EV',
      integrationModality: 'SOFTWARE_INTEGRATION',
    });
    expect(shadow.legacyCanonicalStartAt.toISOString()).toBe(TESLA_PROVIDER);
    expect(shadow.proposedCanonicalStartAt).toEqual(TESLA_CANDIDATE);
    expect(shadow.deltaMs).toBe(146989);
    expect(shadow.decision).toBe('PROVIDER_START_UNCORROBORATED');
  });

  it('B3 — shadow runtime failure does not throw', async () => {
    const seg = segment({ startTime: TESLA_PROVIDER });
    const result = await runStartBoundaryAdmissionShadow({
      vehicleId: 'veh-1',
      dimoTokenId: 186946,
      candidateStartAt: TESLA_CANDIDATE,
      confirmedAt: TESLA_CONFIRMED,
      corePoints: [],
      profile: 'EV',
      integrationModality: 'SOFTWARE_INTEGRATION',
      legacy: {
        startAt: new Date(TESLA_PROVIDER),
        source: 'DIMO_SEGMENT',
        dimoSegmentId: seg.segmentId,
      },
      evidence: {
        boundaryWindowFrom: new Date(TESLA_PROVIDER),
        segments: [seg],
        matchingSegment: seg,
        routePoints: [],
        legacyRouteFetchPerformed: false,
      },
      segments: {
        fetchRouteEnrichment: jest.fn().mockRejectedValue(new Error('boom')),
      } as unknown as import('../../../dimo/dimo-segments.service').DimoSegmentsService,
      providerContext: {},
      env: {
        ...envOn,
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_VEHICLE_IDS: 'veh-1',
        TRIP_START_BOUNDARY_ADMISSION_SHADOW_ROUTE_FETCH_ENABLED: 'true',
      },
    });
    expect(result).not.toBeNull();
    expect(result!.shadowExecutionFailure).toBe('boom');
    expect(result!.shadowDecision).toBe('SHADOW_EXECUTION_FAILED');
  });

  it('B4 — no matching segment: legacy refined path unchanged', () => {
    const candidate = new Date('2026-10-16T03:38:00.000Z');
    const confirmed = new Date('2026-10-16T03:39:00.000Z');
    const coreAt = new Date('2026-10-16T03:37:50.000Z');
    const legacy = resolveLegacyConfirmedStartBoundary({
      boundaryWindowFrom: new Date('2026-10-16T03:36:00.000Z'),
      candidateStartAt: candidate,
      confirmedAt: confirmed,
      corePoints: [core(coreAt.toISOString(), 8, 100)],
      profile: 'EV',
      segments: [],
      routePoints: [],
      legacyRouteFetchPerformed: true,
    });
    expect(legacy.legacy.source).not.toBe('DIMO_SEGMENT');
    expect(legacy.legacy.startAt.getTime()).toBeLessThanOrEqual(candidate.getTime());
  });

  it('B5 — route unavailable: shadow NO_DATA not stationary', () => {
    const seg = segment({
      startTime: TESLA_PROVIDER,
      distanceKm: 0,
      maxSpeedKmh: 0,
    });
    const proposed = resolveEvidenceBackedStartBoundary({
      candidateStartAt: TESLA_CANDIDATE,
      confirmedAt: TESLA_CONFIRMED,
      segments: [seg],
      corePoints: [],
      routePoints: [],
      profile: 'EV',
      integrationModality: 'SOFTWARE_INTEGRATION',
    });
    expect(proposed.provenance.movementEvidenceCoverage).toBe('NO_DATA_IN_WINDOW');
  });

  it('B6 — UNKNOWN modality does not blind-admit provider start', () => {
    const seg = segment({ startTime: TESLA_PROVIDER, distanceKm: 5 });
    const proposed = resolveEvidenceBackedStartBoundary({
      candidateStartAt: TESLA_CANDIDATE,
      confirmedAt: TESLA_CONFIRMED,
      segments: [seg],
      corePoints: [],
      routePoints: [],
      profile: 'EV',
      integrationModality: 'UNKNOWN',
    });
    expect(proposed.decision).toBe('PROVIDER_START_UNCORROBORATED');
  });

  it('B7 — slow reverse bounded in shadow; legacy segment wins when matched', () => {
    const provider = new Date('2026-10-16T03:36:00.000Z');
    const candidate = new Date('2026-10-16T03:38:00.000Z');
    const creep = new Date('2026-10-16T03:36:05.000Z');
    const seg = segment({ startTime: provider.toISOString() });
    const legacy = resolveLegacyConfirmedStartBoundary({
      boundaryWindowFrom: provider,
      candidateStartAt: candidate,
      confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
      corePoints: [],
      profile: 'EV',
      segments: [seg],
      routePoints: [],
      legacyRouteFetchPerformed: false,
    });
    expect(legacy.legacy.startAt).toEqual(provider);
    const shadow = compareStartBoundaryAdmissionShadow({
      candidateStartAt: candidate,
      confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
      segments: [seg],
      corePoints: [core(creep.toISOString(), 2, 0)],
      routePoints: [],
      profile: 'EV',
      integrationModality: 'SOFTWARE_INTEGRATION',
    });
    expect(shadow.proposedCanonicalStartAt).toEqual(creep);
    expect(shadow.legacyCanonicalStartAt).toEqual(provider);
  });

  it('B8 — hardware aggregate only: no shadow PROVIDER_START_ADMITTED', () => {
    const seg = segment({
      startTime: TESLA_PROVIDER,
      distanceKm: 2,
      maxSpeedKmh: 40,
    });
    const proposed = resolveEvidenceBackedStartBoundary({
      candidateStartAt: TESLA_CANDIDATE,
      confirmedAt: TESLA_CONFIRMED,
      segments: [seg],
      corePoints: [],
      routePoints: [],
      profile: 'ICE',
      integrationModality: 'HARDWARE_DEVICE',
    });
    expect(proposed.decision).not.toBe('PROVIDER_START_ADMITTED');
  });

  it('B12 — shadow OFF performs no shadow work; route fetch flag off', async () => {
    const fetchRoute = jest.fn();
    const out = await runStartBoundaryAdmissionShadow({
      vehicleId: 'v',
      dimoTokenId: 1,
      candidateStartAt: TESLA_CANDIDATE,
      confirmedAt: TESLA_CONFIRMED,
      corePoints: [],
      profile: 'EV',
      integrationModality: 'UNKNOWN',
      legacy: {
        startAt: new Date(TESLA_PROVIDER),
        source: 'DIMO_SEGMENT',
        dimoSegmentId: 's',
      },
      evidence: {
        boundaryWindowFrom: new Date(TESLA_PROVIDER),
        segments: [],
        matchingSegment: null,
        routePoints: [],
        legacyRouteFetchPerformed: false,
      },
      segments: { fetchRouteEnrichment: fetchRoute } as unknown as import('../../../dimo/dimo-segments.service').DimoSegmentsService,
      providerContext: {},
      env: envOff,
    });
    expect(out).toBeNull();
    expect(fetchRoute).not.toHaveBeenCalled();
    expect(isTripStartBoundaryAdmissionShadowRouteFetchEnabled(envOff)).toBe(false);
  });

  it('legacy effective start identical whether shadow enabled in runtime (canonical writer)', () => {
    const seg = segment({ startTime: TESLA_PROVIDER });
    const legacy = resolveLegacyConfirmedStartBoundary({
      boundaryWindowFrom: new Date(TESLA_PROVIDER),
      candidateStartAt: TESLA_CANDIDATE,
      confirmedAt: TESLA_CONFIRMED,
      corePoints: [],
      profile: 'EV',
      segments: [seg],
      routePoints: [],
      legacyRouteFetchPerformed: false,
    });
    const effectiveStartAt = legacy.legacy.startAt;
    expect(effectiveStartAt.toISOString()).toBe(TESLA_PROVIDER);
    const shadow = compareStartBoundaryAdmissionShadow({
      candidateStartAt: TESLA_CANDIDATE,
      confirmedAt: TESLA_CONFIRMED,
      segments: [seg],
      corePoints: [],
      routePoints: [],
      profile: 'EV',
      integrationModality: 'SOFTWARE_INTEGRATION',
    });
    expect(shadow.proposedCanonicalStartAt).not.toEqual(effectiveStartAt);
    expect(effectiveStartAt.toISOString()).toBe(TESLA_PROVIDER);
  });
});
