import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from './raw-fuel-rise-detector.config';
import {
  RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
  type RawFuelRisePhaseScannerCalibrationBundle,
} from './raw-fuel-rise-phase-scanner.policy';
import { scanRawFuelRisePhases } from './raw-fuel-rise-phase-scanner';
import {
  buildStructuralSymbolsFromDetectorConfig,
  type RawFuelRisePhaseScannerInput,
  type RawFuelRisePhaseScannerSample,
} from './raw-fuel-rise-phase-scanner.types';

const STRUCTURAL = buildStructuralSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1);

const REPLAY_BUNDLE: RawFuelRisePhaseScannerCalibrationBundle = {
  bundleVersion: 'replay-hypothesis-v1',
  classification: 'REPLAY_HYPOTHESIS',
  maxPeakToSettledDropLiters: 3,
  maxPeakToSettledDropRatioOfRise: 0.35,
  maxPeakToSettledContinuityGapMs: 45 * 60 * 1000,
};

function pt(iso: string, liters: number): RawFuelRisePhaseScannerSample {
  return { timestamp: new Date(iso), absoluteLiters: liters };
}

function baseInput(
  samples: RawFuelRisePhaseScannerSample[],
  overrides: Partial<RawFuelRisePhaseScannerInput> = {},
): RawFuelRisePhaseScannerInput {
  return {
    samples,
    preBaseline: { medianLiters: 6, fresh: true, staleReason: null },
    riseAnchors: {
      riseOnsetAt: new Date('2026-09-30T04:57:00.000Z'),
      riseEndAt: new Date('2026-09-30T05:02:30.000Z'),
    },
    structuralSymbols: STRUCTURAL,
    calibrationBundle: REPLAY_BUNDLE,
    policyVersion: RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
    physicalIdentityAnchors: {
      prePlateauBucket: 6,
      riseOnsetAt: new Date('2026-09-30T04:57:00.000Z'),
      signalChannel: 'ABSOLUTE_LITERS',
    },
    f3Context: null,
    evidenceProvenance: { source: 'unit-test' },
    ...overrides,
  };
}

