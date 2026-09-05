import {
  clearPossibleEndClockFields,
  clearPossibleStartClockFields,
  isValidProviderEventTimestamp,
  resolvePossibleEndBoundaryAnchor,
  resolvePossibleEndBoundaryCandidate,
  resolvePossibleEndFsmDwellAnchor,
  resolvePossibleStartConfirmationAnchor,
  resolveStartCandidateClock,
  TRIP_FSM_MAX_FUTURE_SKEW_MS,
} from './trip-fsm-clock-contract';
import {
  assessActiveContinuity,
  continuityImpliesMeaningfulMovement,
  resolveLatestMeaningfulMovementEventAt,
} from './trip-evidence.helpers';
import type { TripCoreDataPoint } from '../../dimo/dimo-segments.service';

const T0 = new Date('2026-09-06T10:00:00.000Z');
const T0_PLUS_10M = new Date('2026-09-06T10:10:00.000Z');
const T0_PLUS_10M_5S = new Date('2026-09-06T10:10:05.000Z');

function makeTs(secondsAgo: number): string {
  return new Date(Date.now() - secondsAgo * 1000).toISOString();
}

function ptAgo(secondsAgo: number, speed: number | null, odometer?: number): TripCoreDataPoint {
  return {
    timestamp: makeTs(secondsAgo),
    isIgnitionOn: speed != null && speed > 0,
    speed,
    travelledDistance: odometer ?? null,
    fuelAbsoluteLevel: null,
    batteryEnergy: null,
  };
}

