import {
  resolveIdleStopBoundaryAt,
  resolveProviderOperationalAnchor,
} from './trip-fsm-evidence-state';
import {
  assessSuccessfulEmptyCoreEndEligibility,
  classifyEmptyCoreVlsInactivity,
} from './trip-empty-core-end-gate';

describe('resolveIdleStopBoundaryAt', () => {
  const lastMovement = new Date('2026-09-08T19:58:45.114Z');
  const vlsObs = new Date('2026-09-08T19:59:22.000Z');
  const workerNow = new Date('2026-09-08T19:59:56.000Z');

  it('prefers stationary VLS provider time when ignition explicitly OFF (KS MS 661)', () => {
    const result = resolveIdleStopBoundaryAt({
      movementEventAt: null,
      lastMeaningfulMovementAt: lastMovement,
      lastActivityAt: lastMovement,
      workerNow,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 42.745,
        sourceTimestamp: vlsObs,
      },
      profile: 'ICE',
    });
    expect(result.boundaryAt.toISOString()).toBe(vlsObs.toISOString());
    expect(result.source).toBe('idle_within_trip_stationary_vls');
    expect(result.clockAuthority).toBe('PROVIDER_EVENT_TIME');
    expect(result.trust).toBe(true);
  });

  it('does not anchor on stationary VLS when ignition is explicitly ON (traffic stop)', () => {
    const result = resolveIdleStopBoundaryAt({
      movementEventAt: null,
      lastMeaningfulMovementAt: lastMovement,
      lastActivityAt: lastMovement,
      workerNow,
      telemetry: {
        isIgnitionOn: true,
        speedKmh: 0,
        engineLoad: 42.745,
        sourceTimestamp: vlsObs,
      },
      profile: 'ICE',
    });
    expect(result.boundaryAt.toISOString()).toBe(lastMovement.toISOString());
    expect(result.source).toBe('idle_within_trip_last_movement');
  });

  it('does not anchor on stationary VLS when ignition is unknown (null)', () => {
    const result = resolveIdleStopBoundaryAt({
      movementEventAt: null,
      lastMeaningfulMovementAt: lastMovement,
      lastActivityAt: lastMovement,
      workerNow,
      telemetry: {
        isIgnitionOn: null,
        speedKmh: 0,
        engineLoad: 42.745,
        sourceTimestamp: vlsObs,
      },
      profile: 'ICE',
    });
    expect(result.source).toBe('idle_within_trip_last_movement');
  });

  it('prefers movementEventAt when present', () => {
    const movement = new Date('2026-09-08T20:00:00.000Z');
    const result = resolveIdleStopBoundaryAt({
      movementEventAt: movement,
      lastMeaningfulMovementAt: lastMovement,
      lastActivityAt: lastMovement,
      workerNow,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 0,
        sourceTimestamp: vlsObs,
      },
      profile: 'ICE',
    });
    expect(result.boundaryAt.toISOString()).toBe(movement.toISOString());
    expect(result.source).toBe('idle_within_trip_movement');
  });

  it('falls back to last movement when VLS speed missing', () => {
    const result = resolveIdleStopBoundaryAt({
      movementEventAt: null,
      lastMeaningfulMovementAt: lastMovement,
      lastActivityAt: lastMovement,
      workerNow,
      telemetry: {
        isIgnitionOn: null,
        speedKmh: null,
        engineLoad: null,
        sourceTimestamp: vlsObs,
      },
      profile: 'ICE',
    });
    expect(result.boundaryAt.toISOString()).toBe(lastMovement.toISOString());
    expect(result.source).toBe('idle_within_trip_last_movement');
  });
});

