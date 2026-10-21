import type {
  DimoTripSegment,
  RoutePoint,
  TripCoreDataPoint,
} from '../../../dimo/dimo-segments.service';
import { resolveLegacySegmentStartBoundary } from './trip-start-boundary-admission.legacy';
import { resolveEvidenceBackedStartBoundary } from './trip-start-boundary-admission.resolver';
import { compareStartBoundaryAdmissionShadow } from './trip-start-boundary-admission.shadow';

const TESLA_CANDIDATE = new Date('2026-10-16T03:38:26.989Z');
const TESLA_CONFIRMED = new Date('2026-10-16T03:39:10.000Z');
const TESLA_PROVIDER_START = '2026-10-16T03:36:00.000Z';
const TESLA_SEGMENT_ID = 'dimo-seg-186946-1792121760000';
const TESLA_DEPARTURE_REVIEW = new Date('2026-10-16T03:37:41.000Z');

function segment(
  partial: Partial<DimoTripSegment> & Pick<DimoTripSegment, 'startTime'>,
): DimoTripSegment {
  return {
    segmentId: partial.segmentId ?? 'seg-test',
    mechanism: partial.mechanism ?? 'changePointDetection',
    startTime: partial.startTime,
    endTime: partial.endTime ?? '2026-10-16T04:00:00.000Z',
    isOngoing: false,
    startedBeforeRange: partial.startedBeforeRange ?? false,
    durationSeconds: partial.durationSeconds ?? 3600,
    startLatitude: 51.0,
    startLongitude: 9.0,
    endLatitude: 51.1,
    endLongitude: 9.1,
    odometerStartKm: partial.odometerStartKm ?? null,
    odometerEndKm: partial.odometerEndKm ?? null,
    distanceKm: partial.distanceKm ?? null,
    maxSpeedKmh: partial.maxSpeedKmh ?? null,
  };
}

function core(
  ts: string,
  speed: number | null,
  odo: number | null = null,
): TripCoreDataPoint {
  return {
    timestamp: ts,
    isIgnitionOn: true,
    speed,
    travelledDistance: odo,
    fuelAbsoluteLevel: null,
    batteryEnergy: null,
  };
}

function route(
  ts: string,
  lat: number,
  lon: number,
  speedKmh: number | null = null,
): RoutePoint {
  return { timestamp: ts, latitude: lat, longitude: lon, speedKmh };
}

