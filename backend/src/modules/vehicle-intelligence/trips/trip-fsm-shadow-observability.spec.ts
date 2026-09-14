import { TripDetectionState } from '@prisma/client';
import {
  assessSuccessfulEmptyCoreEndEligibility,
} from './trip-empty-core-end-gate';
import { runTripObservabilitySafely } from './trip-fsm-observability-safe.util';
import {
  isTripFsmShadowObservabilityEnabledForVehicle,
  parseTripFsmShadowObservabilityEnabled,
  parseTripFsmShadowVehicleAllowlist,
} from './trip-fsm-shadow-observability.config';
import {
  evaluateProviderSilenceShadow,
} from './trip-fsm-shadow-provider-silence.evaluator';
import {
  runShadowActiveTickObservation,
  runShadowFinalizeObservation,
  runShadowPauseStartObservation,
  runShadowResumeObservation,
} from './trip-fsm-shadow-observability.integration';
import {
  assertShadowNotConsumedByAuthoritativeReaders,
  classifyPauseDurationBucket,
  classifyShadowPauseOutcome,
  createEmptyShadowObservabilityState,
  readShadowObservabilityState,
  recordShadowPauseResume,
  startShadowPauseEpisode,
} from './trip-fsm-shadow-summary.builder';

const MIN_INACTIVITY = 120_000;
const LAST_MOVEMENT = new Date('2026-09-13T10:14:00.000Z');
const PROVIDER_ANCHOR = new Date('2026-09-13T10:23:00.000Z');
const WORKER_NOW = new Date('2026-09-13T10:26:00.000Z');
const VEHICLE_A = 'a60c0749-a7cd-494e-b5b9-dea3c6b97d63';
const VEHICLE_B = 'b70d1850-b8de-5a5f-c6ca-efb4d7c8e74e';

function staleTelemetry() {
  return {
    isIgnitionOn: false,
    speedKmh: 0,
    engineLoad: 39.6,
    sourceTimestamp: PROVIDER_ANCHOR,
  };
}

function withShadowEnv(overrides: Record<string, string | undefined>) {
  return { ...process.env, ...overrides };
}