describe('R1 — trip FSM clock contract', () => {
  describe('provider timestamp validation', () => {
    it('accepts valid provider timestamps', () => {
      expect(isValidProviderEventTimestamp(T0, T0_PLUS_10M)).toBe(true);
    });

    it('rejects future-dated snapshot timestamps beyond skew', () => {
      const workerNow = T0;
      const future = new Date(workerNow.getTime() + TRIP_FSM_MAX_FUTURE_SKEW_MS + 1);
      expect(isValidProviderEventTimestamp(future, workerNow)).toBe(false);
    });

    it('rejects invalid dates', () => {
      expect(isValidProviderEventTimestamp(new Date('invalid'), T0)).toBe(false);
    });
  });

  describe('POSSIBLE_START clock split', () => {
    it('uses provider event time for possibleStartAt when source timestamp is valid', () => {
      const clock = resolveStartCandidateClock({
        providerSourceTimestamp: T0,
        workerNow: T0_PLUS_10M,
      });
      expect(clock.candidateEventAt).toEqual(T0);
      expect(clock.enteredAt).toEqual(T0_PLUS_10M);
      expect(clock.clockSource).toBe('PROVIDER_EVENT_TIME');
    });

    it('classifies worker fallback when source timestamp is missing', () => {
      const clock = resolveStartCandidateClock({
        providerSourceTimestamp: null,
        workerNow: T0_PLUS_10M,
      });
      expect(clock.candidateEventAt).toEqual(T0_PLUS_10M);
      expect(clock.clockSource).toBe('WORKER_FALLBACK');
    });

    it('delayed snapshot does not instantly expire POSSIBLE_START confirmation', () => {
      const det = {
        possibleStartAt: T0,
        possibleStartEnteredAt: T0_PLUS_10M,
        updatedAt: T0_PLUS_10M,
      };
      const elapsed =
        T0_PLUS_10M_5S.getTime() -
        resolvePossibleStartConfirmationAnchor(det, T0_PLUS_10M_5S).getTime();
      expect(elapsed).toBeLessThan(180_000);
      expect(det.possibleStartAt).toEqual(T0);
    });

    it('legacy null possibleStartEnteredAt falls back deterministically', () => {
      const legacy = {
        possibleStartAt: T0,
        possibleStartEnteredAt: null,
        updatedAt: T0_PLUS_10M,
      };
      expect(resolvePossibleStartConfirmationAnchor(legacy, T0_PLUS_10M_5S)).toEqual(
        T0_PLUS_10M,
      );
    });
  });

  describe('POSSIBLE_END clock split', () => {
    it('stores separate boundary and FSM entry anchors', () => {
      const boundary = resolvePossibleEndBoundaryCandidate({
        lastMeaningfulMovementAt: T0,
        lastActivityAt: T0_PLUS_10M,
        workerNow: T0_PLUS_10M,
      });
      expect(boundary.boundaryAt).toEqual(T0);
      expect(boundary.clockSource).toBe('PROVIDER_EVENT_TIME');

      const dwell = resolvePossibleEndFsmDwellAnchor(
        {
          possibleEndAt: T0,
          possibleEndEnteredAt: T0_PLUS_10M,
        },
        T0_PLUS_10M_5S,
      );
      expect(dwell).toEqual(T0_PLUS_10M);
      expect(resolvePossibleEndBoundaryAnchor({ possibleEndAt: T0 }, T0_PLUS_10M_5S)).toEqual(
        T0,
      );
    });

    it('PE stability uses possibleEndEnteredAt not backdated boundary', () => {
      const backdatedEnd = new Date('2026-09-06T09:00:00.000Z');
      const enteredAt = T0;
      const now = new Date(T0.getTime() + 15_000);
      const fsmDwellMs =
        now.getTime() -
        resolvePossibleEndFsmDwellAnchor(
          { possibleEndAt: backdatedEnd, possibleEndEnteredAt: enteredAt },
          now,
        ).getTime();
      expect(fsmDwellMs).toBe(15_000);
    });

    it('tags worker fallback when only lastActivityAt is available', () => {
      const boundary = resolvePossibleEndBoundaryCandidate({
        lastMeaningfulMovementAt: null,
        lastActivityAt: T0_PLUS_10M,
        workerNow: T0_PLUS_10M,
      });
      expect(boundary.clockSource).toBe('WORKER_FALLBACK');
    });

    it('resume/RESTING reset helpers clear entered-at fields', () => {
      expect(clearPossibleEndClockFields()).toEqual({
        possibleEndAt: null,
        possibleEndEnteredAt: null,
      });
      expect(clearPossibleStartClockFields()).toEqual({
        possibleStartAt: null,
        possibleStartEnteredAt: null,
      });
    });
  });

  describe('lastMeaningfulMovementAt event-time propagation', () => {
    it('writes provider core point timestamp instead of worker now', () => {
      const workerNow = new Date();
      const points = [ptAgo(30, 0, 1000), ptAgo(10, 42, 1000.2)];
      const at = resolveLatestMeaningfulMovementEventAt({
        recentPoints: points,
        profile: 'ICE',
        continuitySummary: { motionCount: 1, odometerDelta: 0.2 },
        workerNow,
      });
      expect(at?.toISOString()).toBe(points[1].timestamp);
    });

    it('odometer-only ACTIVE advances event-time movement anchor', () => {
      const workerNow = new Date();
      const points = [ptAgo(30, 0, 5000), ptAgo(10, 0, 5000.15)];
      const continuity = assessActiveContinuity(points, false, 'ICE');
      expect(continuity.verdict).toBe('ACTIVE');
      expect(continuityImpliesMeaningfulMovement(continuity.summary)).toBe(true);
      const at = resolveLatestMeaningfulMovementEventAt({
        recentPoints: points,
        profile: 'ICE',
        continuitySummary: continuity.summary as Record<string, unknown>,
        workerNow,
      });
      expect(at?.toISOString()).toBe(points[1].timestamp);
    });

    it('IDLE does not imply meaningful movement', () => {
      const points = [ptAgo(80, 0, 1000), ptAgo(20, 0, 1000)];
      const continuity = assessActiveContinuity(points, true, 'ICE');
      expect(continuity.verdict).toBe('IDLE');
      expect(
        resolveLatestMeaningfulMovementEventAt({
          recentPoints: points,
          profile: 'ICE',
          continuitySummary: continuity.summary as Record<string, unknown>,
        }),
      ).toBeNull();
    });

    it('CH-only guard does not invent worker-time physical movement without event timestamp', () => {
      expect(
        resolveLatestMeaningfulMovementEventAt({
          recentPoints: [],
          profile: 'EV',
          continuitySummary: {},
          clickhouseGuardSummary: {
            maxSpeedKmh: 42,
            odometerDeltaKm: 0.2,
          },
        }),
      ).toBeNull();
    });
  });

  describe('profile regressions — continuity unchanged, movement timestamps only', () => {
    const profiles = ['ICE', 'EV', 'HYBRID', 'UNKNOWN'] as const;

    it.each(profiles)('%s: motion ACTIVE resolves latest point timestamp', (profile) => {
      const workerNow = new Date();
      const points = [ptAgo(50, 0, 100), ptAgo(25, 35, 100.4)];
      const continuity = assessActiveContinuity(points, false, profile);
      expect(continuity.verdict).toBe('ACTIVE');
      const at = resolveLatestMeaningfulMovementEventAt({
        recentPoints: points,
        profile,
        continuitySummary: continuity.summary as Record<string, unknown>,
        workerNow,
      });
      expect(at?.toISOString()).toBe(points[1].timestamp);
    });
  });
});
