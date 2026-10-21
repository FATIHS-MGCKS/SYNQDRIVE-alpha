import {
  assessProviderSilenceEmptyCoreAdmission,
  assessSuccessfulEmptyCoreEndEligibility,
  classifyEmptyCoreVlsInactivity,
} from './trip-empty-core-end-gate';
import { resolvePossibleEndBoundaryCandidate } from './trip-fsm-clock-contract';
import { hasCrediblePostBoundaryRouteMotion } from './trip-evidence.helpers';

const MIN_INACTIVITY = 120_000;
const LAST_MOVEMENT = new Date('2026-09-13T10:14:00.000Z');
const PROVIDER_ANCHOR = new Date('2026-09-13T10:23:00.000Z');
const WORKER_NOW = new Date('2026-09-13T10:26:00.000Z');

function staleVlsEvidence() {
  return classifyEmptyCoreVlsInactivity({
    telemetry: {
      isIgnitionOn: false,
      speedKmh: 0,
      engineLoad: 39.6,
      sourceTimestamp: PROVIDER_ANCHOR,
    },
    profile: 'ICE',
    workerNow: WORKER_NOW,
    maxObservationAgeMs: MIN_INACTIVITY,
    stopBoundaryAt: null,
  });
}

describe('R12 provider silence empty-core admission', () => {
  it('admits POSSIBLE_END after bounded provider silence without trusted boundary', () => {
    const vlsEvidence = staleVlsEvidence();
    expect(vlsEvidence.state).toBe('UNKNOWN');
    expect(vlsEvidence.reason).toBe('vls_stale_provider_observation');

    const admission = assessProviderSilenceEmptyCoreAdmission({
      operationalInactiveMs: WORKER_NOW.getTime() - PROVIDER_ANCHOR.getTime(),
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      vlsEvidence,
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostMovement: false,
      trustedStopBoundaryPresent: false,
      providerSilenceAnchorAt: PROVIDER_ANCHOR,
      lastMeaningfulMovementAt: LAST_MOVEMENT,
      workerNow: WORKER_NOW,
    });
    expect(admission.eligible).toBe(true);
    expect(admission.reason).toBe('provider_silence_empty_core_admission');
    expect(admission.silenceCandidate?.anchorAt.toISOString()).toBe(
      PROVIDER_ANCHOR.toISOString(),
    );
    expect(admission.silenceCandidate?.trust).toBe(false);
  });

  it('blocks when credible post-stop movement appears', () => {
    const admission = assessProviderSilenceEmptyCoreAdmission({
      operationalInactiveMs: WORKER_NOW.getTime() - PROVIDER_ANCHOR.getTime(),
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      vlsEvidence: staleVlsEvidence(),
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostMovement: true,
      trustedStopBoundaryPresent: false,
      providerSilenceAnchorAt: PROVIDER_ANCHOR,
      lastMeaningfulMovementAt: LAST_MOVEMENT,
      workerNow: WORKER_NOW,
    });
    expect(admission.eligible).toBe(false);
    expect(admission.reason).toBe('post_stop_movement_detected');
  });

  it('blocks fresh VLS ACTIVE', () => {
    const freshActive = classifyEmptyCoreVlsInactivity({
      telemetry: {
        isIgnitionOn: true,
        speedKmh: 25,
        engineLoad: 20,
        sourceTimestamp: WORKER_NOW,
      },
      profile: 'ICE',
      workerNow: WORKER_NOW,
      maxObservationAgeMs: MIN_INACTIVITY,
      stopBoundaryAt: null,
    });
    const admission = assessProviderSilenceEmptyCoreAdmission({
      operationalInactiveMs: MIN_INACTIVITY + 10_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      vlsEvidence: freshActive,
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostMovement: false,
      trustedStopBoundaryPresent: false,
      providerSilenceAnchorAt: PROVIDER_ANCHOR,
      workerNow: WORKER_NOW,
    });
    expect(admission.eligible).toBe(false);
    expect(admission.reason).toBe('vls_not_stale_provider_silence');
  });

  it('blocks short provider outage below liveness bound', () => {
    const earlyNow = new Date(PROVIDER_ANCHOR.getTime() + MIN_INACTIVITY - 5_000);
    const admission = assessProviderSilenceEmptyCoreAdmission({
      operationalInactiveMs: MIN_INACTIVITY - 5_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      vlsEvidence: classifyEmptyCoreVlsInactivity({
        telemetry: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: PROVIDER_ANCHOR,
        },
        profile: 'ICE',
        workerNow: earlyNow,
        maxObservationAgeMs: MIN_INACTIVITY,
        stopBoundaryAt: null,
      }),
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostMovement: false,
      trustedStopBoundaryPresent: false,
      providerSilenceAnchorAt: PROVIDER_ANCHOR,
      lastMeaningfulMovementAt: LAST_MOVEMENT,
      workerNow: earlyNow,
    });
    expect(admission.eligible).toBe(false);
    expect(admission.reason).toBe('operational_inactivity_below_threshold');
  });

  it('prefers trusted boundary-backed path over silence admission', () => {
    const stopBoundary = new Date('2026-09-13T10:22:00.000Z');
    const gate = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: WORKER_NOW.getTime() - stopBoundary.getTime(),
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 39.6,
        sourceTimestamp: PROVIDER_ANCHOR,
      },
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow: WORKER_NOW,
      stopBoundaryAt: stopBoundary,
      stopBoundarySource: 'provider_stationary_vls',
      providerSilenceAnchorAt: PROVIDER_ANCHOR,
      lastMeaningfulMovementAt: LAST_MOVEMENT,
    });
    expect(gate.eligible).toBe(true);
    expect(gate.forensics.innerGateReason).toBe('boundary_backed_provider_silence');
    expect(gate.forensics.providerSilenceAdmissionEligible).toBeUndefined();
  });

  it('fresh INACTIVE VLS still uses direct corroboration path', () => {
    const freshNow = new Date(PROVIDER_ANCHOR.getTime() + 30_000);
    const gate = assessSuccessfulEmptyCoreEndEligibility({
      operationalInactiveMs: MIN_INACTIVITY + 5_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 0,
        sourceTimestamp: PROVIDER_ANCHOR,
      },
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow: freshNow,
      stopBoundaryAt: null,
      providerSilenceAnchorAt: PROVIDER_ANCHOR,
      lastMeaningfulMovementAt: LAST_MOVEMENT,
    });
    expect(gate.eligible).toBe(true);
    expect(gate.forensics.innerGateReason).toBe('empty_core_corroborated_inactivity');
  });

  it('resolvePossibleEndBoundaryCandidate uses silence candidate instead of movement fallback', () => {
    const endBoundary = resolvePossibleEndBoundaryCandidate({
      silenceEndCandidate: {
        anchorAt: PROVIDER_ANCHOR,
        source: 'provider_silence_candidate',
        clockAuthority: 'PROVIDER_EVENT_TIME',
        trust: false,
      },
      lastMeaningfulMovementAt: LAST_MOVEMENT,
      workerNow: WORKER_NOW,
    });
    expect(endBoundary.boundaryAt.toISOString()).toBe(PROVIDER_ANCHOR.toISOString());
    expect(endBoundary.clockSource).toBe('PROVIDER_EVENT_TIME');
  });

  it('route motion after movement anchor invalidates silence admission', () => {
    expect(
      hasCrediblePostBoundaryRouteMotion(
        [
          {
            latitude: 51.33,
            longitude: 9.5,
            speedKmh: 20,
            timestamp: '2026-09-13T10:24:00.000Z',
          },
        ],
        'ICE',
        LAST_MOVEMENT,
      ),
    ).toBe(true);
  });

  it('retired trusted boundary alone cannot authorize silence admission', () => {
    const admission = assessProviderSilenceEmptyCoreAdmission({
      operationalInactiveMs: WORKER_NOW.getTime() - PROVIDER_ANCHOR.getTime(),
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      vlsEvidence: staleVlsEvidence(),
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostMovement: false,
      trustedStopBoundaryPresent: true,
      providerSilenceAnchorAt: PROVIDER_ANCHOR,
      lastMeaningfulMovementAt: LAST_MOVEMENT,
      workerNow: WORKER_NOW,
    });
    expect(admission.eligible).toBe(false);
    expect(admission.reason).toBe('trusted_stop_boundary_present');
  });

  it('does not promote stale VLS to fresh INACTIVE', () => {
    const vlsEvidence = staleVlsEvidence();
    expect(vlsEvidence.state).toBe('UNKNOWN');
    expect(vlsEvidence.reason).toBe('vls_stale_provider_observation');
  });

  it('missing provider silence anchor cannot admit', () => {
    const admission = assessProviderSilenceEmptyCoreAdmission({
      operationalInactiveMs: MIN_INACTIVITY + 10_000,
      minInactivityBeforeCusumMs: MIN_INACTIVITY,
      vlsEvidence: staleVlsEvidence(),
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostMovement: false,
      trustedStopBoundaryPresent: false,
      providerSilenceAnchorAt: null,
      lastMeaningfulMovementAt: LAST_MOVEMENT,
      workerNow: WORKER_NOW,
    });
    expect(admission.eligible).toBe(false);
    expect(admission.reason).toBe('provider_silence_anchor_missing');
  });
});
