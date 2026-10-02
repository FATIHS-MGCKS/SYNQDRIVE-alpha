import { readFileSync } from 'fs';
import { join } from 'path';
import { finalizePhaseSummary } from './reference-capture-hf-calibration-phase.policy';
import {
  buildForensicPhaseSlotSummary,
  buildForensicPhysicalAuthorityView,
  extractExp021ForensicBundle,
  mapLegacyFreezeSlotsToLedger,
  parseLegacyForensicSlotRecord,
} from './reference-capture-exp021-forensic-extraction.lib';
import {
  buildExp021RequestSlotsForPhase,
  deriveRequestSlotForensicFromProvenance,
  finalizeRequestSlotOutcome,
  markRequestSlotIssued,
  type Exp021RequestSlotRecord,
} from './reference-capture-exp021-request-slots.lib';
import { mergeExp021PhysicalAuthority } from './reference-capture-exp-021-physical-authority.lib';
import type { HfQueryProvenanceRecord } from './reference-capture-hf-recovery-v2.policy';

describe('EXP-021 forensic extraction', () => {
  const t0Ms = Date.parse('2026-09-15T11:39:01.000Z');

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
      resultBucketCount: 0,
      status: 'SUCCESS',
      requestCorrelationId: 'corr',
      pollIntervalMs: 90_000,
      ...overrides,
    };
  }

  it('exposes persisted slot forensic fields directly', () => {
    let slots = buildExp021RequestSlotsForPhase({
      phaseEffectiveStartMs: t0Ms,
      cadenceMs: 90_000,
      phaseDurationMs: 10 * 60_000,
    });
    const issued = markRequestSlotIssued(slots, t0Ms + 1_000);
    const derived = deriveRequestSlotForensicFromProvenance({
      record: provenance({ resultBucketCount: 4, status: 'SUCCESS' }),
      requestCompletedAtMs: t0Ms + 2_000,
      effectivePollIntervalMs: 90_000,
    });
    slots = finalizeRequestSlotOutcome(
      issued.slots,
      issued.slotIndex!,
      derived.terminalStatus,
      derived.forensic,
    );
    const summary = finalizePhaseSummary({
      phase: {
        calibrationPhaseId: 'phase-90',
        phaseSequence: 1,
        effectivePollIntervalMs: 90_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(t0Ms + 60_000).toISOString(),
        effectiveConfig: {
          calibrationSeriesId: 'series',
          calibrationPhaseId: 'phase-90',
          phaseSequence: 1,
          vehicleId: 'veh',
          tokenId: 1,
          effectivePollIntervalMs: 90_000,
          settlementDelayMs: 0,
          recoveryOverlapMs: 0,
          policyVersion: 'HF_RECOVERY_V2_2026-09-04',
          policyMode: 'V2',
          effectiveAt: new Date(t0Ms).toISOString(),
        },
      },
      counters: {
        calibrationPhaseId: 'phase-90',
        allRequestCount: 1,
        nativeFastLoopRequestCount: 1,
        nativeFastLoopProviderSuccessCount: 1,
        nativeFastLoopProviderZeroResultCount: 0,
        nativeFastLoopProviderErrorCount: 0,
        nativeFastLoopProviderBucketCount: 4,
        nativeFastLoopNewBucketCount: 4,
        nativeFastLoopDuplicateBucketCount: 0,
        nativeFastLoopRevisionBucketCount: 0,
        transitionRequestCount: 0,
        transitionProviderBucketCount: 0,
        recoverySweepRequestCount: 0,
        recoveredLateBucketCount: 0,
        transitionWindowCount: 0,
        nativeUniqueTemporalBucketStarts: [],
        nativeMaxIntraResponseTemporalGapMs: null,
        exp021RequestSlots: slots,
      },
      phaseEndedAtMs: t0Ms + 60_000,
    });
    const forensic = buildForensicPhaseSlotSummary(summary);
    expect(forensic.slotSuccessCount).toBe(1);
    expect(forensic.slotAccountedCount).toBe(1);
    expect(forensic.slots[0]).toMatchObject({
      bucketCount: 4,
      providerCallAttempted: true,
      providerCallSucceeded: true,
      effectivePollIntervalMs: 90_000,
      requestCompletedAtMs: t0Ms + 2_000,
    });
    expect(forensic.slots[0].requestCompletedAt).toBe(
      new Date(t0Ms + 2_000).toISOString(),
    );
  });

  it('derives summary counters from ledger at phase seal', () => {
    const terminalSlots: Exp021RequestSlotRecord[] = [
      { slotIndex: 0, offsetMs: 0, dueAtMs: t0Ms, status: 'SUCCESS' },
      { slotIndex: 1, offsetMs: 90_000, dueAtMs: t0Ms + 90_000, status: 'FAILURE' },
      { slotIndex: 2, offsetMs: 180_000, dueAtMs: t0Ms + 180_000, status: 'ZERO_RESULT' },
    ];
    const summary = finalizePhaseSummary({
      phase: {
        calibrationPhaseId: 'phase',
        phaseSequence: 1,
        effectivePollIntervalMs: 90_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(t0Ms + 600_000).toISOString(),
        effectiveConfig: {
          calibrationSeriesId: 'series',
          calibrationPhaseId: 'phase',
          phaseSequence: 1,
          vehicleId: 'veh',
          tokenId: 1,
          effectivePollIntervalMs: 90_000,
          settlementDelayMs: 0,
          recoveryOverlapMs: 0,
          policyVersion: 'HF_RECOVERY_V2_2026-09-04',
          policyMode: 'V2',
          effectiveAt: new Date(t0Ms).toISOString(),
        },
      },
      counters: {
        calibrationPhaseId: 'phase',
        allRequestCount: 3,
        nativeFastLoopRequestCount: 3,
        nativeFastLoopProviderSuccessCount: 2,
        nativeFastLoopProviderZeroResultCount: 1,
        nativeFastLoopProviderErrorCount: 1,
        nativeFastLoopProviderBucketCount: 3,
        nativeFastLoopNewBucketCount: 3,
        nativeFastLoopDuplicateBucketCount: 0,
        nativeFastLoopRevisionBucketCount: 0,
        transitionRequestCount: 0,
        transitionProviderBucketCount: 0,
        recoverySweepRequestCount: 0,
        recoveredLateBucketCount: 0,
        transitionWindowCount: 0,
        nativeUniqueTemporalBucketStarts: [],
        nativeMaxIntraResponseTemporalGapMs: null,
        exp021RequestSlots: terminalSlots,
      },
      phaseEndedAtMs: t0Ms + 600_000,
    });
    expect(summary.slotSuccessCount).toBe(1);
    expect(summary.slotFailureCount).toBe(1);
    expect(summary.slotZeroResultCount).toBe(1);
    expect(summary.slotAccountedCount).toBe(3);
  });

  it('parses legacy Run 1 frozen slot records', () => {
    const raw = readFileSync(
      join(
        __dirname,
        '../../../../../architecture/drivingintelligence/evidence/reference-capture/EXP_021_KS_MX_2024_PHYSICAL_90_60_2026-09-15.json',
      ),
      'utf8',
    );
    const freeze = JSON.parse(raw) as {
      phase90: { slots: Array<Record<string, unknown>> };
    };
    const legacy = parseLegacyForensicSlotRecord(freeze.phase90.slots[0]);
    expect(legacy.slotIndex).toBe(0);
    expect(legacy.dueAtMs).toBe(Date.parse('2026-09-15T11:39:01.000Z'));
    expect(legacy.issuedAtMs).toBe(Date.parse('2026-09-15T11:41:18.450Z'));
    expect(legacy.providerCallSucceeded).toBe(true);
  });

  it('prefers ledger over stale summary counters and exposes slotLedgerParity=NO', () => {
    const raw = readFileSync(
      join(
        __dirname,
        '../../../../../architecture/drivingintelligence/evidence/reference-capture/EXP_021_KS_MX_2024_PHYSICAL_90_60_2026-09-15.json',
      ),
      'utf8',
    );
    const freeze = JSON.parse(raw) as {
      phase90: {
        slotSuccessCount: number;
        slotFailureCount: number;
        slots: Array<Record<string, unknown>>;
      };
      phase60: {
        slotSuccessCount: number;
        slotFailureCount: number;
        slots: Array<Record<string, unknown>>;
      };
    };

    const phase90Ledger = mapLegacyFreezeSlotsToLedger(freeze.phase90.slots);
    const phase60Ledger = mapLegacyFreezeSlotsToLedger(freeze.phase60.slots);

    const phase90Summary = {
      calibrationPhaseId: 'phase-90',
      phaseSequence: 1,
      effectivePollIntervalMs: 90_000,
      phaseStartedAt: new Date(t0Ms).toISOString(),
      phaseEndedAt: new Date(t0Ms + 600_000).toISOString(),
      durationMs: 600_000,
      effectiveConfig: {} as never,
      providerRequestCount: 7,
      providerSuccessCount: 7,
      providerZeroResultCount: 0,
      providerErrorCount: 0,
      providerBucketCount: 33,
      newBucketCount: 165,
      duplicateBucketCount: 0,
      revisionBucketCount: 0,
      recoveredLateBucketCount: 0,
      nativeUniqueTemporalBucketStartCount: 33,
      nativeMaxTemporalGapMs: null,
      nativeMedianTemporalCadenceMs: null,
      nativeP90TemporalCadenceMs: null,
      maxIntraResponseTemporalGapMs: null,
      allRequestCount: 7,
      transitionWindowCount: 0,
      transitionProviderBucketCount: 0,
      recoverySweepRequestCount: 0,
      uniqueTemporalBucketStartCount: 33,
      slotCount: freeze.phase90.slots.length,
      slotSuccessCount: freeze.phase90.slotSuccessCount,
      slotZeroResultCount: 0,
      slotFailureCount: 0,
      slotSkippedCount: 0,
      slotAccountedCount: 0,
      exp021RequestSlots: phase90Ledger,
    };

    const phase90Forensic = buildForensicPhaseSlotSummary(phase90Summary);
    expect(phase90Forensic.slotSuccessCount).toBe(7);
    expect(phase90Forensic.slotLedgerParity).toBe('NO');

    const phase60Summary = {
      ...phase90Summary,
      calibrationPhaseId: 'phase-60',
      phaseSequence: 2,
      effectivePollIntervalMs: 60_000,
      slotCount: freeze.phase60.slots.length,
      slotSuccessCount: freeze.phase60.slotSuccessCount,
      slotFailureCount: freeze.phase60.slotFailureCount,
      exp021RequestSlots: phase60Ledger,
    };
    const phase60Forensic = buildForensicPhaseSlotSummary(phase60Summary);
    expect(phase60Forensic.slotSuccessCount).toBe(9);
    expect(phase60Forensic.slotFailureCount).toBe(1);
    expect(phase60Forensic.slotLedgerParity).toBe('NO');
  });

  it('exposes canonical first-phase authority in forensic bundle', () => {
    const preflight = mergeExp021PhysicalAuthority(
      {},
      {
        canonicalT0At: '2026-09-15T11:39:01.000Z',
        firstQualifyingMovementAt: '2026-09-15T11:39:01.000Z',
        startConfirmedAt: '2026-09-15T11:39:02.000Z',
        persistedAt: '2026-09-15T11:39:02.000Z',
        orchestrationState: 'DRIVING',
        physicalPhase60StartedAt: '2026-09-15T11:39:01.000Z',
      },
    );
    const view = buildForensicPhysicalAuthorityView(preflight);
    expect(view?.physicalFirstPhaseStartedAt).toBe('2026-09-15T11:39:01.000Z');
    const bundle = extractExp021ForensicBundle({
      preflightJson: preflight,
      completedPhaseSummaries: [],
    });
    expect(bundle.physicalAuthority?.physicalFirstPhaseStartedAt).toBe(
      '2026-09-15T11:39:01.000Z',
    );
  });
});
