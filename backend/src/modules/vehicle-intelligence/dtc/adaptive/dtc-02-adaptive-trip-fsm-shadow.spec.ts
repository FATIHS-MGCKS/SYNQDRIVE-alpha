import { TripDetectionState } from '@prisma/client';
import { DTC02_MIN_SHADOW_INTERVAL_MS } from './dtc-02-adaptive-planner.constants';
import {
  applyTripFsmEventPhaseOverride,
  runDtc02AdaptiveShadowOnTripFsmEvent,
} from './dtc-02-adaptive-trip-fsm-shadow.hook';
import {
  buildDtc02TripFsmShadowDedupeKey,
  tryAcquireDtc02TripFsmShadowDedupe,
} from './dtc-02-adaptive-trip-fsm-shadow.dedupe';
import { buildDtc02TripVsiPlannerContext } from './dtc-02-adaptive-trip-vsi.resolver';
import { planDtc02AdaptivePollCheck } from './dtc-02-adaptive-planner';
import type { Dtc02AdaptivePlannerInput } from './dtc-02-adaptive-planner.types';
import { applyDtc02P6TripVsiShadowOverlay } from './dtc-02-adaptive-p6-trip-vsi.overlay';

const T0 = Date.parse('2026-10-22T12:00:00Z');
const VID = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const TRIP = 'trip-1';

