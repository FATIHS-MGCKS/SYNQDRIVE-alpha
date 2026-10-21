/**
 * EXP-021 — deterministic HF historical request slots per calibration phase.
 *
 * Each phase defines INTENDED_SLOT offsets from phase effectiveStart. Slots are issued at most
 * once; provider ZERO_RESULT still counts as an executed slot.
 */
import { findPhaseSpecByCadence, resolveExp021CalibrationPlan } from './reference-capture-exp021-calibration-plan.lib';
import type { HfQueryProvenanceRecord } from './reference-capture-hf-recovery-v2.policy';

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
  /** Wall-clock ms when the slot attempt reached a terminal runtime outcome. */
  requestCompletedAtMs?: number | null;
  /**
   * RAW_PROVIDER_BUCKET_COUNT from the individual HF provider response at request time
   * (`HfQueryProvenanceRecord.resultBucketCount`). Null when no valid provider response exists.
   */
  bucketCount?: number | null;
  providerCallAttempted?: boolean | null;
  providerCallSucceeded?: boolean | null;
  /** Provider status or lifecycle classification explaining the terminal slot outcome. */
  outcomeReason?: string | null;
  /** Phase cadence (ms) the slot belonged to — order-neutral forensic identity. */
  effectivePollIntervalMs?: number | null;
};

export type Exp021RequestSlotForensicFinalizeInput = {
  requestCompletedAtMs: number;
  bucketCount: number | null;
  providerCallAttempted: boolean;
  providerCallSucceeded: boolean;
  outcomeReason: string | null;
  effectivePollIntervalMs?: number | null;
};

export type Exp021SlotStatusCounts = {
  slotCount: number;
  slotSuccessCount: number;
  slotZeroResultCount: number;
  slotFailureCount: number;
  slotSkippedCount: number;
  slotAccountedCount: number;
  slotIntendedCount: number;
  slotIssuedCount: number;
};

const TERMINAL_SLOT_STATUSES: ReadonlySet<Exp021RequestSlotStatus> = new Set([
  'SUCCESS',
  'ZERO_RESULT',
  'FAILURE',
  'SKIPPED_WITH_REASON',
]);

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

export function countExp021SlotStatuses(
  slots: Exp021RequestSlotRecord[] | null | undefined,
): Exp021SlotStatusCounts {
  if (!slots?.length) {
    return {
      slotCount: 0,
      slotSuccessCount: 0,
      slotZeroResultCount: 0,
      slotFailureCount: 0,
      slotSkippedCount: 0,
      slotAccountedCount: 0,
      slotIntendedCount: 0,
      slotIssuedCount: 0,
    };
  }
  let slotSuccessCount = 0;
  let slotZeroResultCount = 0;
  let slotFailureCount = 0;
  let slotSkippedCount = 0;
  let slotIntendedCount = 0;
  let slotIssuedCount = 0;
  for (const slot of slots) {
    if (slot.status === 'SUCCESS') slotSuccessCount += 1;
    if (slot.status === 'ZERO_RESULT') slotZeroResultCount += 1;
    if (slot.status === 'FAILURE') slotFailureCount += 1;
    if (slot.status === 'SKIPPED_WITH_REASON') slotSkippedCount += 1;
    if (slot.status === 'INTENDED') slotIntendedCount += 1;
    if (slot.status === 'ISSUED') slotIssuedCount += 1;
  }
  const slotAccountedCount =
    slotSuccessCount + slotZeroResultCount + slotFailureCount + slotSkippedCount;
  return {
    slotCount: slots.length,
    slotSuccessCount,
    slotZeroResultCount,
    slotFailureCount,
    slotSkippedCount,
    slotAccountedCount,
    slotIntendedCount,
    slotIssuedCount,
  };
}

