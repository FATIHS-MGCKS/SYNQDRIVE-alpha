import {
  buildExp021IntendedSlotOffsets,
  buildExp021RequestSlotsForPhase,
  countIntendedSlotsForCadence,
  finalizeRequestSlotOutcome,
  isExp021RequestSlotPollDue,
  markRequestSlotIssued,
  resolveNextDueRequestSlot,
} from './reference-capture-exp021-request-slots.lib';
import { EXP021_UPPER_BOUND_V2 } from './reference-capture-exp021-calibration-plan.lib';

describe('EXP-021 deterministic request slots', () => {
  const t0 = Date.parse('2026-09-11T04:37:26.000Z');

  it('builds 5 slots for 180s / 15m phase', () => {
    expect(
      buildExp021IntendedSlotOffsets({ cadenceMs: 180_000, phaseDurationMs: 15 * 60_000 }),
    ).toEqual([0, 180_000, 360_000, 540_000, 720_000]);
    expect(countIntendedSlotsForCadence(180_000, EXP021_UPPER_BOUND_V2)).toBe(5);
  });

  it('builds 5 slots for 120s / 10m phase', () => {
    expect(countIntendedSlotsForCadence(120_000, EXP021_UPPER_BOUND_V2)).toBe(5);
  });

  it('builds 5 slots for 60s / 5m phase', () => {
    expect(countIntendedSlotsForCadence(60_000, EXP021_UPPER_BOUND_V2)).toBe(5);
  });

  it('builds 6 slots for 30s / 3m CONTROL phase', () => {
    expect(countIntendedSlotsForCadence(30_000, EXP021_UPPER_BOUND_V2)).toBe(6);
  });

  it('issues each slot exactly once across runner jitter', () => {
    const slots = buildExp021RequestSlotsForPhase({
      phaseEffectiveStartMs: t0,
      cadenceMs: 180_000,
      phaseDurationMs: 15 * 60_000,
    });
    let current = slots;
    const issued: number[] = [];
    for (const wake of [t0 - 500, t0, t0 + 1_000, t0 + 180_000, t0 + 180_500]) {
      if (!isExp021RequestSlotPollDue({
        nowMs: wake,
        slots: current,
        lastHfHistoricalPollAt: null,
        pollIntervalMs: 180_000,
        policyMode: 'V2',
      })) {
        continue;
      }
      const marked = markRequestSlotIssued(current, wake);
      if (marked.slotIndex != null) {
        issued.push(marked.slotIndex);
        current = finalizeRequestSlotOutcome(marked.slots, marked.slotIndex, 'SUCCESS');
      }
    }
    expect(issued).toEqual([0, 1]);
    expect(resolveNextDueRequestSlot(current, t0 + 360_000)?.slotIndex).toBe(2);
  });

  it('does not duplicate provider queries for one slot', () => {
    const slots = buildExp021RequestSlotsForPhase({
      phaseEffectiveStartMs: t0,
      cadenceMs: 120_000,
      phaseDurationMs: 10 * 60_000,
    });
    const first = markRequestSlotIssued(slots, t0);
    const second = markRequestSlotIssued(first.slots, t0 + 1_000);
    expect(second.slotIndex).toBeNull();
  });
});
