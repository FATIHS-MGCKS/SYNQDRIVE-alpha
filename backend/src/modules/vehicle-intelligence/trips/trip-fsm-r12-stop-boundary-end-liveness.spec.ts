import { TRIP_FSM_MAX_FUTURE_SKEW_MS } from './trip-fsm-clock-contract';
import {
  assessBoundaryBackedEmptyCoreSilence,
  assessSuccessfulEmptyCoreEndEligibility,
  classifyEmptyCoreVlsInactivity,
} from './trip-empty-core-end-gate';
import {
  continuityImpliesCrediblePostBoundaryMovement,
  continuityImpliesMeaningfulMovement,
  hasCrediblePostBoundaryRouteMotion,
} from './trip-evidence.helpers';
import {
  mergeProviderStopBoundaryCandidate,
  readStopBoundaryAt,
  resolveProviderStopBoundaryCandidate,
} from './trip-fsm-evidence-state';

const MIN_INACTIVITY = 120_000;
const WORKER_NOW = new Date('2026-09-09T05:16:00.000Z');
const STOP_BOUNDARY = new Date('2026-09-09T05:06:58.562Z');

describe('R12 provider stop boundary candidate', () => {
  it('K7 — stationary ignition-off with high engineLoad still yields qualified boundary', () => {
    const candidate = resolveProviderStopBoundaryCandidate({
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 39.6,
        sourceTimestamp: new Date('2026-09-09T05:07:00.000Z'),
      },
      profile: 'ICE',
      workerNow: WORKER_NOW,
      lastMeaningfulMovementAt: new Date('2026-09-09T05:06:49.562Z'),
      existingStopBoundaryAt: null,
    });
    expect(candidate).toMatchObject({
      boundarySource: 'provider_stationary_vls',
      evidenceState: 'QUALIFIED',
      contradictions: ['engine_load_at_standstill'],
    });
  });

  it('boundaries are monotonic — older candidate rejected', () => {
    expect(
      resolveProviderStopBoundaryCandidate({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: new Date('2026-09-09T05:01:00.000Z'),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        lastMeaningfulMovementAt: new Date('2026-09-09T04:59:00.000Z'),
        existingStopBoundaryAt: STOP_BOUNDARY,
      }),
    ).toBeNull();
  });
});

describe('R12 boundary-backed empty-core silence', () => {
  it('K5 — stale UNKNOWN without boundary remains KEEP_OPEN', () => {
    const gate = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: MIN_INACTIVITY + 5_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 39.6,
        sourceTimestamp: new Date('2026-09-09T05:07:00.000Z'),
      },
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow: WORKER_NOW,
      stopBoundaryAt: null,
    });
    expect(gate.eligible).toBe(false);
    expect(gate.forensics.innerGateReason).toBe('vls_stale_provider_observation');
  });

  it('K1 — stale UNKNOWN with trusted boundary + silence allows POSSIBLE_END', () => {
    const vlsEvidence = classifyEmptyCoreVlsInactivity({
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 39.6,
        sourceTimestamp: new Date('2026-09-09T05:07:00.000Z'),
      },
      profile: 'ICE',
      workerNow: WORKER_NOW,
      maxObservationAgeMs: MIN_INACTIVITY,
      stopBoundaryAt: STOP_BOUNDARY,
    });
    expect(vlsEvidence.state).toBe('UNKNOWN');
    expect(vlsEvidence.reason).toBe('vls_stale_provider_observation');

    const gate = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: WORKER_NOW.getTime() - STOP_BOUNDARY.getTime(),
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 39.6,
        sourceTimestamp: new Date('2026-09-09T05:07:00.000Z'),
      },
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow: WORKER_NOW,
      stopBoundaryAt: STOP_BOUNDARY,
      hasCrediblePostBoundaryMovement: false,
    });
    expect(gate.eligible).toBe(true);
    expect(gate.forensics.boundaryBackedSilenceEligible).toBe(true);
    expect(gate.forensics.innerGateReason).toBe('boundary_backed_provider_silence');
  });

  it('K7 — fresh engineLoad contradiction blocks until stale, then boundary-backed silence progresses', () => {
    const fresh = assessBoundaryBackedEmptyCoreSilence({
      stopBoundaryAt: STOP_BOUNDARY,
      operationalInactiveMs: 130_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      vlsEvidence: classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 39.6,
          sourceTimestamp: new Date('2026-09-09T05:14:30.000Z'),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
        stopBoundaryAt: STOP_BOUNDARY,
      }),
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostBoundaryMovement: false,
      workerNow: WORKER_NOW,
    });
    expect(fresh.eligible).toBe(false);
    expect(fresh.reason).toBe('vls_motor_activity_at_standstill');
  });
});

