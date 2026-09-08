import { TRIP_FSM_MAX_FUTURE_SKEW_MS } from './trip-fsm-clock-contract';
import {
  assessSuccessfulEmptyCoreEndEligibility,
  classifyEmptyCoreVlsInactivity,
} from './trip-empty-core-end-gate';
import {
  assessActiveContinuity,
  filterCorePointsAfterBoundary,
  hasActivityResumed,
} from './trip-evidence.helpers';
import {
  isPauseCorroborated,
  mergeStopBoundaryAt,
  readStopBoundaryAt,
  resolveProviderOperationalAnchor,
} from './trip-fsm-evidence-state';
import { computeEmptyCoreBackoffMs } from './trip-empty-core-backoff';
import { classifyFetchError } from './trip-fetch-outcome';

const MIN_INACTIVITY = 120_000;

describe('TDL-DEC-R11-001 base implementation', () => {
  describe('A — 60s pause with fresh signals then resume', () => {
    const motorOff = new Date('2026-09-08T20:01:00.000Z');
    const lastMove = new Date('2026-09-08T20:00:55.000Z');
    const workerPause = new Date('2026-09-08T20:02:00.000Z');

    it('detects pause corroboration without end candidacy', () => {
      expect(
        isPauseCorroborated({
          telemetry: {
            isIgnitionOn: false,
            speedKmh: 0,
            engineLoad: 0,
            sourceTimestamp: motorOff,
          },
          workerNow: workerPause,
          maxObservationAgeMs: MIN_INACTIVITY,
          operationalInactiveMs: 65_000,
          minEndInactivityMs: MIN_INACTIVITY,
        }),
      ).toBe(true);

      const gate = assessSuccessfulEmptyCoreEndEligibility({
        operationalInactiveMs: 65_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: motorOff,
        },
        perfReadings: [],
        routePoints: [],
        profile: 'ICE',
        workerNow: workerPause,
        stopBoundaryAt: motorOff,
      });
      expect(gate.eligible).toBe(false);
      expect(gate.forensics.innerGateReason).toBe(
        'operational_inactivity_below_threshold',
      );
    });

    it('resumes on post-boundary core motion', () => {
      const boundary = motorOff;
      const points = [
        { timestamp: '2026-09-08T20:01:30.000Z', speed: 25, odometer: 1 },
      ];
      expect(hasActivityResumed(points as any, 'ICE', boundary)).toBe(true);
      const continuity = assessActiveContinuity(
        [
          { timestamp: '2026-09-08T20:01:30.000Z', speed: 25 },
        ] as any,
        false,
        'ICE',
        boundary,
      );
      expect(continuity.verdict).toBe('ACTIVE');
    });
  });

  describe('B — KS MS 661-like 136s pause (SYNTHETIC)', () => {
    const workerNow = new Date('2026-09-08T19:54:30.000Z');
    const anchor = new Date('2026-09-08T19:54:21.115Z');
    const stopBoundary = new Date('2026-09-08T19:53:22.000Z');

    it('stale speed before stop boundary does not block via ACTIVE', () => {
      const vls = classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 10,
          engineLoad: null,
          sourceTimestamp: new Date('2026-09-08T19:53:20.000Z'),
        },
        profile: 'ICE',
        workerNow,
        maxObservationAgeMs: MIN_INACTIVITY,
        stopBoundaryAt: stopBoundary,
      });
      expect(vls.state).toBe('INACTIVE');
      expect(vls.reason).toBe('vls_stale_speed_before_stop_boundary');
    });

    it('provider anchor avoids worker-time shrink', () => {
      const { anchorAt, anchorSource } = resolveProviderOperationalAnchor({
        lastEvidenceSummary: { lastProviderActivityAt: anchor.toISOString() },
        lastMeaningfulMovementAt: new Date('2026-09-08T19:47:00.000Z'),
        lastActivityAt: new Date('2026-09-08T19:54:38.000Z'),
        possibleStartAt: null,
        workerNow,
      });
      expect(anchorAt.toISOString()).toBe(anchor.toISOString());
      expect(anchorSource).toBe('lastProviderActivityAt');
    });
  });

  describe('D/E — identical null VLS: standing vs moving', () => {
    const workerNow = new Date('2026-09-08T20:05:00.000Z');
    const anchor = new Date('2026-09-08T19:59:55.895Z');

    it('standing vehicle with null VLS stays open', () => {
      const gate = assessSuccessfulEmptyCoreEndEligibility({
        operationalInactiveMs: 304_105,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: null,
        perfReadings: [],
        routePoints: [],
        profile: 'ICE',
        workerNow,
        stopBoundaryAt: anchor,
      });
      expect(gate.eligible).toBe(false);
      expect(gate.forensics.innerGateReason).toBe('vls_row_absent');
    });

    it('moving vehicle advances provider anchor on new core motion', () => {
      const resumeAt = new Date('2026-09-08T20:04:30.000Z');
      const { anchorAt } = resolveProviderOperationalAnchor({
        lastEvidenceSummary: mergeStopBoundaryAt(
          {},
          anchor,
          'idle_within_trip',
        ),
        lastMeaningfulMovementAt: anchor,
        lastActivityAt: anchor,
        possibleStartAt: null,
        workerNow,
      });
      expect(anchorAt.getTime()).toBeLessThan(resumeAt.getTime());
      expect(
        hasActivityResumed(
          [{ timestamp: resumeAt.toISOString(), speed: 20 }] as any,
          'ICE',
          readStopBoundaryAt(mergeStopBoundaryAt({}, anchor, 'test')),
        ),
      ).toBe(true);
    });
  });

  describe('F — motor running at standstill', () => {
    it('fresh engine load at speed 0 is UNKNOWN not end proof', () => {
      expect(
        classifyEmptyCoreVlsInactivity({
          telemetry: {
            isIgnitionOn: false,
            speedKmh: 0,
            engineLoad: 42,
            sourceTimestamp: new Date('2026-09-08T20:00:00.000Z'),
          },
          profile: 'ICE',
          workerNow: new Date('2026-09-08T20:00:26.000Z'),
          maxObservationAgeMs: MIN_INACTIVITY,
        }).reason,
      ).toBe('vls_motor_activity_at_standstill');
    });
  });

  describe('G — stale engine load at stop boundary (KS MS 661 post-IDLE)', () => {
    it('allows end path when obs predates stop boundary (stop corroboration)', () => {
      const stopBoundary = new Date('2026-09-08T19:59:55.895Z');
      const workerNow = new Date('2026-09-08T20:02:00.000Z');
      const gate = assessSuccessfulEmptyCoreEndEligibility({
        operationalInactiveMs: workerNow.getTime() - stopBoundary.getTime(),
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 42.745,
          sourceTimestamp: new Date('2026-09-08T19:59:22.000Z'),
        },
        perfReadings: [],
        routePoints: [],
        profile: 'ICE',
        workerNow,
        stopBoundaryAt: stopBoundary,
      });
      expect(gate.eligible).toBe(true);
      expect(gate.forensics.innerGateReason).toBe(
        'empty_core_corroborated_inactivity',
      );
    });

    it('DOCUMENTED_LIMITATION: absent VLS after prolonged gap stays UNKNOWN', () => {
      const gate = assessSuccessfulEmptyCoreEndEligibility({
        operationalInactiveMs: 304_105,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: null,
        perfReadings: [],
        routePoints: [],
        profile: 'ICE',
        workerNow: new Date('2026-09-08T20:05:00.000Z'),
        stopBoundaryAt: new Date('2026-09-08T19:59:55.895Z'),
      });
      expect(gate.eligible).toBe(false);
      expect(gate.forensics.innerGateReason).toBe('vls_row_absent');
    });
  });

  describe('H — fetch error taxonomy', () => {
    it('classifies permission errors separately from empty success', () => {
      expect(classifyFetchError(new Error('HTTP 403 Forbidden'))).toBe(
        'PERMISSION',
      );
      expect(classifyFetchError(new Error('ETIMEDOUT'))).toBe('TIMEOUT');
    });
  });

  describe('I — backoff scheduling', () => {
    it('bounded exponential backoff with cap (unit)', () => {
      expect(
        computeEmptyCoreBackoffMs({
          baseIntervalMs: 30_000,
          consecutiveDeferrals: 4,
          backoffBaseMs: 30_000,
          backoffMaxMs: 600_000,
          jitterRatio: 0,
        }),
      ).toBe(240_000);
    });
  });

  describe('resumeAfterStop filter', () => {
    it('filters pre-boundary points', () => {
      const boundary = new Date('2026-09-08T19:54:00.000Z');
      const filtered = filterCorePointsAfterBoundary(
        [
          { timestamp: '2026-09-08T19:53:50.000Z', speed: 15 },
          { timestamp: '2026-09-08T19:55:38.000Z', speed: 20 },
        ] as any,
        boundary,
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].speed).toBe(20);
    });
  });
});