describe('R3A raw-fuel-rise-phase-scanner', () => {
  it('T01 — 6→20→19 stable plateau reaches SETTLED shadow maturity', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T04:56:00.000Z', 6),
      pt('2026-09-30T04:58:00.000Z', 15),
      pt('2026-09-30T04:59:00.000Z', 18),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:01:00.000Z', 20),
      pt('2026-09-30T05:02:00.000Z', 20),
      pt('2026-09-30T05:03:30.000Z', 19),
      pt('2026-09-30T05:04:30.000Z', 19),
      pt('2026-09-30T05:05:30.000Z', 19),
      pt('2026-09-30T05:06:30.000Z', 19),
      pt('2026-09-30T05:07:30.000Z', 19),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(r.terminalPhase).toBe('SETTLED');
    expect(r.maturityStatus).toBe('MATURE_SHADOW_READY');
    expect(r.proposal.proposedPostLiters).toBe(19);
    expect(r.proposal.proposedDeltaLiters).toBe(13);
    expect(r.instantaneousPeakLiters).toBe(20);
  });

  it('T02 — 6→20→6 true baseline return is refused', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:02:00.000Z', 20),
      pt('2026-09-30T05:10:00.000Z', 5),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(r.holdReason).toBe('TRUE_BASELINE_RETURN');
    expect(r.maturityStatus).not.toBe('MATURE_SHADOW_READY');
  });

  it('T03 — single 6→20 spike lacks settled persistence', () => {
    const samples = [pt('2026-09-30T04:55:00.000Z', 6), pt('2026-09-30T05:00:00.000Z', 20)];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(['INSUFFICIENT_POST_PERSISTENCE', 'PHASE_INCOMPLETE', 'MISSING_POST_SAMPLES']).toContain(
      r.holdReason,
    );
  });

  it('T04 — post-peak oscillation is unstable', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:01:00.000Z', 17),
      pt('2026-09-30T05:02:00.000Z', 20),
      pt('2026-09-30T05:03:00.000Z', 16),
      pt('2026-09-30T05:04:00.000Z', 19),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(r.maturityStatus).not.toBe('MATURE_SHADOW_READY');
  });

  it('T05 — sensor reset toward pre-baseline', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 22),
      pt('2026-09-30T05:05:00.000Z', 5),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(['SENSOR_RESET', 'TRUE_BASELINE_RETURN']).toContain(r.holdReason);
  });

  it('T06 — stale pre-baseline fails closed', () => {
    const r = scanRawFuelRisePhases(
      baseInput([pt('2026-09-30T05:00:00.000Z', 20)], {
        preBaseline: { medianLiters: 6, fresh: false, staleReason: 'BASELINE_TOO_OLD' },
      }),
    );
    expect(r.holdReason).toBe('STALE_PRE_BASELINE');
  });

  it('T07 — missing post samples', () => {
    const r = scanRawFuelRisePhases(
      baseInput(
        [
          pt('2026-09-30T04:55:00.000Z', 6),
          pt('2026-09-30T04:56:00.000Z', 20),
        ],
        {
          riseAnchors: {
            riseOnsetAt: new Date('2026-09-30T04:55:00.000Z'),
            riseEndAt: new Date('2026-09-30T04:56:00.000Z'),
          },
        },
      ),
    );
    expect(r.holdReason).toBe('MISSING_POST_SAMPLES');
  });

  it('T08 — insufficient post persistence', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:00:45.000Z', 19),
      pt('2026-09-30T05:01:15.000Z', 19),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(r.maturityStatus).not.toBe('MATURE_SHADOW_READY');
  });

  it('T09 — oversized intra-window gap blocks settled window', () => {
    const gapMs = STRUCTURAL.settledWindowMaxInternalGapMs + 60_000;
    const t0 = Date.parse('2026-09-30T05:02:00.000Z');
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt(new Date(t0 + gapMs).toISOString(), 19),
      pt(new Date(t0 + gapMs + 60_000).toISOString(), 19),
      pt(new Date(t0 + gapMs + 120_000).toISOString(), 19),
      pt(new Date(t0 + gapMs + 180_000).toISOString(), 19),
    ];
    const r = scanRawFuelRisePhases(
      baseInput(samples, {
        riseAnchors: {
          riseOnsetAt: new Date('2026-09-30T04:55:00.000Z'),
          riseEndAt: new Date('2026-09-30T05:02:00.000Z'),
        },
        calibrationBundle: {
          ...REPLAY_BUNDLE,
          maxPeakToSettledContinuityGapMs: 5 * 60 * 1000,
        },
      }),
    );
    expect(['PEAK_SETTLED_CONTINUITY_GAP', 'PHASE_INCOMPLETE', 'INSUFFICIENT_POST_PERSISTENCE']).toContain(
      r.holdReason,
    );
    expect(r.maturityStatus).not.toBe('MATURE_SHADOW_READY');
  });

  it('T10 — oversized peak→settled continuity gap', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:02:00.000Z', 20),
      pt('2026-09-30T05:08:00.000Z', 19),
      pt('2026-09-30T05:09:00.000Z', 19),
      pt('2026-09-30T05:10:00.000Z', 19),
      pt('2026-09-30T05:11:00.000Z', 19),
    ];
    const r = scanRawFuelRisePhases(
      baseInput(samples, {
        calibrationBundle: {
          ...REPLAY_BUNDLE,
          maxPeakToSettledContinuityGapMs: 5 * 60 * 1000,
        },
      }),
    );
    expect(r.holdReason).toBe('PEAK_SETTLED_CONTINUITY_GAP');
  });

  it('T11 — delayed observation without settling shape stays immature', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T06:30:00.000Z', 18),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(r.maturityStatus).not.toBe('MATURE_SHADOW_READY');
  });

  it('T12 — two material rises separated', () => {
    const samples = [
      pt('2026-09-30T04:00:00.000Z', 6),
      pt('2026-09-30T04:30:00.000Z', 20),
      pt('2026-09-30T05:00:00.000Z', 6),
      pt('2026-09-30T05:30:00.000Z', 22),
      pt('2026-09-30T06:00:00.000Z', 6),
    ];
    const r = scanRawFuelRisePhases(
      baseInput(samples, {
        riseAnchors: {
          riseOnsetAt: new Date('2026-09-30T04:00:00.000Z'),
          riseEndAt: new Date('2026-09-30T06:00:00.000Z'),
        },
      }),
    );
    expect(r.holdReason).toBe('SECOND_REFUEL_SEPARATED');
    expect(r.separatedEpisodeCount).toBeGreaterThan(1);
  });

  it('T13 — later consumption does not redefine settled median', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:02:00.000Z', 20),
      pt('2026-09-30T05:04:00.000Z', 19),
      pt('2026-09-30T05:05:00.000Z', 19),
      pt('2026-09-30T05:06:00.000Z', 19),
      pt('2026-09-30T08:00:00.000Z', 10),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(r.proposal.proposedPostLiters).toBe(19);
  });

  it('T14 — strong regression >1 L remains shadow-only analysis', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 22),
      pt('2026-09-30T05:02:00.000Z', 22),
      pt('2026-09-30T05:04:00.000Z', 20),
      pt('2026-09-30T05:05:00.000Z', 20),
      pt('2026-09-30T05:06:00.000Z', 20),
    ];
    const r = scanRawFuelRisePhases(
      baseInput(samples, {
        calibrationBundle: {
          ...REPLAY_BUNDLE,
          maxPeakToSettledDropLiters: 1.5,
        },
      }),
    );
    expect(r.holdReason).toBe('CALIBRATION_BOUND_EXCEEDED');
    expect(r.hypotheticalReinterpretation).toBe(true);
    expect(r.maturityStatus).toBe('PROVISIONAL');
  });

  it('T15 — peak identical to settled median', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:02:00.000Z', 20),
      pt('2026-09-30T05:04:00.000Z', 20),
      pt('2026-09-30T05:05:00.000Z', 20),
      pt('2026-09-30T05:06:00.000Z', 20),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(r.peakToSettledDropLiters).toBe(0);
    expect(r.maturityStatus).toBe('MATURE_SHADOW_READY');
  });

  it('T16 — 1 L quantized observations', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 10),
      pt('2026-09-30T05:01:00.000Z', 14),
      pt('2026-09-30T05:02:00.000Z', 18),
      pt('2026-09-30T05:04:00.000Z', 18),
      pt('2026-09-30T05:05:00.000Z', 18),
      pt('2026-09-30T05:06:00.000Z', 18),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(r.maturityStatus).toBe('MATURE_SHADOW_READY');
  });

  it('T17 — invalid calibration bundle', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:02:00.000Z', 20),
      pt('2026-09-30T05:04:00.000Z', 19),
      pt('2026-09-30T05:05:00.000Z', 19),
      pt('2026-09-30T05:06:00.000Z', 19),
    ];
    const r = scanRawFuelRisePhases(
      baseInput(samples, {
        calibrationBundle: null,
      }),
    );
    expect(r.holdReason).toBe('INVALID_CALIBRATION_BUNDLE');
  });

  it('T18 — malformed duplicate timestamps', () => {
    const samples = [
      pt('2026-09-30T05:00:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
    ];
    const r = scanRawFuelRisePhases(baseInput(samples));
    expect(r.holdReason).toBe('MALFORMED_INPUT');
  });

  it('T21 — two in-window rises 6→20→19 then 27→26 do not merge to delta 20', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T04:56:00.000Z', 6),
      pt('2026-09-30T04:58:00.000Z', 15),
      pt('2026-09-30T04:59:00.000Z', 18),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:01:00.000Z', 20),
      pt('2026-09-30T05:02:00.000Z', 20),
      pt('2026-09-30T05:03:30.000Z', 19),
      pt('2026-09-30T05:04:30.000Z', 19),
      pt('2026-09-30T05:05:30.000Z', 19),
      pt('2026-09-30T05:06:30.000Z', 19),
      pt('2026-09-30T05:20:00.000Z', 22),
      pt('2026-09-30T05:21:00.000Z', 27),
      pt('2026-09-30T05:22:00.000Z', 27),
      pt('2026-09-30T05:23:30.000Z', 26),
      pt('2026-09-30T05:24:30.000Z', 26),
      pt('2026-09-30T05:25:30.000Z', 26),
      pt('2026-09-30T05:26:30.000Z', 26),
    ];
    const r = scanRawFuelRisePhases(
      baseInput(samples, {
        riseAnchors: {
          riseOnsetAt: new Date('2026-09-30T04:57:00.000Z'),
          riseEndAt: new Date('2026-09-30T05:02:30.000Z'),
        },
      }),
    );
    expect(r.holdReason).toBe('SECOND_REFUEL_SEPARATED');
    expect(r.maturityStatus).not.toBe('MATURE_SHADOW_READY');
    expect(r.proposal.proposedDeltaLiters).not.toBe(20);
    expect(r.instantaneousPeakLiters).toBe(20);
  });

  it('T19 — repeated execution is deterministic', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:02:00.000Z', 20),
      pt('2026-09-30T05:04:00.000Z', 19),
      pt('2026-09-30T05:05:00.000Z', 19),
      pt('2026-09-30T05:06:00.000Z', 19),
    ];
    const a = scanRawFuelRisePhases(baseInput(samples));
    const b = scanRawFuelRisePhases(baseInput(samples));
    expect(a).toEqual(b);
  });

  it('T20a — unknown future F3 rejection reason remains blocked', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:04:00.000Z', 19),
      pt('2026-09-30T05:05:00.000Z', 19),
      pt('2026-09-30T05:06:00.000Z', 19),
    ];
    const r = scanRawFuelRisePhases(
      baseInput(samples, {
        f3Context: { lifecycleState: 'REJECTED', rejectionReason: 'MOTION_EVIDENCE_CONFLICT' },
      }),
    );
    expect(r.maturityStatus).toBe('REFUSED');
    expect(r.holdReason).toBe('PHASE_AWARE_REINTERPRETATION_ONLY');
  });

  it('T20 — terminal F3 REJECTED remains dominant', () => {
    const samples = [
      pt('2026-09-30T04:55:00.000Z', 6),
      pt('2026-09-30T05:00:00.000Z', 20),
      pt('2026-09-30T05:04:00.000Z', 19),
      pt('2026-09-30T05:05:00.000Z', 19),
      pt('2026-09-30T05:06:00.000Z', 19),
    ];
    const r = scanRawFuelRisePhases(
      baseInput(samples, {
        f3Context: { lifecycleState: 'REJECTED', rejectionReason: 'RISE_NOT_STABLE' },
      }),
    );
    expect(r.maturityStatus).toBe('REFUSED');
    expect(r.holdReason).toBe('PHASE_AWARE_REINTERPRETATION_ONLY');
  });
});