describe('R12 post-boundary activity policy', () => {
  it('K8 — pre-boundary / replayed core motion does not imply credible post-boundary movement', () => {
    expect(
      continuityImpliesCrediblePostBoundaryMovement({
        recentPoints: [
          {
            timestamp: '2026-09-09T05:06:49.562Z',
            speed: 3.3,
            travelledDistance: 1000,
            isIgnitionOn: false,
          } as any,
        ],
        profile: 'ICE',
        continuitySummary: { motionCount: 2, odometerDelta: 0 },
        stopBoundaryAt: STOP_BOUNDARY,
        workerNow: WORKER_NOW,
      }),
    ).toBe(false);
    expect(
      continuityImpliesMeaningfulMovement({ motionCount: 2, odometerDelta: 0 }),
    ).toBe(true);
  });

  it('K9 — true post-boundary speed implies credible movement', () => {
    expect(
      continuityImpliesCrediblePostBoundaryMovement({
        recentPoints: [
          {
            timestamp: '2026-09-09T05:08:00.000Z',
            speed: 12,
            travelledDistance: 1001,
            isIgnitionOn: true,
          } as any,
        ],
        profile: 'ICE',
        continuitySummary: { motionCount: 1, odometerDelta: 0.001 },
        stopBoundaryAt: STOP_BOUNDARY,
        workerNow: WORKER_NOW,
      }),
    ).toBe(true);
  });

  it('route motion after boundary is detected', () => {
    expect(
      hasCrediblePostBoundaryRouteMotion(
        [
          {
            latitude: 51.33,
            longitude: 9.5,
            speedKmh: 20,
            timestamp: '2026-09-09T05:08:00.000Z',
          },
        ],
        'ICE',
        STOP_BOUNDARY,
      ),
    ).toBe(true);
  });
});

describe('R12 pause provenance', () => {
  it('K2 — short pause boundary persists without end candidacy metadata', () => {
    const summary = mergeProviderStopBoundaryCandidate({}, {
      boundaryAt: new Date('2026-09-09T04:59:57.000Z'),
      boundarySource: 'provider_stationary_vls',
      candidateReason: 'stationary_ignition_off_qualified',
      contradictions: ['engine_load_at_standstill'],
      evidenceState: 'QUALIFIED',
    });
    expect(summary.stopBoundaryAt).toBe('2026-09-09T04:59:57.000Z');
    expect(summary.stopBoundaryCandidateReason).toBe(
      'stationary_ignition_off_qualified',
    );
  });

  it('K4 — later final stop boundary supersedes earlier pause boundary', () => {
    const pauseSummary = mergeProviderStopBoundaryCandidate({}, {
      boundaryAt: new Date('2026-09-09T04:59:57.000Z'),
      boundarySource: 'provider_stationary_vls',
      candidateReason: 'stationary_ignition_off_qualified',
      contradictions: [],
      evidenceState: 'QUALIFIED',
    });
    const finalSummary = mergeProviderStopBoundaryCandidate(pauseSummary, {
      boundaryAt: STOP_BOUNDARY,
      boundarySource: 'provider_stationary_vls',
      candidateReason: 'stationary_ignition_off_qualified',
      contradictions: ['engine_load_at_standstill'],
      evidenceState: 'QUALIFIED',
    });
    expect(readStopBoundaryAt(finalSummary)?.toISOString()).toBe(
      STOP_BOUNDARY.toISOString(),
    );
  });
});

describe('R12 fresh contradiction and resume', () => {
  it('K3 — credible post-boundary movement keeps trip open semantics', () => {
    expect(
      continuityImpliesCrediblePostBoundaryMovement({
        recentPoints: [
          {
            timestamp: '2026-09-09T05:08:00.000Z',
            speed: 15,
            travelledDistance: 191076,
            isIgnitionOn: true,
          } as any,
        ],
        profile: 'ICE',
        continuitySummary: { motionCount: 1, odometerDelta: 0.001 },
        stopBoundaryAt: STOP_BOUNDARY,
        workerNow: WORKER_NOW,
      }),
    ).toBe(true);
  });

  it('K6 — fresh route motion blocks boundary-backed silence', () => {
    const blocked = assessBoundaryBackedEmptyCoreSilence({
      stopBoundaryAt: STOP_BOUNDARY,
      operationalInactiveMs: 130_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      vlsEvidence: classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: new Date('2026-09-09T05:07:00.000Z'),
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        maxObservationAgeMs: MIN_INACTIVITY,
        stopBoundaryAt: STOP_BOUNDARY,
      }),
      performanceActivity: false,
      routeMotion: true,
      hasCrediblePostBoundaryMovement: false,
      workerNow: WORKER_NOW,
    });
    expect(blocked.eligible).toBe(false);
    expect(blocked.reason).toBe('post_boundary_positive_contradiction');
  });
});
