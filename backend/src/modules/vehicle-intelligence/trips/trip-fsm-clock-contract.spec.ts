import {
  classifyStopBoundarySourceClockAuthority,
  clearPossibleEndClockFields,
  clearPossibleStartClockFields,
  isPossibleEndRecoveryEligible,
  isTrustedStopBoundaryAuthority,
  isValidProviderEventTimestamp,
  resolveOperationalNoCoreInactivityAnchor,
  reconcilePossibleEndClockColumns,
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
  resolveLatestOdometerAdvanceEventAt,
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

    it('legacy null possibleStartEnteredAt prefers possibleStartAt over updatedAt', () => {
      const legacy = {
        possibleStartAt: T0,
        possibleStartEnteredAt: null,
        updatedAt: T0_PLUS_10M,
      };
      expect(resolvePossibleStartConfirmationAnchor(legacy, T0_PLUS_10M_5S)).toEqual(
        T0,
      );
    });

    it('legacy confirmation age ignores worker-lock refreshed updatedAt', () => {
      const legacy = {
        possibleStartAt: T0,
        possibleStartEnteredAt: null,
        updatedAt: T0_PLUS_10M,
      };
      const elapsed =
        T0_PLUS_10M.getTime() -
        resolvePossibleStartConfirmationAnchor(legacy, T0_PLUS_10M).getTime();
      expect(elapsed).toBe(10 * 60_000);
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

    it('legacy PE dwell prefers possibleEndAt over lock-mutated updatedAt', () => {
      const T0_31m = new Date(T0.getTime() + 31 * 60_000);
      const legacy = {
        possibleEndAt: T0,
        possibleEndEnteredAt: null,
        updatedAt: T0_31m,
      };
      expect(resolvePossibleEndFsmDwellAnchor(legacy, T0_31m)).toEqual(T0);
    });

    it('R12: modern PE dwell uses evidence possibleEndEnteredAt before updatedAt', () => {
      const workerNow = new Date('2026-09-10T20:35:00.000Z');
      const enteredAt = new Date('2026-09-10T20:04:37.793Z');
      const det = {
        possibleEndAt: new Date('2026-09-10T20:01:15.000Z'),
        possibleEndEnteredAt: null,
        updatedAt: workerNow,
        lastEvidenceSummary: {
          stopBoundaryAt: '2026-09-10T20:01:15.000Z',
          stopBoundaryTrust: true,
          possibleEndEnteredAt: enteredAt.toISOString(),
        },
      };
      expect(resolvePossibleEndFsmDwellAnchor(det, workerNow)).toEqual(enteredAt);
      expect(
        workerNow.getTime() - resolvePossibleEndFsmDwellAnchor(det, workerNow).getTime(),
      ).toBeGreaterThanOrEqual(30 * 60_000);
    });

    it('R12: boundary anchor falls back to trusted stopBoundaryAt in evidence', () => {
      const workerNow = new Date('2026-09-10T20:20:00.000Z');
      const stopBoundary = new Date('2026-09-10T20:01:15.000Z');
      expect(
        resolvePossibleEndBoundaryAnchor(
          {
            possibleEndAt: null,
            lastEvidenceSummary: {
              stopBoundaryAt: stopBoundary.toISOString(),
              stopBoundaryTrust: true,
              stopBoundarySource: 'provider_stationary_vls',
            },
          },
          workerNow,
        ),
      ).toEqual(stopBoundary);
    });

    it('R12: dwell anchor may use endValidationScheduledAt but not as episode token', () => {
      const workerNow = new Date('2026-09-10T20:35:00.000Z');
      const scheduledAt = new Date('2026-09-10T20:16:37.000Z');
      const det = {
        possibleEndAt: new Date('2026-09-10T20:01:15.000Z'),
        possibleEndEnteredAt: null,
        updatedAt: workerNow,
        lastEvidenceSummary: {
          endValidationScheduledAt: scheduledAt.toISOString(),
        },
      };
      expect(resolvePossibleEndFsmDwellAnchor(det, workerNow)).toEqual(scheduledAt);
    });

    it('reconcilePossibleEndClockColumns restores durable anchors for POSSIBLE_END', () => {
      const enteredAt = new Date('2026-09-10T20:04:37.793Z');
      const stopBoundary = new Date('2026-09-10T20:01:15.000Z');
      expect(
        reconcilePossibleEndClockColumns({
          state: 'POSSIBLE_END',
          possibleEndAt: null,
          possibleEndEnteredAt: null,
          lastEvidenceSummary: {
            stopBoundaryAt: stopBoundary.toISOString(),
            stopBoundaryTrust: true,
            stopBoundarySource: 'provider_stationary_vls',
            possibleEndEnteredAt: enteredAt.toISOString(),
          },
          workerNow: new Date('2026-09-10T20:20:00.000Z'),
        }),
      ).toEqual({
        possibleEndAt: stopBoundary,
        possibleEndEnteredAt: enteredAt,
      });
    });

    it('legacy POSSIBLE_END recovery eligible when dwell age exceeds 30 min', () => {
      const T0_31m = new Date(T0.getTime() + 31 * 60_000);
      expect(
        isPossibleEndRecoveryEligible(
          {
            possibleEndAt: T0,
            possibleEndEnteredAt: null,
            updatedAt: T0_31m,
            activeTripId: 'trip-1',
          },
          T0_31m,
          30 * 60_000,
        ),
      ).toBe(true);
    });
  });

  describe('operational no-core inactivity gate', () => {
    const T0_PLUS_5M = new Date(T0.getTime() + 5 * 60_000);
    const T0_PLUS_5M_30S = new Date(T0.getTime() + 5 * 60_000 + 30_000);
    const T0_PLUS_7M = new Date(T0.getTime() + 7 * 60_000);
    const NO_CORE_THRESHOLD_MS = 120_000;

    it('uses lastActivityAt before historical possibleStartAt', () => {
      const operationalAnchor = resolveOperationalNoCoreInactivityAnchor({
        lastMeaningfulMovementAt: null,
        lastActivityAt: T0_PLUS_10M,
        possibleStartAt: T0,
        workerNow: T0_PLUS_10M_5S,
      });
      expect(operationalAnchor).toEqual(T0_PLUS_10M);
      const inactiveMs = T0_PLUS_10M_5S.getTime() - operationalAnchor.getTime();
      expect(inactiveMs).toBe(5_000);
      expect(inactiveMs).toBeLessThan(NO_CORE_THRESHOLD_MS);
    });

    it('R1B: delayed provider observation does not inflate operational inactivity from event time', () => {
      const operationalAnchor = resolveOperationalNoCoreInactivityAnchor({
        lastMeaningfulMovementAt: T0,
        lastActivityAt: T0_PLUS_5M,
        possibleStartAt: T0,
        workerNow: T0_PLUS_5M_30S,
      });
      expect(operationalAnchor).toEqual(T0_PLUS_5M);
      const inactiveMs = T0_PLUS_5M_30S.getTime() - operationalAnchor.getTime();
      expect(inactiveMs).toBe(30_000);
      expect(inactiveMs).toBeLessThan(NO_CORE_THRESHOLD_MS);
    });

    it('R1B: qualifies after 120s operational inactivity from last worker activity', () => {
      const operationalAnchor = resolveOperationalNoCoreInactivityAnchor({
        lastMeaningfulMovementAt: T0,
        lastActivityAt: T0_PLUS_5M,
        possibleStartAt: T0,
        workerNow: T0_PLUS_7M,
      });
      expect(operationalAnchor).toEqual(T0_PLUS_5M);
      const inactiveMs = T0_PLUS_7M.getTime() - operationalAnchor.getTime();
      expect(inactiveMs).toBe(2 * 60_000);
      expect(inactiveMs).toBeGreaterThanOrEqual(NO_CORE_THRESHOLD_MS);
    });

    it('R1B: falls back to lastMeaningfulMovementAt when lastActivityAt is null', () => {
      const operationalAnchor = resolveOperationalNoCoreInactivityAnchor({
        lastMeaningfulMovementAt: T0,
        lastActivityAt: null,
        possibleStartAt: T0,
        workerNow: T0_PLUS_10M,
      });
      expect(operationalAnchor).toEqual(T0);
    });

    it('R1B: operational gate and physical boundary remain distinct', () => {
      const workerNow = T0_PLUS_5M_30S;
      const operationalAnchor = resolveOperationalNoCoreInactivityAnchor({
        lastMeaningfulMovementAt: T0,
        lastActivityAt: T0_PLUS_5M,
        possibleStartAt: T0,
        workerNow,
      });
      expect(operationalAnchor).toEqual(T0_PLUS_5M);

      const boundary = resolvePossibleEndBoundaryCandidate({
        lastMeaningfulMovementAt: T0,
        lastActivityAt: T0_PLUS_5M,
        workerNow,
      });
      expect(boundary.boundaryAt).toEqual(T0);
      expect(boundary.clockSource).toBe('PROVIDER_EVENT_TIME');
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

    it('odometer-only ACTIVE advances event-time at actual progression', () => {
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

    it('odometer plateau uses last advance timestamp not trailing repeat', () => {
      const workerNow = new Date('2026-09-06T12:00:00.000Z');
      const mk = (iso: string, odo: number): TripCoreDataPoint => ({
        timestamp: iso,
        isIgnitionOn: false,
        speed: 0,
        travelledDistance: odo,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      });
      const advanceAt = '2026-09-06T11:59:40.000Z';
      const points = [
        mk('2026-09-06T11:59:00.000Z', 1000.0),
        mk(advanceAt, 1000.2),
        mk('2026-09-06T11:59:50.000Z', 1000.2),
        mk('2026-09-06T12:00:00.000Z', 1000.2),
      ];
      expect(
        resolveLatestOdometerAdvanceEventAt(points, workerNow)?.toISOString(),
      ).toBe(advanceAt);
      expect(
        resolveLatestMeaningfulMovementEventAt({
          recentPoints: points,
          profile: 'ICE',
          continuitySummary: { odometerDelta: 0.2 },
          workerNow,
        })?.toISOString(),
      ).toBe(advanceAt);
    });

    it('multiple odometer increments pick latest advance', () => {
      const workerNow = new Date('2026-09-06T12:00:00.000Z');
      const mk = (iso: string, odo: number): TripCoreDataPoint => ({
        timestamp: iso,
        isIgnitionOn: false,
        speed: 0,
        travelledDistance: odo,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      });
      const points = [
        mk('2026-09-06T11:58:00.000Z', 1000),
        mk('2026-09-06T11:59:00.000Z', 1000.2),
        mk('2026-09-06T11:59:30.000Z', 1000.35),
      ];
      expect(
        resolveLatestOdometerAdvanceEventAt(points, workerNow)?.toISOString(),
      ).toBe('2026-09-06T11:59:30.000Z');
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

  describe('core timestamp safety', () => {
    const workerNow = new Date('2026-09-06T12:00:00.000Z');

    const motionPoint = (
      iso: string,
      speed: number,
    ): TripCoreDataPoint => ({
      timestamp: iso,
      isIgnitionOn: true,
      speed,
      travelledDistance: null,
      fuelAbsoluteLevel: null,
      batteryEnergy: null,
    });

    it('rejects future-dated core movement beyond allowed skew', () => {
      const futureIso = new Date(
        workerNow.getTime() + TRIP_FSM_MAX_FUTURE_SKEW_MS + 5_000,
      ).toISOString();
      expect(
        resolveLatestMeaningfulMovementEventAt({
          recentPoints: [motionPoint(futureIso, 40)],
          profile: 'ICE',
          continuitySummary: { motionCount: 1 },
          workerNow,
        }),
      ).toBeNull();
    });

    it('accepts core movement within configured future skew', () => {
      const nearFutureIso = new Date(
        workerNow.getTime() + TRIP_FSM_MAX_FUTURE_SKEW_MS - 1_000,
      ).toISOString();
      expect(
        resolveLatestMeaningfulMovementEventAt({
          recentPoints: [motionPoint(nearFutureIso, 40)],
          profile: 'ICE',
          continuitySummary: { motionCount: 1 },
          workerNow,
        })?.toISOString(),
      ).toBe(nearFutureIso);
    });

    it('out-of-order core points resolve to latest valid motion timestamp', () => {
      const earlier = '2026-09-06T11:58:00.000Z';
      const later = '2026-09-06T11:59:00.000Z';
      expect(
        resolveLatestMeaningfulMovementEventAt({
          recentPoints: [
            motionPoint(later, 40),
            motionPoint(earlier, 30),
          ],
          profile: 'ICE',
          continuitySummary: { motionCount: 2 },
          workerNow,
        })?.toISOString(),
      ).toBe(later);
    });

    it('duplicate timestamps stay deterministic without fabricating later time', () => {
      const ts = '2026-09-06T11:00:00.000Z';
      expect(
        resolveLatestMeaningfulMovementEventAt({
          recentPoints: [motionPoint(ts, 35), motionPoint(ts, 42)],
          profile: 'ICE',
          continuitySummary: { motionCount: 2 },
          workerNow,
        })?.toISOString(),
      ).toBe(ts);
    });
  });

  describe('R12 trusted boundary recovery fail-closed', () => {
    const workerNow = new Date('2026-09-10T20:20:00.000Z');
    const stopBoundary = new Date('2026-09-10T20:01:15.000Z');

    it('trusted=true with provider authority → boundary recovered', () => {
      expect(
        reconcilePossibleEndClockColumns({
          state: 'POSSIBLE_END',
          possibleEndAt: null,
          possibleEndEnteredAt: null,
          lastEvidenceSummary: {
            stopBoundaryAt: stopBoundary.toISOString(),
            stopBoundaryTrust: true,
            stopBoundarySource: 'provider_stationary_vls',
          },
          workerNow,
        }),
      ).toEqual({ possibleEndAt: stopBoundary });
    });

    it('trusted=false → rejected (no possibleEndAt patch)', () => {
      expect(
        reconcilePossibleEndClockColumns({
          state: 'POSSIBLE_END',
          possibleEndAt: null,
          lastEvidenceSummary: {
            stopBoundaryAt: stopBoundary.toISOString(),
            stopBoundaryTrust: false,
            stopBoundarySource: 'provider_stationary_vls',
          },
          workerNow,
        }),
      ).toBeNull();
    });

    it('trust missing on trusted provider source → inferred via canonical provenance', () => {
      expect(
        reconcilePossibleEndClockColumns({
          state: 'POSSIBLE_END',
          possibleEndAt: null,
          lastEvidenceSummary: {
            stopBoundaryAt: stopBoundary.toISOString(),
            stopBoundarySource: 'provider_stationary_vls',
          },
          workerNow,
        }),
      ).toEqual({ possibleEndAt: stopBoundary });
    });

    it('trust missing on untrusted worker-time source → rejected', () => {
      expect(
        reconcilePossibleEndClockColumns({
          state: 'POSSIBLE_END',
          possibleEndAt: null,
          lastEvidenceSummary: {
            stopBoundaryAt: stopBoundary.toISOString(),
            stopBoundarySource: 'idle_within_trip_worker_now',
          },
          workerNow,
        }),
      ).toBeNull();
    });

    it('malformed trust → rejected', () => {
      expect(
        reconcilePossibleEndClockColumns({
          state: 'POSSIBLE_END',
          possibleEndAt: null,
          lastEvidenceSummary: {
            stopBoundaryAt: stopBoundary.toISOString(),
            stopBoundaryTrust: 'yes',
            stopBoundarySource: 'provider_stationary_vls',
          },
          workerNow,
        }),
      ).toBeNull();
    });

    it('future/invalid timestamp → rejected', () => {
      const future = new Date(workerNow.getTime() + TRIP_FSM_MAX_FUTURE_SKEW_MS + 60_000);
      expect(
        reconcilePossibleEndClockColumns({
          state: 'POSSIBLE_END',
          possibleEndAt: null,
          lastEvidenceSummary: {
            stopBoundaryAt: future.toISOString(),
            stopBoundaryTrust: true,
            stopBoundarySource: 'provider_stationary_vls',
          },
          workerNow,
        }),
      ).toBeNull();
    });

    it('untrusted stale boundary does not become authoritative anchor', () => {
      expect(
        resolvePossibleEndBoundaryAnchor(
          {
            possibleEndAt: null,
            lastEvidenceSummary: {
              stopBoundaryAt: stopBoundary.toISOString(),
              stopBoundaryTrust: false,
              stopBoundarySource: 'stale_snapshot',
            },
          },
          workerNow,
        ),
      ).toEqual(workerNow);
    });
  });

  describe('R12 stop boundary source authority', () => {
    it('deny-by-default: unknown stopBoundarySource is WORKER_TIME (untrusted)', () => {
      expect(classifyStopBoundarySourceClockAuthority('legacy_unspecified')).toBe(
        'WORKER_TIME',
      );
      expect(classifyStopBoundarySourceClockAuthority('stale_snapshot')).toBe('WORKER_TIME');
      expect(
        isTrustedStopBoundaryAuthority(
          classifyStopBoundarySourceClockAuthority('made_up_provider_vls'),
        ),
      ).toBe(false);
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
