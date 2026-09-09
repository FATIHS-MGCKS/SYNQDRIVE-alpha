import {
  assessSuccessfulEmptyCoreEndEligibility,
  classifyEmptyCoreVlsInactivity,
} from './trip-empty-core-end-gate';
import {
  mergeStopBoundaryAt,
  readStopBoundaryAt,
  resolveProviderOperationalAnchor,
} from './trip-fsm-evidence-state';

const MIN_INACTIVITY = 120_000;

describe('TDL-DEC-R11 stop evidence semantics (vls_stop_boundary_corroboration)', () => {
  const stopBoundary = new Date('2026-09-08T19:59:55.895Z');
  const workerNow = new Date('2026-09-08T20:02:00.000Z');

  it('older VLS observation before stopBoundary corroborates stop — does not fake fresh stop proof', () => {
    const obsAt = new Date('2026-09-08T19:59:22.000Z');
    const vls = classifyEmptyCoreVlsInactivity({
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 42.745,
        sourceTimestamp: obsAt,
      },
      profile: 'ICE',
      workerNow,
      maxObservationAgeMs: MIN_INACTIVITY,
      stopBoundaryAt: stopBoundary,
    });
    expect(vls.state).toBe('INACTIVE');
    expect(vls.reason).toBe('vls_stop_boundary_corroboration');
    expect(vls.providerObservedAt?.toISOString()).toBe(obsAt.toISOString());
  });

  it('records which measurement anchors stopBoundaryAt in evidence summary', () => {
    const merged = mergeStopBoundaryAt({}, stopBoundary, 'pause_corroborated');
    expect(readStopBoundaryAt(merged)?.toISOString()).toBe(stopBoundary.toISOString());
    expect(merged.stopBoundarySource).toBe('pause_corroborated');
  });

  it('does not move stopBoundaryAt backwards when an older snapshot arrives later', () => {
    const newerBoundary = new Date('2026-09-08T20:00:10.000Z');
    const merged = mergeStopBoundaryAt(
      mergeStopBoundaryAt({}, newerBoundary, 'idle_within_trip'),
      stopBoundary,
      'stale_snapshot',
    );
    expect(readStopBoundaryAt(merged)?.toISOString()).toBe(newerBoundary.toISOString());
  });

  it('newer contradicting activity after stopBoundary blocks end candidacy', () => {
    const gate = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 130_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: {
        isIgnitionOn: true,
        speedKmh: 25,
        engineLoad: 20,
        sourceTimestamp: new Date('2026-09-08T20:01:30.000Z'),
      },
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow,
      stopBoundaryAt: stopBoundary,
    });
    expect(gate.eligible).toBe(false);
    expect(gate.forensics.innerGateReason).toBe('vls_speed_above_motion_threshold');
  });

  it('speed zero alone does not prove motor-off pause without corroboration', () => {
    const vls = classifyEmptyCoreVlsInactivity({
      telemetry: {
        isIgnitionOn: null,
        speedKmh: 0,
        engineLoad: null,
        sourceTimestamp: new Date('2026-09-08T20:01:00.000Z'),
      },
      profile: 'ICE',
      workerNow: new Date('2026-09-08T20:01:30.000Z'),
      maxObservationAgeMs: MIN_INACTIVITY,
    });
    expect(vls.state).toBe('INACTIVE');
    expect(vls.reason).toBe('vls_explicit_stationary_sample');
  });

  it('motor activity at standstill remains UNKNOWN — not end proof', () => {
    const vls = classifyEmptyCoreVlsInactivity({
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 42,
        sourceTimestamp: new Date('2026-09-08T20:01:00.000Z'),
      },
      profile: 'ICE',
      workerNow: new Date('2026-09-08T20:01:30.000Z'),
      maxObservationAgeMs: MIN_INACTIVITY,
      stopBoundaryAt: stopBoundary,
    });
    expect(vls.state).toBe('UNKNOWN');
    expect(vls.reason).toBe('vls_motor_activity_at_standstill');
  });

  it('absent evidence stays UNKNOWN — no invented stop or end', () => {
    const gate = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 304_105,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: null,
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow: new Date('2026-09-08T20:05:00.000Z'),
      stopBoundaryAt: stopBoundary,
    });
    expect(gate.eligible).toBe(false);
    expect(gate.forensics.innerGateReason).toBe('vls_row_absent');
  });

  it('aggregated snapshot refresh does not rejuvenate stale engine load measurement time', () => {
    const anchor = resolveProviderOperationalAnchor({
      lastEvidenceSummary: {
        lastProviderActivityAt: stopBoundary.toISOString(),
        stopBoundaryAt: stopBoundary.toISOString(),
      },
      lastMeaningfulMovementAt: stopBoundary,
      lastActivityAt: new Date('2026-09-08T20:05:00.000Z'),
      possibleStartAt: null,
      workerNow: new Date('2026-09-08T20:05:00.000Z'),
    });
    expect(anchor.anchorSource).toBe('lastProviderActivityAt');
    expect(anchor.anchorAt.toISOString()).toBe(stopBoundary.toISOString());
  });
});