export function deriveRequestSlotForensicFromProvenance(args: {
  record: HfQueryProvenanceRecord;
  requestCompletedAtMs: number;
  effectivePollIntervalMs?: number | null;
}): {
  terminalStatus: 'SUCCESS' | 'ZERO_RESULT' | 'FAILURE';
  forensic: Exp021RequestSlotForensicFinalizeInput;
} {
  const record = args.record;
  const providerCallAttempted = true;
  const providerCallSucceeded =
    record.status === 'SUCCESS' || record.status === 'ZERO_RESULT';
  let terminalStatus: 'SUCCESS' | 'ZERO_RESULT' | 'FAILURE';
  let bucketCount: number | null;

  if (record.status === 'SUCCESS') {
    terminalStatus = record.resultBucketCount > 0 ? 'SUCCESS' : 'ZERO_RESULT';
    bucketCount = record.resultBucketCount;
  } else if (record.status === 'ZERO_RESULT') {
    terminalStatus = 'ZERO_RESULT';
    bucketCount = 0;
  } else {
    terminalStatus = 'FAILURE';
    bucketCount = null;
  }

  return {
    terminalStatus,
    forensic: {
      requestCompletedAtMs: args.requestCompletedAtMs,
      bucketCount,
      providerCallAttempted,
      providerCallSucceeded,
      outcomeReason: record.status,
      effectivePollIntervalMs:
        args.effectivePollIntervalMs ?? record.pollIntervalMs ?? null,
    },
  };
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

export function isTerminalRequestSlotStatus(status: Exp021RequestSlotStatus): boolean {
  return TERMINAL_SLOT_STATUSES.has(status);
}

/** Terminalize an ISSUED deterministic slot after HF_HISTORICAL capture completes. */
export function finalizeIssuedRequestSlotAfterHfCapture(args: {
  slots: Exp021RequestSlotRecord[];
  issuedSlotIndex: number;
  queryProvenanceRecord: HfQueryProvenanceRecord | null;
  requestCompletedAtMs: number;
  effectivePollIntervalMs: number;
}): Exp021RequestSlotRecord[] {
  if (args.queryProvenanceRecord) {
    const derived = deriveRequestSlotForensicFromProvenance({
      record: args.queryProvenanceRecord,
      requestCompletedAtMs: args.requestCompletedAtMs,
      effectivePollIntervalMs: args.effectivePollIntervalMs,
    });
    return finalizeRequestSlotOutcome(
      args.slots,
      args.issuedSlotIndex,
      derived.terminalStatus,
      derived.forensic,
    );
  }
  return finalizeRequestSlotOutcome(
    args.slots,
    args.issuedSlotIndex,
    'FAILURE',
    {
      requestCompletedAtMs: args.requestCompletedAtMs,
      bucketCount: null,
      providerCallAttempted: false,
      providerCallSucceeded: false,
      outcomeReason: 'PROVIDER_CALL_NOT_ATTEMPTED',
      effectivePollIntervalMs: args.effectivePollIntervalMs,
    },
  );
}

export function finalizeRequestSlotOutcome(
  slots: Exp021RequestSlotRecord[],
  slotIndex: number,
  outcome: 'SUCCESS' | 'ZERO_RESULT' | 'FAILURE',
  forensic?: Exp021RequestSlotForensicFinalizeInput,
): Exp021RequestSlotRecord[] {
  return slots.map((slot) => {
    if (slot.slotIndex !== slotIndex) return slot;
    const next: Exp021RequestSlotRecord = { ...slot, status: outcome };
    if (forensic) {
      next.requestCompletedAtMs = forensic.requestCompletedAtMs;
      next.bucketCount = forensic.bucketCount;
      next.providerCallAttempted = forensic.providerCallAttempted;
      next.providerCallSucceeded = forensic.providerCallSucceeded;
      next.outcomeReason = forensic.outcomeReason;
      if (forensic.effectivePollIntervalMs != null) {
        next.effectivePollIntervalMs = forensic.effectivePollIntervalMs;
      }
    }
    return next;
  });
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