describe('trip-start-boundary-admission P1A', () => {
  describe('Phase 1 — legacy defect reproduction (Tesla reference semantics)', () => {
    const teslaSegment = segment({
      segmentId: TESLA_SEGMENT_ID,
      startTime: TESLA_PROVIDER_START,
      startedBeforeRange: false,
    });

    it('legacy DIMO segment path admits provider start without movement corroboration', () => {
      const legacy = resolveLegacySegmentStartBoundary({
        segments: [teslaSegment],
        candidateStartAt: TESLA_CANDIDATE,
        confirmedAt: TESLA_CONFIRMED,
      });

      expect(legacy).not.toBeNull();
      expect(legacy!.startAt.toISOString()).toBe(TESLA_PROVIDER_START);
      expect(legacy!.adjustedMs).toBe(-146989);
    });

    it('new resolver blocks blind provider admission for SOFTWARE_INTEGRATION prefix gap', () => {
      const proposed = resolveEvidenceBackedStartBoundary({
        candidateStartAt: TESLA_CANDIDATE,
        confirmedAt: TESLA_CONFIRMED,
        segments: [teslaSegment],
        corePoints: [],
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
        departureReviewAnchorAt: TESLA_DEPARTURE_REVIEW,
        segmentDetectionMechanismIndependentlyProven: false,
      });

      expect(proposed.decision).toBe('PROVIDER_START_UNCORROBORATED');
      expect(proposed.canonicalStartAt).toEqual(TESLA_CANDIDATE);
      expect(proposed.providerSegmentStartAt!.toISOString()).toBe(
        TESLA_PROVIDER_START,
      );
      expect(proposed.provenance.movementEvidenceCoverage).toBe(
        'NO_DATA_IN_WINDOW',
      );
      expect(proposed.provenance.integrationModality).toBe(
        'SOFTWARE_INTEGRATION',
      );
      expect(
        proposed.provenance.segmentDetectionMechanismIndependentlyProven,
      ).toBe(false);
      expect(proposed.provenance.providerSegmentDetectionMechanism).toBe(
        'changePointDetection',
      );
      expect(proposed.uncertainty.departureReviewAnchorAt).toEqual(
        TESLA_DEPARTURE_REVIEW,
      );

      const shadow = compareStartBoundaryAdmissionShadow({
        candidateStartAt: TESLA_CANDIDATE,
        confirmedAt: TESLA_CONFIRMED,
        segments: [teslaSegment],
        corePoints: [],
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      expect(shadow.deltaMs).toBe(146989);
    });
  });

  describe('Phase 6 — regression matrix', () => {
    it('B — legitimate early start with core movement at provider time', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const candidate = new Date('2026-10-16T03:38:00.000Z');
      const seg = segment({ startTime: provider.toISOString() });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [core('2026-10-16T03:36:00.000Z', 8, 100)],
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      expect(result.decision).toBe('PROVIDER_START_ADMITTED');
      expect(result.canonicalStartAt).toEqual(provider);
      expect(result.provenance.movementEvidenceSources).toEqual(['CORE_SPEED']);
    });

    it('C — slow reverse preserved (2 km/h core, not high-speed threshold cut)', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const creep = new Date('2026-10-16T03:36:04.000Z');
      const candidate = new Date('2026-10-16T03:38:00.000Z');
      const seg = segment({ startTime: provider.toISOString() });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [core(creep.toISOString(), 2, 100)],
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      expect(result.decision).toBe('PROVIDER_START_BOUNDED');
      expect(result.canonicalStartAt).toEqual(creep);
    });

    it('D — GPS gap with odometer progress before candidate', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const odoMove = new Date('2026-10-16T03:36:20.000Z');
      const candidate = new Date('2026-10-16T03:38:00.000Z');
      const seg = segment({ startTime: provider.toISOString() });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [
          core('2026-10-16T03:36:05.000Z', 0, 100),
          core(odoMove.toISOString(), 0, 100.06),
        ],
        routePoints: [],
        profile: 'ICE',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      expect(result.canonicalStartAt).toEqual(odoMove);
      expect(result.provenance.movementEvidenceSources).toEqual([
        'CORE_ODOMETER',
      ]);
      expect(result.decision).toBe('PROVIDER_START_BOUNDED');
    });

    it('E — frequency-only awake samples without movement do not authorize provider start', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const candidate = new Date('2026-10-16T03:38:00.000Z');
      const seg = segment({ startTime: provider.toISOString() });
      const noisy: TripCoreDataPoint[] = [];
      for (let i = 0; i < 20; i++) {
        noisy.push(
          core(new Date(provider.getTime() + i * 1000).toISOString(), 0, 100),
        );
      }
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: noisy,
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      expect(result.decision).toBe('PROVIDER_START_UNCORROBORATED');
      expect(result.provenance.movementEvidenceCoverage).toBe('FREQUENCY_ONLY');
    });

    it('F — delayed FSM candidate but trusted movement before candidate is preserved', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const earlyMove = new Date('2026-10-16T03:36:45.000Z');
      const candidate = new Date('2026-10-16T03:38:26.989Z');
      const seg = segment({ startTime: provider.toISOString() });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [core(earlyMove.toISOString(), 12, 50)],
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      expect(result.canonicalStartAt).toEqual(earlyMove);
      expect(result.decision).toBe('PROVIDER_START_BOUNDED');
    });

    it('G — HARDWARE aggregate distance confirms trip activity but not exact provider start', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const candidate = new Date('2026-10-16T03:38:00.000Z');
      const seg = segment({
        startTime: provider.toISOString(),
        distanceKm: 0.4,
        odometerStartKm: 10,
        odometerEndKm: 10.4,
        maxSpeedKmh: 22,
      });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [],
        routePoints: [],
        profile: 'ICE',
        integrationModality: 'HARDWARE_DEVICE',
      });
      expect(result.decision).not.toBe('PROVIDER_START_ADMITTED');
      expect(result.provenance.segmentAggregateActivitySources).toContain(
        'SEGMENT_DISTANCE',
      );
      expect(result.provenance.movementEvidenceCoverage).toBe(
        'SEGMENT_AGGREGATE_ACTIVITY_ONLY',
      );
    });

    it('G — Tesla SOFTWARE_INTEGRATION does not admit on segment distance alone', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const candidate = new Date('2026-10-16T03:38:00.000Z');
      const seg = segment({
        startTime: provider.toISOString(),
        distanceKm: 0.4,
      });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [],
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      expect(result.decision).toBe('PROVIDER_START_UNCORROBORATED');
    });

    it('H1 — HARDWARE segment distance > 0 without timestamped movement', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const seg = segment({
        startTime: provider.toISOString(),
        distanceKm: 1.2,
      });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: new Date('2026-10-16T03:38:00.000Z'),
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [],
        routePoints: [],
        profile: 'ICE',
        integrationModality: 'HARDWARE_DEVICE',
      });
      expect(result.decision).not.toBe('PROVIDER_START_ADMITTED');
    });

    it('H2 — HARDWARE aggregate maxSpeed only without timestamped movement', () => {
      const seg = segment({
        startTime: '2026-10-16T03:36:00.000Z',
        maxSpeedKmh: 40,
        distanceKm: 0,
      });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: new Date('2026-10-16T03:38:00.000Z'),
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [],
        routePoints: [],
        profile: 'ICE',
        integrationModality: 'HARDWARE_DEVICE',
      });
      expect(result.decision).not.toBe('PROVIDER_START_ADMITTED');
      expect(result.provenance.segmentAggregateActivitySources).toContain(
        'SEGMENT_MAX_SPEED',
      );
    });

    it('H3 — core earlier than route wins earliest boundary', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const candidate = new Date('2026-10-16T03:38:00.000Z');
      const coreAt = new Date('2026-10-16T03:36:10.000Z');
      const routeAt = new Date('2026-10-16T03:36:20.000Z');
      const seg = segment({ startTime: provider.toISOString() });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [core(coreAt.toISOString(), 5, 100)],
        routePoints: [
          route('2026-10-16T03:36:05.000Z', 51.0, 9.0),
          route(routeAt.toISOString(), 51.001, 9.001, 10),
        ],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      expect(result.canonicalStartAt).toEqual(coreAt);
      expect(result.provenance.movementEvidenceSources).toEqual(['CORE_SPEED']);
    });

    it('H4 — route earlier than core wins earliest boundary', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const candidate = new Date('2026-10-16T03:38:00.000Z');
      const routeAt = new Date('2026-10-16T03:36:08.000Z');
      const coreAt = new Date('2026-10-16T03:36:18.000Z');
      const seg = segment({ startTime: provider.toISOString() });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [core(coreAt.toISOString(), 6, 100)],
        routePoints: [
          route('2026-10-16T03:36:05.000Z', 51.0, 9.0),
          route(routeAt.toISOString(), 51.001, 9.001, 12),
        ],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      expect(result.canonicalStartAt).toEqual(routeAt);
      expect(result.provenance.movementEvidenceSources).toEqual(['ROUTE_SPEED']);
    });

    it('H5 — departure review anchor is context only', () => {
      const anchor = new Date('2026-10-16T03:37:41.000Z');
      const candidate = new Date('2026-10-16T03:38:26.989Z');
      const seg = segment({ startTime: TESLA_PROVIDER_START });
      const without = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: TESLA_CONFIRMED,
        segments: [seg],
        corePoints: [],
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
      });
      const withAnchor = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: TESLA_CONFIRMED,
        segments: [seg],
        corePoints: [],
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
        departureReviewAnchorAt: anchor,
      });
      expect(withAnchor.canonicalStartAt).toEqual(without.canonicalStartAt);
      expect(withAnchor.decision).toEqual(without.decision);
      expect(withAnchor.uncertainty.departureReviewAnchorAt).toEqual(anchor);
    });

    it('H6 — integration modality and segment detection mechanism are distinct in provenance', () => {
      const seg = segment({
        startTime: '2026-10-16T03:36:00.000Z',
        mechanism: 'frequencyAnalysis',
      });
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: new Date('2026-10-16T03:38:00.000Z'),
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: [],
        routePoints: [],
        profile: 'EV',
        integrationModality: 'SOFTWARE_INTEGRATION',
        segmentDetectionMechanismIndependentlyProven: false,
      });
      expect(result.provenance.integrationModality).toBe('SOFTWARE_INTEGRATION');
      expect(result.provenance.providerSegmentDetectionMechanism).toBe(
        'frequencyAnalysis',
      );
      expect(
        result.provenance.segmentDetectionMechanismIndependentlyProven,
      ).toBe(false);
    });
  });
});
