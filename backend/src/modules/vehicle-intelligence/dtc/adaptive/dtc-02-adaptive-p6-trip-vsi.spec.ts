import { TripDetectionState } from '@prisma/client';
import {
  DTC02_LEGACY_POLL_INTERVAL_MS,
  DTC02_MIN_SHADOW_INTERVAL_MS,
  DTC02_STANDBY_RECONCILE_INTERVAL_MS,
  DTC02_TRIP_FSM_TRANSITION_MAX_AGE_MS,
} from './dtc-02-adaptive-planner.constants';
import { planDtc02AdaptivePollCheck } from './dtc-02-adaptive-planner';
import type { Dtc02AdaptivePlannerInput } from './dtc-02-adaptive-planner.types';
import { buildDtc02TripVsiPlannerContext } from './dtc-02-adaptive-trip-vsi.resolver';
import type { Dtc02TripVsiResolverInput } from './dtc-02-adaptive-trip-vsi.types';
import { extractVsiDiagnosticTroubleCodeLastSourceTimestamp } from './dtc-02-adaptive-vsi-snapshot.util';
import type { Dtc02TripVsiPlannerContext } from './dtc-02-adaptive-trip-vsi.types';

const T0 = Date.parse('2026-10-22T12:00:00Z');

function baseInput(overrides: Partial<Dtc02AdaptivePlannerInput> = {}): Dtc02AdaptivePlannerInput {
  return {
    registryLifecycle: 'ACTIVE',
    providerCapability: 'dimo_linked',
    lastSuccessfulDtcCheckAtMs: T0 - 60 * 60_000,
    lastPollFetchAtMs: T0 - 30 * 60_000,
    lastConfirmedCompleteSourceAtMs: T0 - 45 * 60_000,
    lastPartialWebhookSourceAtMs: null,
    webhookEvidenceQuality: 'complete',
    hasActiveDtc: false,
    providerErrorState: 'none',
    evaluatedAtMs: T0,
    ...overrides,
  };
}

function tripVsi(
  resolverOverrides: Partial<
    Dtc02TripVsiResolverInput & { lastPollOrIntentAtMs: number | null }
  > = {},
  contextPatch: Partial<Dtc02TripVsiPlannerContext> = {},
): Dtc02TripVsiPlannerContext {
  const base = buildDtc02TripVsiPlannerContext({
    evaluatedAtMs: T0,
    inTripInterval: false,
    tripDetectionState: TripDetectionState.RESTING,
    lastActivityAtMs: null,
    possibleStartEnteredAtMs: null,
    possibleEndEnteredAtMs: null,
    vsiDtcLastSourceTimestamp: new Date(T0 - 5 * 60_000).toISOString(),
    tripFsmTransitionMaxAgeMs: DTC02_TRIP_FSM_TRANSITION_MAX_AGE_MS,
    lastPollOrIntentAtMs: T0 - 30 * 60_000,
    ...resolverOverrides,
  });
  return { ...base, ...contextPatch };
}

