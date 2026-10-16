import type { DimoTripSegment, TripCoreDataPoint } from '../../../dimo/dimo-segments.service';
import { resolveLegacySegmentStartBoundary } from './trip-start-boundary-admission.legacy';
import { resolveEvidenceBackedStartBoundary } from './trip-start-boundary-admission.resolver';
import { compareStartBoundaryAdmissionShadow } from './trip-start-boundary-admission.shadow';

const TESLA_CANDIDATE = new Date('2026-10-16T03:38:26.989Z');
const TESLA_CONFIRMED = new Date('2026-10-16T03:39:10.000Z');
const TESLA_PROVIDER_START = '2026-10-16T03:36:00.000Z';
const TESLA_SEGMENT_ID = 'dimo-seg-186946-1792121760000';
const TESLA_DEPARTURE_REVIEW = new Date('2026-10-16T03:37:41.000Z');

function segment(partial: Partial<DimoTripSegment> & Pick<DimoTripSegment, 'startTime'>): DimoTripSegment {
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

function core(ts: string, speed: number | null, odo: number | null = null): TripCoreDataPoint {
  return {
    timestamp: ts,
    isIgnitionOn: true,
    speed,
    travelledDistance: odo,
    fuelAbsoluteLevel: null,
    batteryEnergy: null,
  };
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
        providerMechanism: 'SOFTWARE_INTEGRATION',
        departureReviewWindowStartAt: TESLA_DEPARTURE_REVIEW,
      });

      expect(proposed.decision).toBe('PROVIDER_START_UNCORROBORATED');
      expect(proposed.canonicalStartAt).toEqual(TESLA_CANDIDATE);
      expect(proposed.providerSegmentStartAt!.toISOString()).toBe(TESLA_PROVIDER_START);
      expect(proposed.provenance.movementEvidenceCoverage).toBe('NO_DATA_IN_WINDOW');

      const shadow = compareStartBoundaryAdmissionShadow({
        candidateStartAt: TESLA_CANDIDATE,
        confirmedAt: TESLA_CONFIRMED,
        segments: [teslaSegment],
        corePoints: [],
        routePoints: [],
        profile: 'EV',
        providerMechanism: 'SOFTWARE_INTEGRATION',
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
        providerMechanism: 'SOFTWARE_INTEGRATION',
      });
      expect(result.decision).toBe('PROVIDER_START_ADMITTED');
      expect(result.canonicalStartAt).toEqual(provider);
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
        providerMechanism: 'SOFTWARE_INTEGRATION',
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
        providerMechanism: 'SOFTWARE_INTEGRATION',
      });
      expect(result.canonicalStartAt.getTime()).toBeLessThanOrEqual(odoMove.getTime());
      expect(result.decision).not.toBe('PROVIDER_START_UNCORROBORATED');
    });

    it('E — frequency-only awake samples without movement do not authorize provider start', () => {
      const provider = new Date('2026-10-16T03:36:00.000Z');
      const candidate = new Date('2026-10-16T03:38:00.000Z');
      const seg = segment({ startTime: provider.toISOString() });
      const noisy: TripCoreDataPoint[] = [];
      for (let i = 0; i < 20; i++) {
        noisy.push(
          core(
            new Date(provider.getTime() + i * 1000).toISOString(),
            0,
            100,
          ),
        );
      }
      const result = resolveEvidenceBackedStartBoundary({
        candidateStartAt: candidate,
        confirmedAt: new Date('2026-10-16T03:39:00.000Z'),
        segments: [seg],
        corePoints: noisy,
        routePoints: [],
        profile: 'EV',
        providerMechanism: 'SOFTWARE_INTEGRATION',
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
        providerMechanism: 'SOFTWARE_INTEGRATION',
      });
      expect(result.canonicalStartAt).toEqual(earlyMove);
      expect(result.decision).toBe('PROVIDER_START_BOUNDED');
    });

    it('G — Ruptela HARDWARE_DEVICE may admit provider start via segment distance', () => {
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
        providerMechanism: 'HARDWARE_DEVICE',
      });
      expect(result.decision).toBe('PROVIDER_START_ADMITTED');
      expect(result.canonicalStartAt).toEqual(provider);
    });

    it('G — Tesla SOFTWARE_INTEGRATION does not inherit HARDWARE segment-distance rule', () => {
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
        providerMechanism: 'SOFTWARE_INTEGRATION',
      });
      expect(result.decision).toBe('PROVIDER_START_UNCORROBORATED');
    });
  });
});
