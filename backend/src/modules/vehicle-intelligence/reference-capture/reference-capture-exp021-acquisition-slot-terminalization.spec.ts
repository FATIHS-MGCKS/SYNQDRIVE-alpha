import {
  buildExp021RequestSlotsForPhase,
  finalizeIssuedRequestSlotAfterHfCapture,
  markRequestSlotIssued,
  resolveExp021HfHistoricalPollDecision,
} from './reference-capture-exp021-request-slots.lib';
import type { HfQueryProvenanceRecord } from './reference-capture-hf-recovery-v2.policy';

describe('EXP-021 acquisition slot terminalization after HF capture', () => {
  const t0Ms = Date.parse('2026-09-15T11:39:01.000Z');
  const cadenceMs = 90_000;

  function provenance(overrides: Partial<HfQueryProvenanceRecord>): HfQueryProvenanceRecord {
    return {
      recordedAt: '2026-09-15T11:39:02.000Z',
      policyVersion: 'HF_RECOVERY_V2_2026-09-04',
      policyMode: 'V2',
      tokenId: 1,
      vehicleId: 'veh',
      sessionId: 'sess',
      captureCycleId: 'cycle',
      queryOrigin: 'FAST_LOOP',
      providerFields: ['speed'],
      queryFrom: '2026-09-15T11:39:00.000Z',
      queryTo: '2026-09-15T11:39:30.000Z',
      requestedInterval: '1s',
      aggregation: 'LAST',
      requestStartedAt: '2026-09-15T11:39:01.000Z',
      requestCompletedAt: '2026-09-15T11:39:02.000Z',
      settlementDelayMs: 0,
      recoveryOverlapMs: 0,
      resultBucketCount: 3,
      status: 'SUCCESS',
      requestCorrelationId: 'corr',
      pollIntervalMs: cadenceMs,
      ...overrides,
    };
  }

  it('terminalizes ISSUED slot as FAILURE when capture returns null provenance', () => {
    const baseSlots = buildExp021RequestSlotsForPhase({
      phaseEffectiveStartMs: t0Ms,
      cadenceMs,
      phaseDurationMs: 10 * 60_000,
    });
    const issued = markRequestSlotIssued(baseSlots, t0Ms + 1_000);
    expect(issued.slots[0].status).toBe('ISSUED');

    const completedAtMs = t0Ms + 2_000;
    const terminalized = finalizeIssuedRequestSlotAfterHfCapture({
      slots: issued.slots,
      issuedSlotIndex: issued.slotIndex!,
      queryProvenanceRecord: null,
      requestCompletedAtMs: completedAtMs,
      effectivePollIntervalMs: cadenceMs,
    });

    const slot = terminalized[0];
    expect(slot.status).toBe('FAILURE');
    expect(slot.providerCallAttempted).toBe(false);
    expect(slot.providerCallSucceeded).toBe(false);
    expect(slot.bucketCount).toBeNull();
    expect(slot.outcomeReason).toBe('PROVIDER_CALL_NOT_ATTEMPTED');
    expect(slot.requestCompletedAtMs).toBe(completedAtMs);
    expect(slot.effectivePollIntervalMs).toBe(cadenceMs);

    const next = resolveExp021HfHistoricalPollDecision({
      nowMs: t0Ms + 3_000,
      slots: terminalized,
      lastHfHistoricalPollAt: null,
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(next.pollAllowed).toBe(false);
    expect(terminalized.some((s) => s.status === 'ISSUED')).toBe(false);
  });

  it('terminalizes ISSUED slot from provenance when provider call was attempted', () => {
    const baseSlots = buildExp021RequestSlotsForPhase({
      phaseEffectiveStartMs: t0Ms,
      cadenceMs,
      phaseDurationMs: 10 * 60_000,
    });
    const issued = markRequestSlotIssued(baseSlots, t0Ms + 1_000);
    const terminalized = finalizeIssuedRequestSlotAfterHfCapture({
      slots: issued.slots,
      issuedSlotIndex: issued.slotIndex!,
      queryProvenanceRecord: provenance({ status: 'PROVIDER_ERROR', resultBucketCount: 0 }),
      requestCompletedAtMs: t0Ms + 2_000,
      effectivePollIntervalMs: cadenceMs,
    });
    expect(terminalized[0]).toMatchObject({
      status: 'FAILURE',
      providerCallAttempted: true,
      providerCallSucceeded: false,
      bucketCount: null,
      outcomeReason: 'PROVIDER_ERROR',
    });
  });

  it('mirrors acquisition wiring: provenance metrics optional, slot always terminal', () => {
    let slots = buildExp021RequestSlotsForPhase({
      phaseEffectiveStartMs: t0Ms,
      cadenceMs,
      phaseDurationMs: 10 * 60_000,
    });
    const poll = resolveExp021HfHistoricalPollDecision({
      nowMs: t0Ms,
      slots,
      lastHfHistoricalPollAt: null,
      pollIntervalMs: cadenceMs,
      policyMode: 'V2',
    });
    expect(poll.pollAllowed).toBe(true);
    slots = poll.mode === 'DETERMINISTIC_SLOTS' ? poll.slots : slots;
    const issuedSlotIndex = poll.slotIndex;

    const hfResult = { queryProvenanceRecord: null as HfQueryProvenanceRecord | null };
    if (issuedSlotIndex != null) {
      slots = finalizeIssuedRequestSlotAfterHfCapture({
        slots,
        issuedSlotIndex,
        queryProvenanceRecord: hfResult.queryProvenanceRecord,
        requestCompletedAtMs: t0Ms + 500,
        effectivePollIntervalMs: cadenceMs,
      });
    }

    expect(slots[0].status).toBe('FAILURE');
    expect(slots[0].outcomeReason).toBe('PROVIDER_CALL_NOT_ATTEMPTED');
  });
});
