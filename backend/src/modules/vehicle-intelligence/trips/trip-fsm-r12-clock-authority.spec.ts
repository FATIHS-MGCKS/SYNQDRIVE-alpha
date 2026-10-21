import {
  resolvePossibleEndBoundaryCandidate,
  type StopBoundaryProvenance,
} from './trip-fsm-clock-contract';
import {
  assessBoundaryBackedEmptyCoreSilence,
  assessSuccessfulEmptyCoreEndEligibility,
  classifyEmptyCoreVlsInactivity,
} from './trip-empty-core-end-gate';
import { hasCrediblePostBoundaryRouteMotion } from './trip-evidence.helpers';
import {
  buildStopBoundaryProvenance,
  mergeProviderStopBoundaryCandidate,
  mergeStopBoundaryAt,
  readStopBoundaryAt,
  readStopBoundaryProvenance,
  resolveIdleStopBoundaryAt,
  resolveProviderStopBoundaryCandidate,
} from './trip-fsm-evidence-state';

const MIN_INACTIVITY = 120_000;
const WORKER_NOW = new Date('2026-09-09T05:16:00.000Z');
const STOP_BOUNDARY = new Date('2026-09-09T05:06:58.562Z');

const trustedProviderBoundary: StopBoundaryProvenance = buildStopBoundaryProvenance(
  STOP_BOUNDARY,
  'provider_stationary_vls',
  'PROVIDER_EVENT_TIME',
);

describe('R12-CLOCK authority regressions', () => {
  it('R12-CLOCK-1 — IDLE fallback from workerNow uses WORKER_TIME authority', () => {
    const result = resolveIdleStopBoundaryAt({
      movementEventAt: null,
      lastMeaningfulMovementAt: null,
      lastActivityAt: null,
      workerNow: WORKER_NOW,
      telemetry: null,
      profile: 'ICE',
    });
    expect(result.boundaryAt).toEqual(WORKER_NOW);
    expect(result.source).toBe('idle_within_trip_worker_now');
    expect(result.clockAuthority).toBe('WORKER_TIME');
    expect(result.trust).toBe(false);
  });

  it('R12-CLOCK-2 — WORKER_TIME boundary + stale UNKNOWN + >=120s stays KEEP_OPEN', () => {
    const workerBoundary = buildStopBoundaryProvenance(
      new Date('2026-09-09T05:06:00.000Z'),
      'idle_within_trip_worker_now',
      'WORKER_TIME',
    );
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
      stopBoundaryAt: workerBoundary.boundaryAt,
    });
    expect(vlsEvidence.state).toBe('UNKNOWN');
    expect(vlsEvidence.reason).toBe('vls_stale_provider_observation');

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
      stopBoundaryProvenance: workerBoundary,
      hasCrediblePostBoundaryMovement: false,
    });
    expect(gate.eligible).toBe(false);
    expect(gate.forensics.decision).toBe('KEEP_OPEN');
    expect(gate.forensics.boundaryBackedSilenceEligible).not.toBe(true);
    expect(gate.forensics.innerGateReason).toBe('stop_boundary_untrusted_worker_time');
  });

  it('R12-CLOCK-3 — lastActivityAt-derived stop boundary is WORKER_TIME not PROVIDER_EVENT_TIME', () => {
    const lastActivity = new Date('2026-09-09T05:14:30.000Z');
    const idle = resolveIdleStopBoundaryAt({
      movementEventAt: null,
      lastMeaningfulMovementAt: null,
      lastActivityAt: lastActivity,
      workerNow: WORKER_NOW,
      telemetry: null,
      profile: 'ICE',
    });
    expect(idle.source).toBe('idle_within_trip_last_activity');
    expect(idle.clockAuthority).toBe('WORKER_TIME');
    expect(idle.trust).toBe(false);

    const endBoundary = resolvePossibleEndBoundaryCandidate({
      stopBoundaryProvenance: idle,
      lastMeaningfulMovementAt: null,
      lastActivityAt: lastActivity,
      workerNow: WORKER_NOW,
    });
    expect(endBoundary.clockSource).not.toBe('PROVIDER_EVENT_TIME');
    expect(endBoundary.clockSource).toBe('WORKER_FALLBACK');
  });

  it('R12-CLOCK-4 — provider observation supersedes weak WORKER_TIME fallback in same stop episode', () => {
    const workerFallback = mergeStopBoundaryAt(
      {},
      WORKER_NOW,
      'idle_within_trip_worker_now',
      'WORKER_TIME',
    );
    expect(readStopBoundaryProvenance(workerFallback)?.clockAuthority).toBe(
      'WORKER_TIME',
    );

    const providerCandidate = resolveProviderStopBoundaryCandidate({
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 0,
        sourceTimestamp: new Date('2026-09-09T05:07:00.000Z'),
      },
      profile: 'ICE',
      workerNow: new Date('2026-09-09T05:07:30.000Z'),
      lastMeaningfulMovementAt: new Date('2026-09-09T05:06:49.562Z'),
      existingStopBoundarySummary: workerFallback,
    });
    expect(providerCandidate).not.toBeNull();

    const upgraded = mergeProviderStopBoundaryCandidate(
      workerFallback,
      providerCandidate!,
    );
    const provenance = readStopBoundaryProvenance(upgraded);
    expect(provenance?.clockAuthority).toBe('PROVIDER_EVENT_TIME');
    expect(provenance?.trust).toBe(true);
    expect(provenance?.boundaryAt.toISOString()).toBe(
      '2026-09-09T05:07:00.000Z',
    );
  });

  it('R12-CLOCK-5 — trusted provider boundary + stale UNKNOWN + >=120s remains boundary-backed PASS', () => {
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
      stopBoundaryProvenance: trustedProviderBoundary,
      hasCrediblePostBoundaryMovement: false,
    });
    expect(gate.eligible).toBe(true);
    expect(gate.forensics.boundaryBackedSilenceEligible).toBe(true);
    expect(gate.forensics.innerGateReason).toBe('boundary_backed_provider_silence');
  });

  it('R12-CLOCK-6 — resolvePossibleEndBoundaryCandidate never labels worker boundary as PROVIDER_EVENT_TIME', () => {
    const workerBoundary = buildStopBoundaryProvenance(
      WORKER_NOW,
      'idle_within_trip_worker_now',
      'WORKER_TIME',
    );
    const endBoundary = resolvePossibleEndBoundaryCandidate({
      stopBoundaryProvenance: workerBoundary,
      lastMeaningfulMovementAt: new Date('2026-09-09T05:06:49.562Z'),
      lastActivityAt: WORKER_NOW,
      workerNow: WORKER_NOW,
    });
    expect(endBoundary.boundaryAt.getTime()).not.toBe(workerBoundary.boundaryAt.getTime());
    expect(endBoundary.boundaryAt.toISOString()).toBe(
      '2026-09-09T05:06:49.562Z',
    );
    expect(endBoundary.clockSource).toBe('PROVIDER_EVENT_TIME');
  });
});

