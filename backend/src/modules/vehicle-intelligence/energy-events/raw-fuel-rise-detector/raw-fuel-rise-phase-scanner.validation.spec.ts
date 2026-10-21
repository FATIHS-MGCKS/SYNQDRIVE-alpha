import { scanRawFuelRisePhases } from './raw-fuel-rise-phase-scanner';
import {
  RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
  type RawFuelRisePhaseScannerCalibrationBundle,
} from './raw-fuel-rise-phase-scanner.policy';
import { RAW_FUEL_RISE_DETECTOR_CONFIG_V1 } from './raw-fuel-rise-detector.config';
import { buildStructuralSymbolsFromDetectorConfig } from './raw-fuel-rise-phase-scanner.types';

const STRUCTURAL = buildStructuralSymbolsFromDetectorConfig(RAW_FUEL_RISE_DETECTOR_CONFIG_V1);

const REPLAY_BUNDLE: RawFuelRisePhaseScannerCalibrationBundle = {
  bundleVersion: 'replay-hypothesis-v1',
  classification: 'REPLAY_HYPOTHESIS',
  maxPeakToSettledDropLiters: 3,
  maxPeakToSettledDropRatioOfRise: 0.35,
  maxPeakToSettledContinuityGapMs: 45 * 60 * 1000,
};

describe('R3A phase scanner validation firewall', () => {
  const base = {
    samples: [{ timestamp: new Date('2026-09-30T05:00:00.000Z'), absoluteLiters: 20 }],
    preBaseline: { medianLiters: 6, fresh: true, staleReason: null },
    riseAnchors: {
      riseOnsetAt: new Date('2026-09-30T04:57:00.000Z'),
      riseEndAt: new Date('2026-09-30T05:02:00.000Z'),
    },
    structuralSymbols: STRUCTURAL,
    calibrationBundle: REPLAY_BUNDLE,
    policyVersion: RFRF_RISE_PHASE_SCANNER_POLICY_VERSION,
    physicalIdentityAnchors: null,
    f3Context: null,
    evidenceProvenance: {},
  };

  it('rejects unsupported policy version', () => {
    const r = scanRawFuelRisePhases({ ...base, policyVersion: 'unknown-policy-v99' });
    expect(r.holdReason).toBe('UNSUPPORTED_POLICY_VERSION');
  });

  it('rejects PRODUCTION_AUTHORIZED calibration classification', () => {
    const r = scanRawFuelRisePhases({
      ...base,
      calibrationBundle: {
        ...REPLAY_BUNDLE,
        classification: 'PRODUCTION_AUTHORIZED',
      },
    });
    expect(r.holdReason).toBe('INVALID_CALIBRATION_BUNDLE');
  });

  it('rejects drop ratio above 1', () => {
    const r = scanRawFuelRisePhases({
      ...base,
      calibrationBundle: {
        ...REPLAY_BUNDLE,
        maxPeakToSettledDropRatioOfRise: 1.5,
      },
    });
    expect(r.holdReason).toBe('INVALID_CALIBRATION_BUNDLE');
  });

  it('rejects invalid rise anchors', () => {
    const r = scanRawFuelRisePhases({
      ...base,
      riseAnchors: {
        riseOnsetAt: new Date('2026-09-30T06:00:00.000Z'),
        riseEndAt: new Date('2026-09-30T05:00:00.000Z'),
      },
    });
    expect(r.holdReason).toBe('INVALID_RISE_ANCHORS');
  });
});
