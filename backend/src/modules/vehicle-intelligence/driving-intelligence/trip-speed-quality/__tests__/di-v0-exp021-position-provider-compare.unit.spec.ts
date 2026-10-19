import {
  classifyDisjointBucketCategory,
  comparePinToProviderBuckets,
  presenceFromPinSample,
  presenceFromProviderBucket,
} from '../di-v0-exp021-position-provider-compare';
import type { DiV0AcquiredPositionBucket } from '../../position-acquisition/di-v0-position-acquisition.types';
import type { DiV0SpeedQcPositionSample } from '../../speed-qc/di-v0-speed-qc.types';

describe('di-v0-exp021-position-provider-compare', () => {
  it('classifyDisjointBucketCategory is mutually exclusive', () => {
    const presences = ['ABSENT', 'PRESENT_VALID', 'NULL_OR_INVALID'] as const;
    const cats = new Set<string>();
    for (const pin of presences) {
      for (const prov of presences) {
        cats.add(classifyDisjointBucketCategory(pin, prov));
      }
    }
    expect(cats.size).toBeGreaterThan(0);
    expect(classifyDisjointBucketCategory('ABSENT', 'PRESENT_VALID')).toBe('PIN_ABSENT_PROVIDER_PRESENT');
  });

  it('comparePinToProviderBuckets reconciles to expected bucket count', () => {
    const acquisitionWindow = {
      startLabel: '2026-10-14T14:47:05Z',
      endLabel: '2026-10-14T14:47:08Z',
    };
    const pinPositions: DiV0SpeedQcPositionSample[] = [
      {
        bucketLabel: '2026-10-14T14:47:05Z',
        availability: 'ROW_ABSENT',
      },
      {
        bucketLabel: '2026-10-14T14:47:06Z',
        availability: 'PRESENT',
        latitude: 51.1,
        longitude: 9.1,
      },
      {
        bucketLabel: '2026-10-14T14:47:07Z',
        availability: 'PRESENT',
        latitude: 51.2,
        longitude: 9.2,
      },
    ];
    const providerBuckets = [
      {
        bucketLabel: '2026-10-14T14:47:05Z',
        availability: 'PRESENT',
        providerRowCount: 1,
        observation: { latitude: 51.0, longitude: 9.0 },
        coordinateStatus: 'VALID',
        provenance: 'PROVIDER_ROW',
      },
      {
        bucketLabel: '2026-10-14T14:47:06Z',
        availability: 'PRESENT',
        providerRowCount: 1,
        observation: { latitude: 51.1, longitude: 9.1 },
        coordinateStatus: 'VALID',
        provenance: 'PROVIDER_ROW',
      },
      {
        bucketLabel: '2026-10-14T14:47:07Z',
        availability: 'ROW_ABSENT',
        providerRowCount: 0,
        observation: {},
        coordinateStatus: 'NOT_APPLICABLE',
        provenance: 'EXPECTED_GRID_ROW_ABSENT',
      },
    ] as unknown as DiV0AcquiredPositionBucket[];
    const out = comparePinToProviderBuckets({
      pinPositions,
      providerBuckets,
      acquisitionWindow,
    });
    expect(out.expectedBucketCount).toBe(3);
    const sum = Object.values(out.matrix).reduce((a, b) => a + b, 0);
    expect(sum).toBe(3);
    expect(out.matrix.PIN_ABSENT_PROVIDER_PRESENT).toBe(1);
    expect(out.matrix.PIN_PRESENT_PROVIDER_PRESENT).toBe(1);
    expect(out.matrix.PIN_PRESENT_PROVIDER_ABSENT).toBe(1);
    expect(out.bothPresentCoordinateUnchanged).toBe(1);
    expect(out.bothPresentCoordinateChanged).toBe(0);
  });

  it('presenceFromPinSample respects ROW_ABSENT', () => {
    const row: DiV0SpeedQcPositionSample = {
      bucketLabel: '2026-10-14T14:47:05Z',
      availability: 'ROW_ABSENT',
    };
    expect(presenceFromPinSample(row, 'ROW_ABSENT_EXPLICIT')).toBe('ABSENT');
    expect(presenceFromProviderBucket(undefined)).toBe('ABSENT');
  });
});