describe('KS MS 661 counter-cases and field semantics', () => {
  const MIN = 120_000;
  const stopBoundary = new Date('2026-09-08T19:59:22.000Z');

  it('fresh motor load after boundary does not corroborate end (standstill without shutdown proof)', () => {
    const workerNow = new Date('2026-09-08T20:00:30.000Z');
    const vls = classifyEmptyCoreVlsInactivity({
      telemetry: {
        isIgnitionOn: null,
        speedKmh: 0,
        engineLoad: 42,
        sourceTimestamp: new Date('2026-09-08T20:00:00.000Z'),
      },
      profile: 'ICE',
      workerNow,
      maxObservationAgeMs: MIN,
      stopBoundaryAt: stopBoundary,
    });
    expect(vls.state).toBe('UNKNOWN');
    expect(vls.reason).toBe('vls_motor_activity_at_standstill');
  });

  it('null ignition is not treated as ignition-off for pause corroboration path', () => {
    const workerNow = new Date('2026-09-08T20:00:00.000Z');
    const gate = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 65_000,
      minInactivityBeforeCusumMs: MIN,
      telemetry: {
        isIgnitionOn: null,
        speedKmh: 0,
        engineLoad: 0,
        sourceTimestamp: new Date('2026-09-08T19:59:22.000Z'),
      },
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow,
      stopBoundaryAt: stopBoundary,
    });
    expect(gate.eligible).toBe(false);
  });

  it('null telemetry remains vls_row_absent (data abort without prior stop proof)', () => {
    const workerNow = new Date('2026-09-08T20:05:00.000Z');
    const gate = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 300_000,
      minInactivityBeforeCusumMs: MIN,
      telemetry: null,
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow,
      stopBoundaryAt: stopBoundary,
      stopBoundarySource: 'provider_stationary_vls',
    });
    expect(gate.eligible).toBe(false);
  });

  it('post-boundary core motion advances provider anchor (short motor-off pause resume)', () => {
    const resumeAt = new Date('2026-09-08T20:01:30.000Z');
    const { anchorAt } = resolveProviderOperationalAnchor({
      lastEvidenceSummary: {
        stopBoundaryAt: stopBoundary.toISOString(),
        lastProviderActivityAt: stopBoundary.toISOString(),
      },
      lastMeaningfulMovementAt: stopBoundary,
      lastActivityAt: stopBoundary,
      possibleStartAt: null,
      workerNow: resumeAt,
    });
    expect(anchorAt.toISOString()).toBe(stopBoundary.toISOString());
  });

  it('boundary corroboration uses non-contradictory provider obs at boundary', () => {
    const workerNow = new Date('2026-09-08T19:59:30.000Z');
    const vls = classifyEmptyCoreVlsInactivity({
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 0,
        sourceTimestamp: stopBoundary,
      },
      profile: 'ICE',
      workerNow,
      maxObservationAgeMs: MIN,
      stopBoundaryAt: stopBoundary,
    });
    expect(vls.state).toBe('INACTIVE');
    expect(vls.reason).toBe('vls_stop_boundary_corroboration');
  });

  it('high engineLoad at boundary is motor-activity contradiction when still fresh', () => {
    const workerNow = new Date('2026-09-08T19:59:30.000Z');
    const vls = classifyEmptyCoreVlsInactivity({
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 42.745,
        sourceTimestamp: stopBoundary,
      },
      profile: 'ICE',
      workerNow,
      maxObservationAgeMs: MIN,
      stopBoundaryAt: stopBoundary,
    });
    expect(vls.state).toBe('UNKNOWN');
    expect(vls.reason).toBe('vls_motor_activity_at_standstill');
  });

  it('aged high engineLoad observation becomes stale before boundary-backed silence', () => {
    const workerNow = new Date('2026-09-08T20:01:30.000Z');
    const vls = classifyEmptyCoreVlsInactivity({
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 42.745,
        sourceTimestamp: stopBoundary,
      },
      profile: 'ICE',
      workerNow,
      maxObservationAgeMs: MIN,
      stopBoundaryAt: stopBoundary,
    });
    expect(vls.state).toBe('UNKNOWN');
    expect(vls.reason).toBe('vls_stale_provider_observation');
  });
});

/** Mirrors dimo-snapshot.processor.ts normalizeSnapshot isIgnitionOn branch. */
function normalizeDimoIgnitionSignal(raw: unknown): boolean | null {
  const numVal = (field: unknown): number | null => {
    if (field == null) return null;
    if (typeof field === 'number') return Number.isNaN(field) ? null : field;
    if (typeof field === 'object') {
      const v = (field as Record<string, unknown>).value;
      return v != null && typeof v === 'number' && !Number.isNaN(v) ? v : null;
    }
    return null;
  };
  const v = numVal(raw);
  return v != null ? v >= 0.5 : null;
}

describe('DIMO VLS ignition normalization contract', () => {
  it('maps explicit ON, explicit OFF, and missing signal distinctly', () => {
    expect(normalizeDimoIgnitionSignal(1)).toBe(true);
    expect(normalizeDimoIgnitionSignal(0)).toBe(false);
    expect(normalizeDimoIgnitionSignal(0.49)).toBe(false);
    expect(normalizeDimoIgnitionSignal(null)).toBeNull();
    expect(normalizeDimoIgnitionSignal(undefined)).toBeNull();
    expect(normalizeDimoIgnitionSignal({ value: 1 })).toBe(true);
    expect(normalizeDimoIgnitionSignal({ value: 0 })).toBe(false);
  });
});
