import {
  FULL_R1_002_DEVICE_IDENTITY,
  FULL_R1_002_GOLDEN,
} from '../../../position-acquisition/__tests__/fixtures/full-r1-002-golden.fixture';

/**
 * S3B hook onto the committed S3A golden **C1-MOBILE-FULL-R1-002** (same identity, token,
 * window, and sealed ROW_ABSENT gap).
 *
 * PROVENANCE: STRUCTURAL_DERIVED. The repository holds no captured R1 OBD rows for this run
 * (the golden is position-only, from `C1E_POSITION_AVG_RAW.json`). These rows are adversarial
 * placeholders placed on the golden's timeline — inside the sealed gap, during the frozen hold,
 * at release, and in post-release incomplete support — to prove R1 cannot create or override L3.
 * They are NOT provider-captured values and must not be used as calibration material.
 */
export const FULL_R1_002_S3B_PROVENANCE = {
  goldenExperimentId: FULL_R1_002_GOLDEN.experimentId,
  positionSource: FULL_R1_002_GOLDEN.sourceEvidence,
  r1RowProvenance: 'STRUCTURAL_DERIVED',
  capturedR1ObdRowsInRepo: false,
} as const;

export const FULL_R1_002_S3B_DEVICE_IDENTITY = FULL_R1_002_DEVICE_IDENTITY;

export const FULL_R1_002_S3B_LABELS = {
  insideGap: '2026-09-26T19:07:30Z',
  gapEdge: '2026-09-26T19:07:49Z',
  hold: ['2026-09-26T19:07:53Z', '2026-09-26T19:07:54Z', '2026-09-26T19:07:55Z'],
  release: '2026-09-26T19:08:02Z',
  postReleaseIncomplete: '2026-09-26T19:08:03Z',
  validL3: '2026-09-26T19:08:10Z',
} as const;

function row(timestamp: string, speed: number): Record<string, unknown> {
  return {
    timestamp,
    speed,
    powertrainCombustionEngineSpeed: 1600,
    obdThrottlePosition: 18,
    obdEngineLoad: 35,
    powertrainCombustionEngineECT: 86,
    powertrainTransmissionCurrentGear: 2,
  };
}

export const FULL_R1_002_S3B_STRUCTURAL_R1_ROWS: ReadonlyArray<Record<string, unknown>> = [
  row(FULL_R1_002_S3B_LABELS.insideGap, 80),
  row(FULL_R1_002_S3B_LABELS.gapEdge, 80),
  ...FULL_R1_002_S3B_LABELS.hold.map((l) => row(l, 45)),
  row(FULL_R1_002_S3B_LABELS.release, 30),
  row(FULL_R1_002_S3B_LABELS.postReleaseIncomplete, 35),
  row(FULL_R1_002_S3B_LABELS.validL3, 140),
];
