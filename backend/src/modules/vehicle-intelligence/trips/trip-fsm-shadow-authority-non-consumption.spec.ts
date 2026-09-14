import { TripDetectionState } from '@prisma/client';
import { assessSuccessfulEmptyCoreEndEligibility } from './trip-empty-core-end-gate';
import { resolvePossibleEndBoundaryCandidate } from './trip-fsm-clock-contract';
import {
  evaluateEndCycleJobAdmission,
  resolveEndValidationAttemptsOnPossibleEndReentry,
} from './trip-end-cycle-reset';
import {
  readEmptyCoreDeferralStreak,
  readStopBoundaryAt,
  readStopBoundaryProvenance,
} from './trip-fsm-evidence-state';
import { mergeShadowObservabilityIntoSummary } from './trip-fsm-shadow-summary.builder';
import { evaluateProviderSilenceShadow } from './trip-fsm-shadow-provider-silence.evaluator';
import { runShadowActiveTickObservation } from './trip-fsm-shadow-observability.integration';

const BASE_SUMMARY = {
  stopBoundaryAt: '2026-09-13T10:20:00.000Z',
  stopBoundarySource: 'provider_stationary_vls',
  stopBoundaryClockAuthority: 'PROVIDER_EVENT_TIME',
  stopBoundaryTrust: true,
  emptyCoreDeferralStreak: 2,
  providerSilenceCandidateAt: '2026-09-13T10:23:00.000Z',
  providerSilenceCandidateSource: 'provider_silence_candidate',
  providerSilenceCandidateClockAuthority: 'PROVIDER_EVENT_TIME',
  providerSilenceCandidateTrust: false,
};

const SHADOW_SUMMARY = mergeShadowObservabilityIntoSummary(BASE_SUMMARY, {
  providerSilence: {
    everEvaluated: true,
    everEligible: true,
    firstEligibleAt: '2026-09-13T10:25:00.000Z',
    candidateAt: '2026-09-13T10:23:00.000Z',
    candidateSource: 'provider_silence_candidate',
    trust: false,
    clockAuthority: 'PROVIDER_EVENT_TIME',
    realWinningEndPath: 'CLICKHOUSE_END_ASSIST',
    invalidatedByMovement: false,
    blockedReasons: [],
    lastEvaluation: null,
    evaluationCount: 3,
    candidateEndCycleGeneration: 'stale-token',
    candidateTripId: 'trip-a',
    counterfactualStatus: 'OBSERVED_ELIGIBLE',
  },
  pause: {
    activeEpisodeId: null,
    episodeCount: 1,
    resumedEpisodeCount: 1,
    longestPauseMs: 90_000,
    sameTripResumeCount: 1,
    newTripAfterTerminalCount: 0,
    ambiguousCount: 0,
    episodes: [],
  },
});

function stripShadow(summary: Record<string, unknown>): Record<string, unknown> {
  const { shadowObservability: _shadow, ...rest } = summary;
  return rest;
}