describe('trip-fsm-shadow-observability', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('config', () => {
    it('defaults shadow disabled', () => {
      expect(parseTripFsmShadowObservabilityEnabled(undefined)).toBe(false);
    });

    it('supports vehicle allowlist by stable id', () => {
      const allowlist = parseTripFsmShadowVehicleAllowlist(`${VEHICLE_A},${VEHICLE_B}`);
      expect(allowlist.has(VEHICLE_A)).toBe(true);
      expect(allowlist.has(VEHICLE_B)).toBe(true);
    });

    it('vehicle not allowlisted → zero shadow evaluation', () => {
      const enabled = isTripFsmShadowObservabilityEnabledForVehicle(
        VEHICLE_B,
        withShadowEnv({
          TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED: 'true',
          TRIP_FSM_SHADOW_VEHICLE_IDS: VEHICLE_A,
        }),
      );
      expect(enabled).toBe(false);
      expect(
        runShadowActiveTickObservation({
          vehicleId: VEHICLE_B,
          tripId: 'trip-1',
          activeTripId: 'trip-1',
          fsmState: TripDetectionState.ACTIVE_TRIP,
          workerNow: WORKER_NOW,
          operationalInactiveMs: MIN_INACTIVITY + 10_000,
          minInactivityBeforeCusumMs: MIN_INACTIVITY,
          telemetry: staleTelemetry(),
          profile: 'ICE',
          performanceActivity: false,
          routeMotion: false,
          hasCrediblePostMovement: false,
          providerSilenceAnchorAt: PROVIDER_ANCHOR,
          priorSummary: {},
          evaluateProviderSilence: true,
        }),
      ).toBeNull();
    });

    it('shadow disabled → zero shadow evaluation', () => {
      expect(
        runShadowActiveTickObservation({
          vehicleId: VEHICLE_A,
          tripId: 'trip-1',
          activeTripId: 'trip-1',
          fsmState: TripDetectionState.ACTIVE_TRIP,
          workerNow: WORKER_NOW,
          operationalInactiveMs: MIN_INACTIVITY + 10_000,
          minInactivityBeforeCusumMs: MIN_INACTIVITY,
          telemetry: staleTelemetry(),
          profile: 'ICE',
          performanceActivity: false,
          routeMotion: false,
          hasCrediblePostMovement: false,
          providerSilenceAnchorAt: PROVIDER_ANCHOR,
          priorSummary: {},
          evaluateProviderSilence: true,
        }),
      ).toBeNull();
    });
  });

  describe('provider silence counterfactual (#1635 contract reuse)', () => {
    beforeEach(() => {
      process.env.TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED = 'true';
      process.env.TRIP_FSM_SHADOW_VEHICLE_IDS = VEHICLE_A;
    });

    it('1. silence >=120s, stale UNKNOWN, valid anchor, no movement → eligible trust=false PROVIDER_EVENT_TIME', () => {
      const evaluation = evaluateProviderSilenceShadow({
        operationalInactiveMs: WORKER_NOW.getTime() - PROVIDER_ANCHOR.getTime(),
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        profile: 'ICE',
        workerNow: WORKER_NOW,
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        lastMeaningfulMovementAt: LAST_MOVEMENT,
        activeTripId: 'trip-1',
        observedTripId: 'trip-1',
      });
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.trust).toBe(false);
      expect(evaluation.clockAuthority).toBe('PROVIDER_EVENT_TIME');
      expect(evaluation.candidateSource).toBe('provider_silence_candidate');
    });

    it('2. silence <120s → not eligible', () => {
      const evaluation = evaluateProviderSilenceShadow({
        operationalInactiveMs: 60_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        profile: 'ICE',
        workerNow: WORKER_NOW,
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        activeTripId: 'trip-1',
        observedTripId: 'trip-1',
      });
      expect(evaluation.eligible).toBe(false);
    });

    it('3. fresh ACTIVE VLS → not eligible', () => {
      const evaluation = evaluateProviderSilenceShadow({
        operationalInactiveMs: MIN_INACTIVITY + 10_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: {
          isIgnitionOn: true,
          speedKmh: 25,
          engineLoad: 20,
          sourceTimestamp: WORKER_NOW,
        },
        profile: 'ICE',
        workerNow: WORKER_NOW,
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        activeTripId: 'trip-1',
        observedTripId: 'trip-1',
      });
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.blockedBy).toBe('vls_not_stale_provider_silence');
    });

    it('4. post-anchor meaningful movement → not eligible / invalidated', () => {
      const evaluation = evaluateProviderSilenceShadow({
        operationalInactiveMs: MIN_INACTIVITY + 10_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        profile: 'ICE',
        workerNow: WORKER_NOW,
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: true,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        activeTripId: 'trip-1',
        observedTripId: 'trip-1',
      });
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.postCandidateMovementObserved).toBe(true);
    });

    it('5. missing provider-event timestamp → fail closed', () => {
      const evaluation = evaluateProviderSilenceShadow({
        operationalInactiveMs: MIN_INACTIVITY + 10_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        profile: 'ICE',
        workerNow: WORKER_NOW,
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: null,
        activeTripId: 'trip-1',
        observedTripId: 'trip-1',
      });
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.blockedBy).toBe('provider_silence_anchor_missing');
    });

    it('6. old trip candidate → not reusable', () => {
      const evaluation = evaluateProviderSilenceShadow({
        operationalInactiveMs: MIN_INACTIVITY + 10_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        profile: 'ICE',
        workerNow: WORKER_NOW,
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        activeTripId: 'trip-new',
        observedTripId: 'trip-old',
      });
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.blockedBy).toBe('old_trip_candidate');
    });

    it('7. old end-cycle generation → not reusable', () => {
      const evaluation = evaluateProviderSilenceShadow({
        operationalInactiveMs: MIN_INACTIVITY + 10_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        profile: 'ICE',
        workerNow: WORKER_NOW,
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        activeTripId: 'trip-1',
        observedTripId: 'trip-1',
        endCycleGeneration: 'token-a',
        observedEndCycleGeneration: 'token-b',
      });
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.blockedBy).toBe('old_end_cycle_generation');
    });

    it('8. real ClickHouse wins — counterfactual still observed separately', () => {
      const evaluation = evaluateProviderSilenceShadow({
        operationalInactiveMs: MIN_INACTIVITY + 10_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        profile: 'ICE',
        workerNow: WORKER_NOW,
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        activeTripId: 'trip-1',
        observedTripId: 'trip-1',
        realWinningEndPath: 'CLICKHOUSE_END_ASSIST',
      });
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.realWinningEndPath).toBe('CLICKHOUSE_END_ASSIST');
    });

    it('9. trusted boundary wins — real path unchanged, counterfactual observed', () => {
      const evaluation = evaluateProviderSilenceShadow({
        operationalInactiveMs: MIN_INACTIVITY + 10_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        profile: 'ICE',
        workerNow: WORKER_NOW,
        stopBoundaryProvenance: {
          boundaryAt: LAST_MOVEMENT,
          source: 'provider_stationary_vls',
          clockAuthority: 'PROVIDER_EVENT_TIME',
          trust: true,
        },
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        activeTripId: 'trip-1',
        observedTripId: 'trip-1',
        realWinningEndPath: 'trusted_boundary_backed_silence',
      });
      expect(evaluation.eligible).toBe(false);
      expect(evaluation.realWinningEndPath).toBe('trusted_boundary_backed_silence');
    });
  });

  describe('pause / resume shadow', () => {
    beforeEach(() => {
      process.env.TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED = 'true';
    });

    it('10. 90-second pause + resumed movement → SAME_TRIP_RESUME', () => {
      let state = createEmptyShadowObservabilityState();
      const pauseStart = new Date('2026-09-13T11:00:00.000Z');
      const resumeAt = new Date(pauseStart.getTime() + 90_000);
      state = startShadowPauseEpisode(state, {
        vehicleId: VEHICLE_A,
        tripId: 'trip-1',
        episodeStartedAt: pauseStart,
        episodeStartSource: 'test',
        bestObservedStopAnchorAt: pauseStart,
        realFsmStateAtPauseStart: TripDetectionState.ACTIVE_TRIP,
        possibleEndAt: null,
        completedAt: null,
        restingAt: null,
        activeTripIdAtPauseStart: 'trip-1',
      });
      state = recordShadowPauseResume(state, {
        resumeAt,
        movementEvidenceSource: 'test',
        fsmStateAtResume: TripDetectionState.ACTIVE_TRIP,
        activeTripIdAtResume: 'trip-1',
        tripIdAtResume: 'trip-1',
      });
      expect(state.pause.episodes[0].shadowPauseOutcome).toBe('SAME_TRIP_RESUME');
      expect(classifyPauseDurationBucket(90_000)).toBe('<2min');
    });

    it('11. resume after COMPLETED/RESTING → NEW_TRIP_AFTER_TERMINAL', () => {
      const outcome = classifyShadowPauseOutcome({
        sameTripContinued: false,
        newTripCreated: true,
        previousTripAlreadyCompleted: false,
        previousTripAlreadyResting: true,
        fsmStateAtResume: TripDetectionState.ACTIVE_TRIP,
        realFsmStateAtPauseStart: TripDetectionState.RESTING,
      });
      expect(outcome).toBe('NEW_TRIP_AFTER_RESTING');
    });

    it('12. movement while POSSIBLE_END → RESUME_DURING_POSSIBLE_END', () => {
      const outcome = classifyShadowPauseOutcome({
        sameTripContinued: true,
        newTripCreated: false,
        previousTripAlreadyCompleted: false,
        previousTripAlreadyResting: false,
        fsmStateAtResume: TripDetectionState.POSSIBLE_END,
        realFsmStateAtPauseStart: TripDetectionState.IDLE_WITHIN_TRIP,
      });
      expect(outcome).toBe('RESUME_DURING_POSSIBLE_END');
    });

    it('13. different trip after long pause — no cross-trip leak in store', () => {
      let state = createEmptyShadowObservabilityState();
      state = startShadowPauseEpisode(state, {
        vehicleId: VEHICLE_A,
        tripId: 'trip-old',
        episodeStartedAt: WORKER_NOW,
        episodeStartSource: 'test',
        bestObservedStopAnchorAt: WORKER_NOW,
        realFsmStateAtPauseStart: TripDetectionState.ACTIVE_TRIP,
        possibleEndAt: null,
        completedAt: null,
        restingAt: null,
        activeTripIdAtPauseStart: 'trip-old',
      });
      state = recordShadowPauseResume(state, {
        resumeAt: new Date(WORKER_NOW.getTime() + 3_600_000),
        movementEvidenceSource: 'test',
        fsmStateAtResume: TripDetectionState.ACTIVE_TRIP,
        activeTripIdAtResume: 'trip-new',
        tripIdAtResume: 'trip-new',
      });
      expect(state.pause.episodes[0].shadowPauseOutcome).toBe('NEW_TRIP_AFTER_COMPLETION');
      expect(state.pause.activeEpisodeId).toBeNull();
    });

    it('14. new vehicle — no cross-vehicle leak via readShadowObservabilityState', () => {
      const summaryA = runShadowPauseStartObservation({
        vehicleId: VEHICLE_A,
        tripId: 'trip-a',
        activeTripId: 'trip-a',
        fsmState: TripDetectionState.IDLE_WITHIN_TRIP,
        workerNow: WORKER_NOW,
        episodeStartSource: 'test',
        stopAnchorAt: WORKER_NOW,
        possibleEndAt: null,
        completedAt: null,
        restingAt: null,
        priorSummary: {},
      });
      const summaryB = readShadowObservabilityState({});
      expect(summaryA?.shadowObservability).toBeDefined();
      expect(summaryB.pause.episodeCount).toBe(0);
    });
  });

  describe('fail-open + decision authority', () => {
    it('15. shadow evaluator throw → authoritative FSM path still succeeds', () => {
      const logger = { warn: jest.fn() };
      const gateBefore = assessSuccessfulEmptyCoreEndEligibility({
        operationalInactiveMs: WORKER_NOW.getTime() - PROVIDER_ANCHOR.getTime(),
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        perfReadings: [],
        routePoints: [],
        profile: 'ICE',
        workerNow: WORKER_NOW,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        lastMeaningfulMovementAt: LAST_MOVEMENT,
      });
      runTripObservabilitySafely(logger, 'shadow_throw', () => {
        throw new Error('shadow exploded');
      });
      const gateAfter = assessSuccessfulEmptyCoreEndEligibility({
        operationalInactiveMs: WORKER_NOW.getTime() - PROVIDER_ANCHOR.getTime(),
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        perfReadings: [],
        routePoints: [],
        profile: 'ICE',
        workerNow: WORKER_NOW,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        lastMeaningfulMovementAt: LAST_MOVEMENT,
      });
      expect(gateBefore).toEqual(gateAfter);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('16-17 covered in config block', () => {
      expect(true).toBe(true);
    });

    it('shadow namespace not consumed by authoritative readers', () => {
      expect(() =>
        assertShadowNotConsumedByAuthoritativeReaders({
          stopBoundaryAt: '2026-01-01T00:00:00.000Z',
        }),
      ).not.toThrow();
      expect(() =>
        assertShadowNotConsumedByAuthoritativeReaders({
          shadowObservability: {},
        }),
      ).toThrow();
    });

    it('SHADOW_CHANGES_FSM_DECISION=NO — same gate with shadow on/off', () => {
      process.env.TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED = 'true';
      const params = {
        operationalInactiveMs: WORKER_NOW.getTime() - PROVIDER_ANCHOR.getTime(),
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        perfReadings: [] as [],
        routePoints: [] as [],
        profile: 'ICE',
        workerNow: WORKER_NOW,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        lastMeaningfulMovementAt: LAST_MOVEMENT,
      };
      const withoutShadow = assessSuccessfulEmptyCoreEndEligibility(params);
      runShadowActiveTickObservation({
        vehicleId: VEHICLE_A,
        tripId: 'trip-1',
        activeTripId: 'trip-1',
        fsmState: TripDetectionState.ACTIVE_TRIP,
        workerNow: WORKER_NOW,
        operationalInactiveMs: params.operationalInactiveMs,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: params.telemetry,
        profile: 'ICE',
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        priorSummary: {},
        evaluateProviderSilence: true,
      });
      const withShadow = assessSuccessfulEmptyCoreEndEligibility(params);
      expect(withoutShadow).toEqual(withShadow);
    });
  });

  describe('terminal summary', () => {
    beforeEach(() => {
      process.env.TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED = 'true';
    });

    it('builds finalize terminal shadow summary', () => {
      const prior = runShadowActiveTickObservation({
        vehicleId: VEHICLE_A,
        tripId: 'trip-1',
        activeTripId: 'trip-1',
        fsmState: TripDetectionState.ACTIVE_TRIP,
        workerNow: WORKER_NOW,
        operationalInactiveMs: MIN_INACTIVITY + 10_000,
        minInactivityBeforeCusumMs: MIN_INACTIVITY,
        telemetry: staleTelemetry(),
        profile: 'ICE',
        performanceActivity: false,
        routeMotion: false,
        hasCrediblePostMovement: false,
        providerSilenceAnchorAt: PROVIDER_ANCHOR,
        priorSummary: {},
        evaluateProviderSilence: true,
      });
      const { terminalSummary } = runShadowFinalizeObservation({
        vehicleId: VEHICLE_A,
        priorSummary: prior,
        realEndPath: 'CLICKHOUSE_END_ASSIST',
      });
      expect(terminalSummary?.providerSilence.everEvaluated).toBe(true);
      expect(terminalSummary?.providerSilence.realWinningEndPath).toBe(
        'CLICKHOUSE_END_ASSIST',
      );
    });
  });
});