describe('DTC-02 P6 Trip FSM × VSI shadow overlay', () => {
  it('extracts diagnostic_trouble_code timestamp from VSI snapshot', () => {
    const ts = extractVsiDiagnosticTroubleCodeLastSourceTimestamp([
      { canonicalSignalKey: 'speed', lastSourceTimestamp: '2020-01-01T00:00:00.000Z' },
      {
        canonicalSignalKey: 'diagnostic_trouble_code',
        lastSourceTimestamp: '2026-10-22T11:55:00.000Z',
      },
    ]);
    expect(ts).toBe('2026-10-22T11:55:00.000Z');
  });

  it('fail-closed when VSI DTC freshness is unknown', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({
        tripVsiContext: tripVsi({}, { vsiDtcFreshness: 'UNKNOWN' }),
      }),
    );
    expect(plan.decisionReason).toBe('P6_FAIL_CLOSED_VSI_DTC_FRESHNESS_UNKNOWN');
    expect(plan.proposedNextCheckAtMs).toBe(plan.legacyNextCheckAtMs);
  });

  it('does not accelerate when VSI reports stale provider data', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({
        tripVsiContext: tripVsi(
          { vsiDtcLastSourceTimestamp: new Date(T0 - 48 * 60 * 60_000).toISOString() },
          { vsiDtcFreshness: 'STALE', tripPhase: 'TRIP_START' },
        ),
      }),
    );
    expect(plan.decisionReason).toBe('P6_VSI_STALE_NO_REPEAT_POLL');
    expect(plan.proposedNextCheckAtMs).toBe(plan.legacyNextCheckAtMs);
  });

  it('trip START with fresh VSI proposes min-spacing poll within legacy bound', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({
        lastPollFetchAtMs: T0 - 2 * 60 * 60_000,
        tripVsiContext: tripVsi(
          {
            tripDetectionState: TripDetectionState.POSSIBLE_START,
            possibleStartEnteredAtMs: T0 - 2 * 60_000,
            lastPollOrIntentAtMs: T0 - 2 * 60 * 60_000,
          },
          { tripPhase: 'TRIP_START', vsiDtcFreshness: 'FRESH' },
        ),
      }),
    );
    expect(plan.decisionReason).toBe('P6_TRIP_START_AFTER_VSI_FRESH_GATE');
    expect(plan.proposedNextCheckAtMs).toBe(T0 + DTC02_MIN_SHADOW_INTERVAL_MS);
    expect(plan.proposedNextCheckAtMs).toBeLessThanOrEqual(plan.legacyNextCheckAtMs);
  });

  it('coalesces START and END within 15 minutes of last poll intent', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({
        tripVsiContext: tripVsi(
          {
            tripDetectionState: TripDetectionState.POSSIBLE_END,
            possibleEndEnteredAtMs: T0 - 3 * 60_000,
            lastPollOrIntentAtMs: T0 - 5 * 60_000,
          },
          { tripPhase: 'TRIP_END', vsiDtcFreshness: 'FRESH' },
        ),
      }),
    );
    expect(plan.decisionReason).toBe('P6_TRIP_BOUNDARY_COALESCED_WITH_RECENT_POLL');
    expect(plan.proposedNextCheckAtMs).toBe(plan.legacyNextCheckAtMs);
  });

  it('trip ACTIVE keeps webhook-first deferral at legacy horizon', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({
        tripVsiContext: tripVsi(
          { inTripInterval: true, tripDetectionState: TripDetectionState.ACTIVE_TRIP },
          { tripPhase: 'TRIP_ACTIVE', vsiDtcFreshness: 'FRESH' },
        ),
      }),
    );
    expect(plan.decisionReason).toBe('P6_TRIP_ACTIVE_WEBHOOK_FIRST_SHADOW');
    expect(plan.proposedNextCheckAtMs).toBe(plan.legacyNextCheckAtMs);
  });

  it('standby with fresh confirmed complete projects 24h hypothetical horizon', () => {
    const successAt = T0 - 60 * 60_000;
    const plan = planDtc02AdaptivePollCheck(
      baseInput({
        lastSuccessfulDtcCheckAtMs: successAt,
        tripVsiContext: tripVsi({}, { tripPhase: 'STANDBY', vsiDtcFreshness: 'FRESH' }),
      }),
    );
    expect(plan.decisionReason).toBe('P6_STANDBY_FRESH_DATA_24H_HYPOTHETICAL');
    expect(plan.hypotheticalNextCheckAtMs).toBe(successAt + DTC02_STANDBY_RECONCILE_INTERVAL_MS);
    expect(plan.hypotheticalPollReductionMs).toBeGreaterThan(0);
    expect(plan.proposedNextCheckAtMs).toBeLessThanOrEqual(plan.legacyNextCheckAtMs);
  });

  it('ignores delayed trip FSM start beyond max age (resolver → STANDBY)', () => {
    const ctx = buildDtc02TripVsiPlannerContext({
      evaluatedAtMs: T0,
      inTripInterval: false,
      tripDetectionState: TripDetectionState.POSSIBLE_START,
      lastActivityAtMs: null,
      possibleStartEnteredAtMs: T0 - 3 * 60 * 60_000,
      possibleEndEnteredAtMs: null,
      vsiDtcLastSourceTimestamp: new Date(T0 - 5 * 60_000).toISOString(),
      tripFsmTransitionMaxAgeMs: DTC02_TRIP_FSM_TRANSITION_MAX_AGE_MS,
      lastPollOrIntentAtMs: T0 - 2 * 60 * 60_000,
    });
    expect(ctx.tripPhase).toBe('STANDBY');
  });

  it('active DTC episode still accelerates under P3 before overlay constraints', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({
        hasActiveDtc: true,
        tripVsiContext: tripVsi({}, { tripPhase: 'STANDBY', vsiDtcFreshness: 'FRESH' }),
      }),
    );
    expect(plan.proposedNextCheckAtMs).toBeLessThan(plan.legacyNextCheckAtMs);
    expect(plan.safetyConstraints).toContain('NO_FALSE_CLEAR_AUTHORIZATION');
  });

  it('legacy 3h anchor unchanged', () => {
    const input = baseInput();
    const plan = planDtc02AdaptivePollCheck({
      ...input,
      tripVsiContext: tripVsi(),
    });
    expect(plan.legacyNextCheckAtMs).toBe(
      (input.lastSuccessfulDtcCheckAtMs ?? T0) + DTC02_LEGACY_POLL_INTERVAL_MS,
    );
  });
});