describe('trip-fsm-shadow authority reader non-consumption', () => {
  const workerNow = new Date('2026-09-13T10:26:00.000Z');

  it('readStopBoundaryProvenance ignores shadowObservability', () => {
    expect(readStopBoundaryProvenance(BASE_SUMMARY)).toEqual(
      readStopBoundaryProvenance(SHADOW_SUMMARY),
    );
  });

  it('readStopBoundaryAt ignores shadowObservability', () => {
    expect(readStopBoundaryAt(BASE_SUMMARY)?.toISOString()).toBe(
      readStopBoundaryAt(SHADOW_SUMMARY)?.toISOString(),
    );
  });

  it('readEmptyCoreDeferralStreak ignores shadowObservability', () => {
    expect(readEmptyCoreDeferralStreak(BASE_SUMMARY)).toBe(
      readEmptyCoreDeferralStreak(SHADOW_SUMMARY),
    );
  });

  it('resolvePossibleEndBoundaryCandidate ignores shadowObservability', () => {
    const provenance = readStopBoundaryProvenance(BASE_SUMMARY);
    const base = resolvePossibleEndBoundaryCandidate({
      stopBoundaryProvenance: provenance,
      lastMeaningfulMovementAt: new Date('2026-09-13T10:14:00.000Z'),
      workerNow,
    });
    const withShadow = resolvePossibleEndBoundaryCandidate({
      stopBoundaryProvenance: readStopBoundaryProvenance(SHADOW_SUMMARY),
      lastMeaningfulMovementAt: new Date('2026-09-13T10:14:00.000Z'),
      workerNow,
    });
    expect(withShadow).toEqual(base);
  });

  it('resolveEndValidationAttemptsOnPossibleEndReentry ignores shadowObservability', () => {
    const det = {
      priorState: TripDetectionState.ACTIVE_TRIP,
      endValidationAttempts: 1,
      priorSummary: BASE_SUMMARY,
      workerNow,
      lastMeaningfulMovementAt: new Date('2026-09-13T10:14:00.000Z'),
      candidateStopBoundary: readStopBoundaryProvenance(BASE_SUMMARY),
    };
    expect(
      resolveEndValidationAttemptsOnPossibleEndReentry({
        ...det,
        priorSummary: SHADOW_SUMMARY,
      }),
    ).toBe(resolveEndValidationAttemptsOnPossibleEndReentry(det));
  });

  it('evaluateEndCycleJobAdmission ignores shadowObservability', () => {
    const det = {
      state: TripDetectionState.POSSIBLE_END,
      possibleEndEnteredAt: new Date('2026-09-13T10:24:00.000Z'),
      activeTripId: 'trip-a',
      lastEvidenceSummary: BASE_SUMMARY,
    };
    expect(
      evaluateEndCycleJobAdmission({
        det: { ...det, lastEvidenceSummary: SHADOW_SUMMARY },
        job: { endCycleToken: '2026-09-13T10:24:00.000Z' },
      }),
    ).toBe(
      evaluateEndCycleJobAdmission({
        det,
        job: { endCycleToken: '2026-09-13T10:24:00.000Z' },
      }),
    );
  });

  it('assessSuccessfulEmptyCoreEndEligibility ignores shadowObservability in unrelated summary fields', () => {
    const params = {
      operationalInactiveMs: 130_000,
      minInactivityBeforeCusumMs: 120_000,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 39,
        sourceTimestamp: new Date('2026-09-13T10:23:00.000Z'),
      },
      perfReadings: [],
      routePoints: [],
      profile: 'ICE',
      workerNow,
      stopBoundaryAt: readStopBoundaryAt(BASE_SUMMARY),
      providerSilenceAnchorAt: new Date('2026-09-13T10:23:00.000Z'),
      lastMeaningfulMovementAt: new Date('2026-09-13T10:14:00.000Z'),
    };
    const withoutShadow = assessSuccessfulEmptyCoreEndEligibility(params);
    const withShadow = assessSuccessfulEmptyCoreEndEligibility(params);
    expect(withShadow).toEqual(withoutShadow);
  });

  it('shadow evaluation does not mutate authoritative input snapshot', () => {
    process.env.TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED = 'true';
    process.env.TRIP_FSM_SHADOW_VEHICLE_IDS = 'vehicle-a';
    const prior = { ...BASE_SUMMARY };
    const frozenPrior = JSON.parse(JSON.stringify(prior));
    runShadowActiveTickObservation({
      vehicleId: 'vehicle-a',
      tripId: 'trip-a',
      activeTripId: 'trip-a',
      fsmState: TripDetectionState.ACTIVE_TRIP,
      workerNow,
      operationalInactiveMs: 130_000,
      minInactivityBeforeCusumMs: 120_000,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 39,
        sourceTimestamp: new Date('2026-09-13T10:23:00.000Z'),
      },
      profile: 'ICE',
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostMovement: false,
      providerSilenceAnchorAt: new Date('2026-09-13T10:23:00.000Z'),
      endCycleGeneration: 'token-b',
      priorSummary: prior,
      evaluateProviderSilence: true,
    });
    expect(stripShadow(prior)).toEqual(frozenPrior);
  });

  it('pure evaluateProviderSilenceShadow does not mutate params object', () => {
    const params = {
      operationalInactiveMs: 130_000,
      minInactivityBeforeCusumMs: 120_000,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 39,
        sourceTimestamp: new Date('2026-09-13T10:23:00.000Z'),
      },
      profile: 'ICE',
      workerNow,
      performanceActivity: false,
      routeMotion: false,
      hasCrediblePostMovement: false,
      providerSilenceAnchorAt: new Date('2026-09-13T10:23:00.000Z'),
      activeTripId: 'trip-a',
      observedTripId: 'trip-a',
      currentEndCycleGeneration: 'token-b',
      storedCandidateEndCycleGeneration: 'token-a',
    };
    const snapshot = (value: typeof params) =>
      JSON.parse(JSON.stringify(value));
    const before = snapshot(params);
    evaluateProviderSilenceShadow(params);
    expect(snapshot(params)).toEqual(before);
  });
});
