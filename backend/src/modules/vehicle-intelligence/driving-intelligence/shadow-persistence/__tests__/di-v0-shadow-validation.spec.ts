import { mapIntervalResultToPersistRow } from '../di-v0-shadow-mapper';
import { validateShadowIntervalRow } from '../di-v0-shadow-validation';
import type { DiV0IntervalSpeedResult } from '../../core/types';
import { DEFAULT_DI_V0_VERSION_TUPLE } from '../../core/versions';

function baseInterval(overrides: Partial<DiV0IntervalSpeedResult> = {}): DiV0IntervalSpeedResult {
  return {
    intervalStart: '2026-01-01T00:00:00Z',
    intervalEnd: '2026-01-01T00:00:01Z',
    referenceTime: '2026-01-01T00:00:00.500Z',
    motionState: 'MOVING_SPEED_ESTIMATED',
    estimatedSpeedKmh: 42,
    speedRangeKmh: [40, 44],
    speedEvidenceState: 'NUMERIC_HIGH',
    positionState: 'FRESH',
    causalPositionState: 'FRESH',
    temporalConfidence: 'BUCKET_BOUNDED',
    valueConfidence: 'HIGH',
    sourceRelation: 'SUPPORTED',
    evidenceSources: ['L3'],
    sourceQualityFlags: [],
    abstentionReason: null,
    claimLevel: 'L2',
    provenance: {
      sourceFamily: 'RUPTELA_R1',
      sourceSignal: 'currentLocationCoordinates',
      sourceQuality: 'normalized',
      temporalSemantics: 'BUCKET_BOUNDED',
      supportIntervalStart: '2026-01-01T00:00:00Z',
      supportIntervalEnd: '2026-01-01T00:00:02Z',
      derivationMethod: 'L3_CENTERED_PATH',
      derivationVersion: DEFAULT_DI_V0_VERSION_TUPLE.estimatorVersion,
      structuralVersion: DEFAULT_DI_V0_VERSION_TUPLE.structuralVersion,
      calibrationVersion: DEFAULT_DI_V0_VERSION_TUPLE.calibrationVersion,
      sourceFamilyPolicyVersion: DEFAULT_DI_V0_VERSION_TUPLE.sourceFamilyPolicyVersion,
      derivedFrom: ['LOCATION_DERIVED_SPEED_ESTIMATE'],
    },
    intervalMeanSpeedLowerBoundKmh: null,
    ...overrides,
  };
}

describe('DiV0Shadow validation', () => {
  it('rejects non-finite estimated speed', () => {
    expect(() =>
      mapIntervalResultToPersistRow(
        baseInterval({ estimatedSpeedKmh: Number.NaN }),
        DEFAULT_DI_V0_VERSION_TUPLE,
      ),
    ).toThrow(/INVALID_ESTIMATED_SPEED_KMH/);
  });

  it('rejects invalid motion state', () => {
    expect(() =>
      mapIntervalResultToPersistRow(
        baseInterval({ motionState: 'NOT_A_STATE' as DiV0IntervalSpeedResult['motionState'] }),
        DEFAULT_DI_V0_VERSION_TUPLE,
      ),
    ).toThrow(/MOTION_STATE/);
  });

  it('rejects negative estimated speed', () => {
    expect(() =>
      validateShadowIntervalRow({
        intervalStart: new Date('2026-01-01T00:00:00Z'),
        intervalEnd: new Date('2026-01-01T00:00:01Z'),
        referenceTime: new Date('2026-01-01T00:00:00.500Z'),
        motionState: 'MOVING_SPEED_ESTIMATED',
        positionState: 'FRESH',
        causalPositionState: 'FRESH',
        estimatedSpeedKmh: -1,
        speedRangeMinKmh: null,
        speedRangeMaxKmh: null,
        speedEvidenceState: null,
        temporalConfidence: 'BUCKET_BOUNDED',
        valueConfidence: 'HIGH',
        sourceRelation: 'SUPPORTED',
        claimLevel: 'L2',
        abstentionReason: null,
        evidenceSources: [],
        sourceQualityFlags: [],
        supportIntervalStart: null,
        supportIntervalEnd: null,
        derivationMethod: 'L3_CENTERED_PATH',
        derivationVersion: 'v',
        provenance: {},
      }),
    ).toThrow(/INVALID_ESTIMATED_SPEED_KMH/);
  });

  it('rejects speed range min greater than max', () => {
    expect(() =>
      validateShadowIntervalRow({
        intervalStart: new Date('2026-01-01T00:00:00Z'),
        intervalEnd: new Date('2026-01-01T00:00:01Z'),
        referenceTime: new Date('2026-01-01T00:00:00.500Z'),
        motionState: 'MOVING_SPEED_ESTIMATED',
        positionState: 'FRESH',
        causalPositionState: 'FRESH',
        estimatedSpeedKmh: null,
        speedRangeMinKmh: 50,
        speedRangeMaxKmh: 10,
        speedEvidenceState: null,
        temporalConfidence: 'BUCKET_BOUNDED',
        valueConfidence: 'HIGH',
        sourceRelation: 'SUPPORTED',
        claimLevel: 'L2',
        abstentionReason: null,
        evidenceSources: [],
        sourceQualityFlags: [],
        supportIntervalStart: null,
        supportIntervalEnd: null,
        derivationMethod: 'L3_CENTERED_PATH',
        derivationVersion: 'v',
        provenance: {},
      }),
    ).toThrow(/INVALID_SPEED_RANGE_ORDER/);
  });

  it('rejects L3 claim with numeric L3 speed', () => {
    expect(() =>
      validateShadowIntervalRow({
        intervalStart: new Date('2026-01-01T00:00:00Z'),
        intervalEnd: new Date('2026-01-01T00:00:01Z'),
        referenceTime: new Date('2026-01-01T00:00:00.500Z'),
        motionState: 'MOVING_SPEED_ESTIMATED',
        positionState: 'FRESH',
        causalPositionState: 'FRESH',
        estimatedSpeedKmh: 10,
        speedRangeMinKmh: null,
        speedRangeMaxKmh: null,
        speedEvidenceState: 'NUMERIC_HIGH',
        temporalConfidence: 'BUCKET_BOUNDED',
        valueConfidence: 'HIGH',
        sourceRelation: 'SUPPORTED',
        claimLevel: 'L3',
        abstentionReason: null,
        evidenceSources: [],
        sourceQualityFlags: [],
        supportIntervalStart: null,
        supportIntervalEnd: null,
        derivationMethod: 'L3_CENTERED_PATH',
        derivationVersion: 'v',
        provenance: {},
      }),
    ).toThrow(/CLAIM_L3/);
  });
});
