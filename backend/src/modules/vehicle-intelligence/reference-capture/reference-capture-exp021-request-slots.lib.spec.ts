import {
  buildExp021IntendedSlotOffsets,
  buildExp021RequestSlotsForPhase,
  countExp021SlotStatuses,
  countIntendedSlotsForCadence,
  deriveRequestSlotForensicFromProvenance,
  finalizeRequestSlotOutcome,
  isExp021RequestSlotPollDue,
  markRequestSlotIssued,
  resolveNextDueRequestSlot,
} from './reference-capture-exp021-request-slots.lib';
import { EXP021_UPPER_BOUND_V2 } from './reference-capture-exp021-calibration-plan.lib';
import type { HfQueryProvenanceRecord } from './reference-capture-hf-recovery-v2.policy';

describe('EXP-021 deterministic request slots', () => {
  const t0 = Date.parse('2026-09-11T04:37:26.000Z');

  function provenance(overrides: Partial<HfQueryProvenanceRecord>): HfQueryProvenanceRecord {
    return {
      recordedAt: '2026-09-11T04:37:27.000Z',
      policyVersion: 'HF_RECOVERY_V2_2026-09-04',
      policyMode: 'V2',
      tokenId: 1,
      vehicleId: 'veh',
      sessionId: 'sess',
      captureCycleId: 'cycle',
      queryOrigin: 'FAST_LOOP',
      providerFields: ['speed'],
      queryFrom: '2026-09-11T04:37:26.000Z',
      queryTo: '2026-09-11T04:38:26.000Z',
      requestedInterval: '1s',
      aggregation: 'LAST',
      requestStartedAt: '2026-09-11T04:37:26.000Z',
      requestCompletedAt: '2026-09-11T04:37:27.000Z',
      settlementDelayMs: 0,
      recoveryOverlapMs: 0,
      resultBucketCount: 0,
      status: 'SUCCESS',
      requestCorrelationId: 'corr',
      pollIntervalMs: 180_000,
      ...overrides,
    };
  }

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
        current = finalizeRequestSlotOutcome(marked.slots, marked.slotIndex, 'SUCCESS', {
          requestCompletedAtMs: wake + 500,
          bucketCount: 3,
          providerCallAttempted: true,
          providerCallSucceeded: true,
          outcomeReason: 'SUCCESS',
          effectivePollIntervalMs: 180_000,
        });
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

  describe('forensic persistence semantics', () => {
    it('INTENDED slots keep completion fields absent', () => {
      const slot = buildExp021RequestSlotsForPhase({
        phaseEffectiveStartMs: t0,
        cadenceMs: 60_000,
        phaseDurationMs: 5 * 60_000,
      })[0];
      expect(slot.status).toBe('INTENDED');
      expect(slot.requestCompletedAtMs).toBeUndefined();
      expect(slot.bucketCount).toBeUndefined();
    });

    it('SUCCESS persists completion, bucket count, and provider semantics', () => {
      const slots = buildExp021RequestSlotsForPhase({
        phaseEffectiveStartMs: t0,
        cadenceMs: 90_000,
        phaseDurationMs: 10 * 60_000,
      });
      const issued = markRequestSlotIssued(slots, t0);
      const derived = deriveRequestSlotForensicFromProvenance({
        record: provenance({ resultBucketCount: 5, status: 'SUCCESS' }),
        requestCompletedAtMs: t0 + 2_000,
        effectivePollIntervalMs: 90_000,
      });
      const finalized = finalizeRequestSlotOutcome(
        issued.slots,
        issued.slotIndex!,
        derived.terminalStatus,
        derived.forensic,
      )[0];
      expect(finalized.status).toBe('SUCCESS');
      expect(finalized.bucketCount).toBe(5);
      expect(finalized.providerCallAttempted).toBe(true);
      expect(finalized.providerCallSucceeded).toBe(true);
      expect(finalized.requestCompletedAtMs).toBe(t0 + 2_000);
      expect(finalized.dueAtMs).toBeLessThanOrEqual(finalized.issuedAtMs!);
      expect(finalized.issuedAtMs!).toBeLessThanOrEqual(finalized.requestCompletedAtMs!);
    });

    it('ZERO_RESULT persists bucketCount=0', () => {
      const derived = deriveRequestSlotForensicFromProvenance({
        record: provenance({ resultBucketCount: 0, status: 'SUCCESS' }),
        requestCompletedAtMs: t0 + 1_000,
      });
      expect(derived.terminalStatus).toBe('ZERO_RESULT');
      expect(derived.forensic.bucketCount).toBe(0);
    });

    it('FAILURE with provider error keeps bucketCount null', () => {
      const derived = deriveRequestSlotForensicFromProvenance({
        record: provenance({ status: 'PROVIDER_ERROR', resultBucketCount: 0 }),
        requestCompletedAtMs: t0 + 1_000,
      });
      expect(derived.terminalStatus).toBe('FAILURE');
      expect(derived.forensic.bucketCount).toBeNull();
      expect(derived.forensic.providerCallAttempted).toBe(true);
      expect(derived.forensic.providerCallSucceeded).toBe(false);
    });

    it('distinguishes slot failure from provider failure when call not attempted', () => {
      const slots = buildExp021RequestSlotsForPhase({
        phaseEffectiveStartMs: t0,
        cadenceMs: 60_000,
        phaseDurationMs: 5 * 60_000,
      });
      const issued = markRequestSlotIssued(slots, t0);
      const finalized = finalizeRequestSlotOutcome(
        issued.slots,
        issued.slotIndex!,
        'FAILURE',
        {
          requestCompletedAtMs: t0 + 500,
          bucketCount: null,
          providerCallAttempted: false,
          providerCallSucceeded: false,
          outcomeReason: 'PROVIDER_CALL_NOT_ATTEMPTED',
        },
      )[0];
      expect(finalized.status).toBe('FAILURE');
      expect(finalized.providerCallAttempted).toBe(false);
      expect(finalized.bucketCount).toBeNull();
    });

    it('counts ledger statuses for summary parity', () => {
      const counts = countExp021SlotStatuses([
        { slotIndex: 0, offsetMs: 0, dueAtMs: t0, status: 'SUCCESS' },
        { slotIndex: 1, offsetMs: 60_000, dueAtMs: t0 + 60_000, status: 'ZERO_RESULT' },
        { slotIndex: 2, offsetMs: 120_000, dueAtMs: t0 + 120_000, status: 'FAILURE' },
        { slotIndex: 3, offsetMs: 180_000, dueAtMs: t0 + 180_000, status: 'SKIPPED_WITH_REASON' },
        { slotIndex: 4, offsetMs: 240_000, dueAtMs: t0 + 240_000, status: 'INTENDED' },
      ]);
      expect(counts.slotSuccessCount).toBe(1);
      expect(counts.slotZeroResultCount).toBe(1);
      expect(counts.slotFailureCount).toBe(1);
      expect(counts.slotSkippedCount).toBe(1);
      expect(counts.slotAccountedCount).toBe(4);
      expect(counts.slotCount).toBe(5);
    });
  });
});
