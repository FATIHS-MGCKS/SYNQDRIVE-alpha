import {
  buildExp021RequestSlotsForPhase,
  finalizeRequestSlotOutcome,
  resolveExp021HfHistoricalPollDecision,
} from './reference-capture-exp021-request-slots.lib';

describe('EXP-021 acquisition HF_HISTORICAL slot gating semantics', () => {
  const t0 = Date.parse('2026-09-11T04:37:26.000Z');
  const cadenceMs = 180_000;
  const phaseDurationMs = 15 * 60_000;

  function slotsAtStart() {
    return buildExp021RequestSlotsForPhase({
      phaseEffectiveStartMs: t0,
      cadenceMs,
      phaseDurationMs,
    });
  }

  it('blocks provider query 500ms before t+0', () => {
    const decision = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 - 500,
      slots: slotsAtStart(),
      lastHfHistoricalPollAt: null,
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(decision.pollAllowed).toBe(false);
    expect(decision.mode).toBe('DETERMINISTIC_SLOTS');
  });

  it('issues slot 0 exactly once at t+0', () => {
    let slots = slotsAtStart();
    const first = resolveExp021HfHistoricalPollDecision({
      nowMs: t0,
      slots,
      lastHfHistoricalPollAt: null,
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(first.pollAllowed).toBe(true);
    expect(first.slotIndex).toBe(0);
    slots = first.mode === 'DETERMINISTIC_SLOTS' ? first.slots : slots;

    const duplicate = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + 500,
      slots,
      lastHfHistoricalPollAt: null,
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(duplicate.pollAllowed).toBe(false);
  });

  it('blocks between slots when interval elapsed but no slot due', () => {
    let slots = slotsAtStart();
    const first = resolveExp021HfHistoricalPollDecision({
      nowMs: t0,
      slots,
      lastHfHistoricalPollAt: null,
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    slots = finalizeRequestSlotOutcome(
      first.mode === 'DETERMINISTIC_SLOTS' ? first.slots : slots,
      0,
      'SUCCESS',
    );

    const between = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + 90_000,
      slots,
      lastHfHistoricalPollAt: new Date(t0).toISOString(),
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(between.pollAllowed).toBe(false);
    expect(between.mode === 'DETERMINISTIC_SLOTS' && !between.pollAllowed && between.blockReason).toBe(
      'NO_INTENDED_SLOT_DUE',
    );
  });

  it('blocks after last slot until phase seal', () => {
    let slots = slotsAtStart();
    for (const offset of [0, 180_000, 360_000, 540_000, 720_000]) {
      const decision = resolveExp021HfHistoricalPollDecision({
        nowMs: t0 + offset,
        slots,
        lastHfHistoricalPollAt: offset > 0 ? new Date(t0 + offset - 1).toISOString() : null,
        pollIntervalMs: cadenceMs,
        policyMode: 'V2',
      });
      expect(decision.pollAllowed).toBe(true);
      const idx = decision.slotIndex!;
      slots = finalizeRequestSlotOutcome(
        decision.mode === 'DETERMINISTIC_SLOTS' ? decision.slots : slots,
        idx,
        'SUCCESS',
      );
    }

    const afterLast = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + 800_000,
      slots,
      lastHfHistoricalPollAt: new Date(t0 + 720_000).toISOString(),
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(afterLast.pollAllowed).toBe(false);
    expect(
      afterLast.mode === 'DETERMINISTIC_SLOTS' && !afterLast.pollAllowed && afterLast.blockReason,
    ).toBe('ALL_SLOTS_TERMINAL');
  });

  it('consumes ZERO_RESULT and FAILURE as terminal slot outcomes', () => {
    let slots = slotsAtStart();
    const zero = resolveExp021HfHistoricalPollDecision({
      nowMs: t0,
      slots,
      lastHfHistoricalPollAt: null,
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    slots = finalizeRequestSlotOutcome(
      zero.mode === 'DETERMINISTIC_SLOTS' ? zero.slots : slots,
      0,
      'ZERO_RESULT',
    );
    expect(slots[0].status).toBe('ZERO_RESULT');

    const next = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + 180_000,
      slots,
      lastHfHistoricalPollAt: new Date(t0).toISOString(),
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(next.slotIndex).toBe(1);

    const fail = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + 180_000,
      slots: next.slots,
      lastHfHistoricalPollAt: new Date(t0).toISOString(),
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    slots = finalizeRequestSlotOutcome(
      fail.mode === 'DETERMINISTIC_SLOTS' ? fail.slots : slots,
      1,
      'FAILURE',
    );
    expect(slots[1].status).toBe('FAILURE');
    expect(
      resolveExp021HfHistoricalPollDecision({
        nowMs: t0 + 180_500,
        slots,
        lastHfHistoricalPollAt: new Date(t0 + 180_000).toISOString(),
        pollIntervalMs: cadenceMs,
        policyMode: 'V2',
      }).pollAllowed,
    ).toBe(false);
  });

  it('blocks exactly at phase end with no out-of-plan provider query', () => {
    let slots = slotsAtStart();
    for (const offset of [0, 180_000, 360_000, 540_000, 720_000]) {
      const decision = resolveExp021HfHistoricalPollDecision({
        nowMs: t0 + offset,
        slots,
        lastHfHistoricalPollAt: offset > 0 ? new Date(t0 + offset - 1).toISOString() : null,
        pollIntervalMs: cadenceMs,
        policyMode: 'V2',
      });
      slots = finalizeRequestSlotOutcome(
        decision.mode === 'DETERMINISTIC_SLOTS' ? decision.slots : slots,
        decision.slotIndex!,
        'SUCCESS',
      );
    }

    const atPhaseEnd = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + phaseDurationMs,
      slots,
      lastHfHistoricalPollAt: new Date(t0 + 720_000).toISOString(),
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(atPhaseEnd.pollAllowed).toBe(false);
    expect(
      atPhaseEnd.mode === 'DETERMINISTIC_SLOTS' && !atPhaseEnd.pollAllowed && atPhaseEnd.blockReason,
    ).toBe('ALL_SLOTS_TERMINAL');
  });

  it('handles late runner deterministically after restart — due slots only, no duplicate ISSUED', () => {
    let slots = slotsAtStart();
    const first = resolveExp021HfHistoricalPollDecision({
      nowMs: t0,
      slots,
      lastHfHistoricalPollAt: null,
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    slots = first.mode === 'DETERMINISTIC_SLOTS' ? first.slots : slots;

    const restartLate = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + 400_000,
      slots,
      lastHfHistoricalPollAt: new Date(t0).toISOString(),
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(restartLate.pollAllowed).toBe(true);
    expect(restartLate.slotIndex).toBe(1);
    slots = finalizeRequestSlotOutcome(
      restartLate.mode === 'DETERMINISTIC_SLOTS' ? restartLate.slots : slots,
      1,
      'SUCCESS',
    );

    const noDuplicateSlot0 = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + 400_000,
      slots,
      lastHfHistoricalPollAt: new Date(t0 + 180_000).toISOString(),
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(noDuplicateSlot0.slotIndex).not.toBe(0);
  });

  it('uses legacy interval only when slot ledger absent', () => {
    const legacyBlocked = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + 10_000,
      slots: null,
      lastHfHistoricalPollAt: new Date(t0).toISOString(),
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(legacyBlocked.mode).toBe('LEGACY_INTERVAL');
    expect(legacyBlocked.pollAllowed).toBe(false);

    const legacyAllowed = resolveExp021HfHistoricalPollDecision({
      nowMs: t0 + cadenceMs,
      slots: null,
      lastHfHistoricalPollAt: new Date(t0).toISOString(),
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(legacyAllowed.pollAllowed).toBe(true);
  });
});