describe('dtc-02-adaptive-trip-fsm-shadow', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('dedupe key is stable per vehicle/trip/event', () => {
    expect(
      buildDtc02TripFsmShadowDedupeKey({
        vehicleId: VID,
        tripId: TRIP,
        eventKind: 'trip_start_confirmed',
      }),
    ).toContain(VID);
  });

  it('memory dedupe blocks duplicate shadow runs (dual-instance fallback)', async () => {
    const key = 'test-dedupe-key';
    expect(await tryAcquireDtc02TripFsmShadowDedupe({ dedupeKey: key })).toBe(true);
    expect(await tryAcquireDtc02TripFsmShadowDedupe({ dedupeKey: key })).toBe(false);
  });

  it('event hook skips when shadow disabled', async () => {
    delete process.env.DTC_02_ADAPTIVE_SCHEDULER_SHADOW_ENABLED;
    const result = await runDtc02AdaptiveShadowOnTripFsmEvent({
      prisma: {} as never,
      vehicleId: VID,
      tripId: TRIP,
      eventKind: 'trip_start_confirmed',
      evaluatedAtMs: T0,
    });
    expect(result).toBe('skipped_disabled');
  });

  it('forces TRIP_START phase on start-confirmed event', () => {
    const ctx = buildDtc02TripVsiPlannerContext({
      evaluatedAtMs: T0,
      inTripInterval: true,
      tripDetectionState: TripDetectionState.ACTIVE_TRIP,
      lastActivityAtMs: T0,
      possibleStartEnteredAtMs: null,
      possibleEndEnteredAtMs: null,
      vsiDtcLastSourceTimestamp: new Date(T0 - 60_000).toISOString(),
      tripFsmTransitionMaxAgeMs: 20 * 60_000,
      lastPollOrIntentAtMs: T0 - 2 * 60 * 60_000,
    });
    const forced = applyTripFsmEventPhaseOverride(ctx, 'trip_start_confirmed', T0);
    expect(forced.tripPhase).toBe('TRIP_START');
  });

  it('short trip: start event then end event with recent poll coalesces end intent', () => {
    const base = {
      registryLifecycle: 'ACTIVE',
      providerCapability: 'dimo_linked' as const,
      lastSuccessfulDtcCheckAtMs: T0 - 60 * 60_000,
      lastPollFetchAtMs: T0 - 5 * 60_000,
      lastConfirmedCompleteSourceAtMs: T0 - 45 * 60_000,
      lastPartialWebhookSourceAtMs: null,
      webhookEvidenceQuality: 'complete' as const,
      hasActiveDtc: false,
      providerErrorState: 'none' as const,
      evaluatedAtMs: T0,
    };
    const tripVsiEnd = applyTripFsmEventPhaseOverride(
      buildDtc02TripVsiPlannerContext({
        evaluatedAtMs: T0,
        inTripInterval: false,
        tripDetectionState: TripDetectionState.RESTING,
        lastActivityAtMs: T0 - 8 * 60_000,
        possibleStartEnteredAtMs: null,
        possibleEndEnteredAtMs: T0 - 8 * 60_000,
        vsiDtcLastSourceTimestamp: new Date(T0 - 60_000).toISOString(),
        tripFsmTransitionMaxAgeMs: 20 * 60_000,
        lastPollOrIntentAtMs: T0 - 5 * 60_000,
      }),
      'trip_end_finalized',
      T0,
    );
    const plan = planDtc02AdaptivePollCheck({ ...base, tripVsiContext: tripVsiEnd });
    expect(plan.decisionReason).toBe('P6_TRIP_BOUNDARY_COALESCED_WITH_RECENT_POLL');
  });

  it('delayed FSM reconstruction on fan-out tick does not trip-start (20m gate)', () => {
    const ctx = buildDtc02TripVsiPlannerContext({
      evaluatedAtMs: T0,
      inTripInterval: false,
      tripDetectionState: TripDetectionState.POSSIBLE_START,
      lastActivityAtMs: null,
      possibleStartEnteredAtMs: T0 - 25 * 60_000,
      possibleEndEnteredAtMs: null,
      vsiDtcLastSourceTimestamp: new Date(T0 - 60_000).toISOString(),
      tripFsmTransitionMaxAgeMs: 20 * 60_000,
      lastPollOrIntentAtMs: T0 - 2 * 60 * 60_000,
    });
    expect(ctx.tripPhase).toBe('STANDBY');
  });

  it('stale VSI DTC timestamp blocks acceleration on trip end event overlay', () => {
    const input: Dtc02AdaptivePlannerInput = {
      registryLifecycle: 'ACTIVE',
      providerCapability: 'dimo_linked',
      lastSuccessfulDtcCheckAtMs: T0 - 60 * 60_000,
      lastPollFetchAtMs: T0 - 2 * 60 * 60_000,
      lastConfirmedCompleteSourceAtMs: T0 - 45 * 60_000,
      lastPartialWebhookSourceAtMs: null,
      webhookEvidenceQuality: 'complete',
      hasActiveDtc: false,
      providerErrorState: 'none',
      evaluatedAtMs: T0,
    };
    const base = planDtc02AdaptivePollCheck(input);
    const overlay = applyDtc02P6TripVsiShadowOverlay(
      base,
      input,
      applyTripFsmEventPhaseOverride(
        buildDtc02TripVsiPlannerContext({
          evaluatedAtMs: T0,
          inTripInterval: false,
          tripDetectionState: TripDetectionState.RESTING,
          lastActivityAtMs: T0 - 10 * 60_000,
          possibleStartEnteredAtMs: null,
          possibleEndEnteredAtMs: T0 - 10 * 60_000,
          vsiDtcLastSourceTimestamp: new Date(T0 - 48 * 60 * 60_000).toISOString(),
          tripFsmTransitionMaxAgeMs: 20 * 60_000,
          lastPollOrIntentAtMs: T0 - 2 * 60 * 60_000,
        }),
        'trip_end_finalized',
        T0,
      ),
    );
    expect(overlay.decisionReason).toBe('P6_VSI_STALE_NO_REPEAT_POLL');
  });

  it('trip start event overlay accelerates within legacy bound when VSI fresh', () => {
    const input: Dtc02AdaptivePlannerInput = {
      registryLifecycle: 'ACTIVE',
      providerCapability: 'dimo_linked',
      lastSuccessfulDtcCheckAtMs: T0 - 60 * 60_000,
      lastPollFetchAtMs: T0 - 2 * 60 * 60_000,
      lastConfirmedCompleteSourceAtMs: T0 - 45 * 60_000,
      lastPartialWebhookSourceAtMs: null,
      webhookEvidenceQuality: 'complete',
      hasActiveDtc: false,
      providerErrorState: 'none',
      evaluatedAtMs: T0,
    };
    const base = planDtc02AdaptivePollCheck(input);
    const overlay = applyDtc02P6TripVsiShadowOverlay(
      base,
      input,
      applyTripFsmEventPhaseOverride(
        buildDtc02TripVsiPlannerContext({
          evaluatedAtMs: T0,
          inTripInterval: true,
          tripDetectionState: TripDetectionState.ACTIVE_TRIP,
          lastActivityAtMs: T0,
          possibleStartEnteredAtMs: T0 - 2 * 60_000,
          possibleEndEnteredAtMs: null,
          vsiDtcLastSourceTimestamp: new Date(T0 - 60_000).toISOString(),
          tripFsmTransitionMaxAgeMs: 20 * 60_000,
          lastPollOrIntentAtMs: T0 - 2 * 60 * 60_000,
        }),
        'trip_start_confirmed',
        T0,
      ),
    );
    expect(overlay.decisionReason).toBe('P6_TRIP_START_AFTER_VSI_FRESH_GATE');
    expect(overlay.proposedNextCheckAtMs).toBe(T0 + DTC02_MIN_SHADOW_INTERVAL_MS);
  });
});
