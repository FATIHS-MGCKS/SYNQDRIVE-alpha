import { DTC02_LEGACY_POLL_INTERVAL_MS } from './dtc-02-adaptive-planner.constants';
import {
  computeLegacyNextCheckAtMs,
  deriveWebhookEvidenceQuality,
  planDtc02AdaptivePollCheck,
} from './dtc-02-adaptive-planner';
import type { Dtc02AdaptivePlannerInput } from './dtc-02-adaptive-planner.types';

const T0 = Date.parse('2026-10-15T12:00:00Z');

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

describe('planDtc02AdaptivePollCheck', () => {
  it('is deterministic on replay', () => {
    const input = baseInput();
    const a = planDtc02AdaptivePollCheck(input);
    const b = planDtc02AdaptivePollCheck(input);
    expect(a).toEqual(b);
  });

  it('excludes offboarded vehicles', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({ registryLifecycle: 'OFFBOARDED' }),
    );
    expect(plan.excluded).toBe(true);
    expect(plan.requiresLegacyFallback).toBe(true);
  });

  it('defers projected check when confirmed complete is fresh', () => {
    const input = baseInput({ webhookEvidenceQuality: 'complete' });
    const plan = planDtc02AdaptivePollCheck(input);
    expect(plan.decisionReason).toBe('FRESH_CONFIRMED_COMPLETE_DEFER_PROJECTED');
    expect(plan.proposedNextCheckAtMs).toBe(plan.legacyNextCheckAtMs);
    expect(plan.projectedPollReductionMs).toBe(0);
    expect(plan.safetyConstraints).toContain('BOUNDED_MAX_DEFERRAL');
  });

  it('accelerates when active DTC present', () => {
    const plan = planDtc02AdaptivePollCheck(baseInput({ hasActiveDtc: true }));
    expect(plan.proposedNextCheckAtMs).toBeLessThan(plan.legacyNextCheckAtMs);
    expect(plan.projectedPollReductionMs).toBeLessThan(0); // accelerate vs legacy next tick
  });

  it('does not defer on stale operational success', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({
        lastSuccessfulDtcCheckAtMs: T0 - 8 * 60 * 60_000,
        webhookEvidenceQuality: 'stale',
      }),
    );
    expect(plan.requiresLegacyFallback).toBe(true);
    expect(plan.proposedNextCheckAtMs).toBeLessThanOrEqual(plan.legacyNextCheckAtMs);
  });

  it('treats missing success timestamp as accelerate fallback', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({ lastSuccessfulDtcCheckAtMs: null }),
    );
    expect(plan.requiresLegacyFallback).toBe(true);
    expect(plan.decisionReason).toContain('STALE_OR_MISSING');
  });

  it('partial webhook newer than complete blocks complete trust', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({
        lastPartialWebhookSourceAtMs: T0 - 10 * 60_000,
        lastConfirmedCompleteSourceAtMs: T0 - 60 * 60_000,
        webhookEvidenceQuality: 'partial',
      }),
    );
    expect(plan.decisionReason).toContain('PARTIAL_WEBHOOK');
    expect(plan.safetyConstraints).toContain('PARTIAL_CANNOT_REPLACE_CONFIRMED_COMPLETE');
  });

  it('provider auth failure uses legacy fallback without defer', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({ providerErrorState: 'auth_denied' }),
    );
    expect(plan.requiresLegacyFallback).toBe(true);
    expect(plan.proposedNextCheckAtMs).toBe(plan.legacyNextCheckAtMs);
  });

  it('provider transient error accelerates without suppressing checks', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({ providerErrorState: 'transient' }),
    );
    expect(plan.requiresLegacyFallback).toBe(true);
    expect(plan.proposedNextCheckAtMs).toBeLessThan(plan.legacyNextCheckAtMs);
  });

  it('unknown provider capability fails closed to legacy', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({ providerCapability: 'unknown' }),
    );
    expect(plan.evidenceQuality).toBe('unknown');
    expect(plan.requiresLegacyFallback).toBe(true);
  });

  it('never proposes beyond legacy next check (starvation bound)', () => {
    const plan = planDtc02AdaptivePollCheck(baseInput());
    expect(plan.proposedNextCheckAtMs).toBeLessThanOrEqual(plan.legacyNextCheckAtMs);
    const legacy = computeLegacyNextCheckAtMs(baseInput());
    expect(legacy).toBe(
      (baseInput().lastSuccessfulDtcCheckAtMs ?? T0) + DTC02_LEGACY_POLL_INTERVAL_MS,
    );
  });

  it('unreliable partial webhook evidence falls back', () => {
    const plan = planDtc02AdaptivePollCheck(
      baseInput({ webhookEvidenceQuality: 'partial' }),
    );
    expect(plan.requiresLegacyFallback).toBe(true);
    expect(plan.decisionReason).toBe('UNRELIABLE_WEBHOOK_EVIDENCE_FALLBACK');
  });
});

describe('deriveWebhookEvidenceQuality', () => {
  it('returns none when no head timestamps', () => {
    expect(
      deriveWebhookEvidenceQuality({
        lastConfirmedCompleteSourceAtMs: null,
        lastPartialWebhookSourceAtMs: null,
        evaluatedAtMs: T0,
      }),
    ).toBe('none');
  });

  it('returns partial when partial is newer than complete', () => {
    expect(
      deriveWebhookEvidenceQuality({
        lastConfirmedCompleteSourceAtMs: T0 - 3 * 60 * 60_000,
        lastPartialWebhookSourceAtMs: T0 - 30 * 60_000,
        evaluatedAtMs: T0,
      }),
    ).toBe('partial');
  });
});