describe('R12-ROUTE cross-boundary displacement bridge', () => {
  const boundary = STOP_BOUNDARY;

  it('R12-ROUTE-1 — at-boundary + post-boundary point displaced >25m with null speed counts as movement', () => {
    expect(
      hasCrediblePostBoundaryRouteMotion(
        [
          {
            latitude: 51.335,
            longitude: 9.5,
            speedKmh: 0,
            timestamp: '2026-09-09T05:06:58.562Z',
          },
          {
            latitude: 51.3354,
            longitude: 9.5005,
            speedKmh: null,
            timestamp: '2026-09-09T05:08:00.000Z',
          },
        ],
        'ICE',
        boundary,
      ),
    ).toBe(true);
  });

  it('R12-ROUTE-2 — at-boundary + post-boundary displacement <25m does not count as movement', () => {
    expect(
      hasCrediblePostBoundaryRouteMotion(
        [
          {
            latitude: 51.335,
            longitude: 9.5,
            speedKmh: 0,
            timestamp: '2026-09-09T05:06:58.562Z',
          },
          {
            latitude: 51.3350005,
            longitude: 9.5000005,
            speedKmh: null,
            timestamp: '2026-09-09T05:08:00.000Z',
          },
        ],
        'ICE',
        boundary,
      ),
    ).toBe(false);
  });

  it('R12-ROUTE-3 — post-boundary speed above threshold still counts as movement', () => {
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
        boundary,
      ),
    ).toBe(true);
  });
});

describe('R12 boundary-backed silence trust contract', () => {
  it('assessBoundaryBackedEmptyCoreSilence rejects untrusted worker boundary directly', () => {
    const result = assessBoundaryBackedEmptyCoreSilence({
      stopBoundaryProvenance: buildStopBoundaryProvenance(
        WORKER_NOW,
        'idle_within_trip_worker_now',
        'WORKER_TIME',
      ),
      operationalInactiveMs: MIN_INACTIVITY + 5_000,
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
        stopBoundaryAt: WORKER_NOW,
      }),
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostBoundaryMovement: false,
      workerNow: WORKER_NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('stop_boundary_untrusted_worker_time');
  });
});
