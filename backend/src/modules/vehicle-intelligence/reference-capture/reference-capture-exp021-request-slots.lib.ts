/**
 * EXP-021 — deterministic HF historical request slots per calibration phase.
 *
 * Each phase defines INTENDED_SLOT offsets from phase effectiveStart. Slots are issued at most
 * once; provider ZERO_RESULT still counts as an executed slot.
 */
import { findPhaseSpecByCadence, resolveExp021CalibrationPlan } from './reference-capture-exp021-calibration-plan.lib';

export type Exp021RequestSlotStatus =
  | 'INTENDED'
  | 'ISSUED'
  | 'SUCCESS'
  | 'ZERO_RESULT'
  | 'FAILURE'
  | 'SKIPPED_WITH_REASON';

export type Exp021RequestSlotRecord = {
  slotIndex: number;
  offsetMs: number;
  dueAtMs: number;
  status: Exp021RequestSlotStatus;
  issuedAtMs?: number | null;
  skipReason?: string | null;
};

export function buildExp021IntendedSlotOffsets(args: {
  cadenceMs: number;
  phaseDurationMs: number;
}): number[] {
  if (args.cadenceMs <= 0 || args.phaseDurationMs <= 0) return [];
  const offsets: number[] = [];
  for (let offset = 0; offset < args.phaseDurationMs; offset += args.cadenceMs) {
    offsets.push(offset);
  }
  return offsets;
}

export function buildExp021RequestSlotsForPhase(args: {
  phaseEffectiveStartMs: number;
  cadenceMs: number;
  phaseDurationMs: number;
}): Exp021RequestSlotRecord[] {
  const offsets = buildExp021IntendedSlotOffsets({
    cadenceMs: args.cadenceMs,
    phaseDurationMs: args.phaseDurationMs,
  });
  return offsets.map((offsetMs, slotIndex) => ({
    slotIndex,
    offsetMs,
    dueAtMs: args.phaseEffectiveStartMs + offsetMs,
    status: 'INTENDED',
    issuedAtMs: null,
    skipReason: null,
  }));
}

export function countIntendedSlotsForCadence(
  cadenceMs: number,
  plan = resolveExp021CalibrationPlan(),
): number {
  const spec = findPhaseSpecByCadence(plan, cadenceMs);
  if (!spec) return 0;
  return buildExp021IntendedSlotOffsets({
    cadenceMs,
    phaseDurationMs: spec.targetDurationMs,
  }).length;
}

export function resolveNextDueRequestSlot(
  slots: Exp021RequestSlotRecord[] | null | undefined,
  nowMs: number,
): Exp021RequestSlotRecord | null {
  if (!slots?.length) return null;
  const due = slots
    .filter((slot) => slot.status === 'INTENDED' && slot.dueAtMs <= nowMs)
    .sort((a, b) => a.dueAtMs - b.dueAtMs);
  return due[0] ?? null;
}

export type Exp021HfHistoricalPollDecision =
  | {
      mode: 'DETERMINISTIC_SLOTS';
      pollAllowed: true;
      slotIndex: number;
      slots: Exp021RequestSlotRecord[];
      dueAtMs: number;
    }
  | {
      mode: 'DETERMINISTIC_SLOTS';
      pollAllowed: false;
      slotIndex: null;
      slots: Exp021RequestSlotRecord[];
      blockReason:
        | 'NO_INTENDED_SLOT_DUE'
        | 'ALL_SLOTS_TERMINAL'
        | 'SLOT_RESERVATION_FAILED';
    }
  | {
      mode: 'LEGACY_INTERVAL';
      pollAllowed: boolean;
      slotIndex: null;
      slots: null;
      blockReason?: 'LEGACY_INTERVAL_NOT_ELAPSED';
    };

/**
 * When deterministic EXP-021 slots are active, polling is governed strictly by slot due state.
 * Legacy interval gating applies only when no slot ledger exists.
 */
