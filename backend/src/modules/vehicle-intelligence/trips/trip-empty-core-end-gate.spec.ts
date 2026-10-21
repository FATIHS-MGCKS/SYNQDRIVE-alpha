import { TRIP_FSM_MAX_FUTURE_SKEW_MS } from './trip-fsm-clock-contract';
import {
  classifyEmptyCoreVlsInactivity,
  assessSuccessfulEmptyCoreEndEligibility,
} from './trip-empty-core-end-gate';

const WORKER_NOW = new Date('2026-09-06T12:00:00.000Z');
const MIN_INACTIVITY = 120_000;

function freshTs(offsetMs = -30_000) {
  return new Date(WORKER_NOW.getTime() + offsetMs);
}

describe('classifyEmptyCoreVlsInactivity (R5A)', () => {
  it('telemetry null → UNKNOWN', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: null,
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).state,
    ).toBe('UNKNOWN');
  });

  it('all-null telemetry fields → UNKNOWN', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: null,
          speedKmh: null,
          engineLoad: null,
          sourceTimestamp: freshTs(),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).reason,
    ).toBe('vls_speed_missing');
  });

  it('speed missing with ignition=false → UNKNOWN', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: null,
          engineLoad: null,
          sourceTimestamp: freshTs(),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).state,
    ).toBe('UNKNOWN');
  });

  it('fresh EV speed=0 ignition=null → INACTIVE', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: null,
          speedKmh: 0,
          engineLoad: null,
          sourceTimestamp: freshTs(),
        },
        profile: 'EV',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).state,
    ).toBe('INACTIVE');
  });

  it('fresh ICE speed=0 → INACTIVE', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: freshTs(),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).state,
    ).toBe('INACTIVE');
  });

  it('speed above motion threshold → ACTIVE', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 10,
          engineLoad: 0,
          sourceTimestamp: freshTs(),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).state,
    ).toBe('ACTIVE');
  });

  it('engine load at standstill without stop boundary → UNKNOWN (motor activity)', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 20,
          sourceTimestamp: freshTs(),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).state,
    ).toBe('UNKNOWN');
  });

  it('engine load before stop boundary → UNKNOWN motor activity (fresh contradiction blocks INACTIVE)', () => {
    const stopBoundary = new Date(WORKER_NOW.getTime() - 10_000);
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 42,
          sourceTimestamp: freshTs(-60_000),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
        stopBoundaryAt: stopBoundary,
      }),
    ).toMatchObject({
      state: 'UNKNOWN',
      reason: 'vls_motor_activity_at_standstill',
    });
  });

  it('non-contradictory pre-boundary stationary → INACTIVE corroboration', () => {
    const stopBoundary = new Date(WORKER_NOW.getTime() - 10_000);
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: freshTs(-60_000),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
        stopBoundaryAt: stopBoundary,
      }),
    ).toMatchObject({
      state: 'INACTIVE',
      reason: 'vls_stop_boundary_corroboration',
    });
  });

  it('R12-AUD-004 — fresh ignition ON stationary → ACTIVE keep-open evidence', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: true,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: freshTs(),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }),
    ).toMatchObject({
      state: 'ACTIVE',
      reason: 'vls_ignition_on_stationary',
    });
  });

  it('stale speed before stop boundary → INACTIVE not ACTIVE', () => {
    const stopBoundary = new Date(WORKER_NOW.getTime() - 5_000);
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 10,
          engineLoad: 0,
          sourceTimestamp: freshTs(-30_000),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
        stopBoundaryAt: stopBoundary,
      }).reason,
    ).toBe('vls_stale_speed_before_stop_boundary');
  });

  it('sourceTimestamp missing → UNKNOWN', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: null,
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).reason,
    ).toBe('vls_source_timestamp_missing');
  });

  it('stale sourceTimestamp → UNKNOWN', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: new Date(WORKER_NOW.getTime() - MIN_INACTIVITY - 1),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).reason,
    ).toBe('vls_stale_provider_observation');
  });

  it('future-invalid sourceTimestamp → UNKNOWN', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: new Date(
            WORKER_NOW.getTime() + TRIP_FSM_MAX_FUTURE_SKEW_MS + 1,
          ),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).reason,
    ).toBe('vls_source_timestamp_invalid');
  });

  it('within-skew future sourceTimestamp → valid INACTIVE', () => {
    expect(
      classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: null,
          speedKmh: 0,
          engineLoad: null,
          sourceTimestamp: new Date(WORKER_NOW.getTime() + 30_000),
        },
        profile: 'EV',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
      }).state,
    ).toBe('INACTIVE');
  });
});

describe('assessSuccessfulEmptyCoreEndEligibility (R5A)', () => {
  it('fully corroborated empty core → POSSIBLE_END', () => {
    const result = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 150_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 0,
        sourceTimestamp: freshTs(),
      },
      perfReadings: [],
      routePoints: [{ latitude: 1, longitude: 2, speedKmh: 0, timestamp: 't' }],
      profile: 'ICE',
      workerNow: WORKER_NOW,
    });
    expect(result.eligible).toBe(true);
    expect(result.forensics.vlsEvidenceState).toBe('INACTIVE');
  });

  it('R12-AUD-004 — ignition ON idle blocks end even after 120s inactivity', () => {
    const result = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 150_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: {
        isIgnitionOn: true,
        speedKmh: 0,
        engineLoad: 0,
        sourceTimestamp: freshTs(),
      },
      perfReadings: [],
      routePoints: [{ latitude: 1, longitude: 2, speedKmh: 0, timestamp: 't' }],
      profile: 'ICE',
      workerNow: WORKER_NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.forensics.vlsEvidenceState).toBe('ACTIVE');
    expect(result.forensics.innerGateReason).toBe('vls_ignition_on_stationary');
  });

  it('R12-AUD-004 — post-boundary ignition ON stationary remains keep-open', () => {
    const stopBoundary = new Date(WORKER_NOW.getTime() - 130_000);
    const result = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 150_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: {
        isIgnitionOn: true,
        speedKmh: 0,
        engineLoad: 0,
        sourceTimestamp: freshTs(),
      },
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow: WORKER_NOW,
      stopBoundaryAt: stopBoundary,
      stopBoundarySource: 'provider_stationary_vls',
    });
    expect(result.eligible).toBe(false);
    expect(result.forensics.innerGateReason).toBe('vls_ignition_on_stationary');
  });

  it('UNKNOWN VLS keeps open even without perf/route activity', () => {
    const result = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: 150_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: null,
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow: WORKER_NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.forensics.vlsEvidenceState).toBe('UNKNOWN');
  });
});