export function resolveExp021HfHistoricalPollDecision(args: {
  nowMs: number;
  slots: Exp021RequestSlotRecord[] | null | undefined;
  lastHfHistoricalPollAt: string | null | undefined;
  pollIntervalMs: number;
  policyMode: 'V2' | 'LEGACY';
}): Exp021HfHistoricalPollDecision {
  if (args.slots?.length) {
    const nextSlot = resolveNextDueRequestSlot(args.slots, args.nowMs);
    if (!nextSlot) {
      const hasIntended = args.slots.some((slot) => slot.status === 'INTENDED');
      return {
        mode: 'DETERMINISTIC_SLOTS',
        pollAllowed: false,
        slotIndex: null,
        slots: args.slots,
        blockReason: hasIntended ? 'NO_INTENDED_SLOT_DUE' : 'ALL_SLOTS_TERMINAL',
      };
    }
    const issued = markRequestSlotIssued(args.slots, args.nowMs);
    if (issued.slotIndex == null) {
      return {
        mode: 'DETERMINISTIC_SLOTS',
        pollAllowed: false,
        slotIndex: null,
        slots: args.slots,
        blockReason: 'SLOT_RESERVATION_FAILED',
      };
    }
    return {
      mode: 'DETERMINISTIC_SLOTS',
      pollAllowed: true,
      slotIndex: issued.slotIndex,
      slots: issued.slots,
      dueAtMs: nextSlot.dueAtMs,
    };
  }

  if (args.policyMode !== 'V2') {
    return { mode: 'LEGACY_INTERVAL', pollAllowed: true, slotIndex: null, slots: null };
  }
  if (!args.lastHfHistoricalPollAt) {
    return { mode: 'LEGACY_INTERVAL', pollAllowed: true, slotIndex: null, slots: null };
  }
  const last = Date.parse(args.lastHfHistoricalPollAt);
  if (!Number.isFinite(last)) {
    return { mode: 'LEGACY_INTERVAL', pollAllowed: true, slotIndex: null, slots: null };
  }
  const pollAllowed = args.nowMs - last >= args.pollIntervalMs;
  return {
    mode: 'LEGACY_INTERVAL',
    pollAllowed,
    slotIndex: null,
    slots: null,
    blockReason: pollAllowed ? undefined : 'LEGACY_INTERVAL_NOT_ELAPSED',
  };
}

/** @deprecated Use resolveExp021HfHistoricalPollDecision — strict slot-only when slots exist. */
export function isExp021RequestSlotPollDue(args: {
  nowMs: number;
  slots: Exp021RequestSlotRecord[] | null | undefined;
  lastHfHistoricalPollAt: string | null | undefined;
  pollIntervalMs: number;
  policyMode: 'V2' | 'LEGACY';
}): boolean {
  const decision = resolveExp021HfHistoricalPollDecision(args);
  return decision.pollAllowed;
}

export function markRequestSlotIssued(
  slots: Exp021RequestSlotRecord[],
  nowMs: number,
): { slots: Exp021RequestSlotRecord[]; slotIndex: number | null } {
  const next = resolveNextDueRequestSlot(slots, nowMs);
  if (!next) return { slots, slotIndex: null };
  return {
    slots: reserveRequestSlot(slots, next.slotIndex, nowMs),
    slotIndex: next.slotIndex,
  };
}

/** Durable reservation marker — ISSUED slots are never re-selected as INTENDED. */
export function reserveRequestSlot(
  slots: Exp021RequestSlotRecord[],
  slotIndex: number,
  issuedAtMs: number,
): Exp021RequestSlotRecord[] {
  return slots.map((slot) =>
    slot.slotIndex === slotIndex
      ? { ...slot, status: 'ISSUED', issuedAtMs, skipReason: null }
      : slot,
  );
}

export function countIssuedOrTerminalSlots(slots: Exp021RequestSlotRecord[]): number {
  return slots.filter((slot) => slot.status !== 'INTENDED').length;
}

export function finalizeRequestSlotOutcome(
  slots: Exp021RequestSlotRecord[],
  slotIndex: number,
  outcome: 'SUCCESS' | 'ZERO_RESULT' | 'FAILURE',
): Exp021RequestSlotRecord[] {
  return slots.map((slot) =>
    slot.slotIndex === slotIndex ? { ...slot, status: outcome } : slot,
  );
}

export function initializeRequestSlotsForActivePhase(args: {
  phaseEffectiveStartMs: number;
  cadenceMs: number;
  phaseDurationMs: number;
  existingSlots?: Exp021RequestSlotRecord[] | null;
}): Exp021RequestSlotRecord[] {
  if (args.existingSlots?.length) return args.existingSlots;
  return buildExp021RequestSlotsForPhase({
    phaseEffectiveStartMs: args.phaseEffectiveStartMs,
    cadenceMs: args.cadenceMs,
    phaseDurationMs: args.phaseDurationMs,
  });
}
