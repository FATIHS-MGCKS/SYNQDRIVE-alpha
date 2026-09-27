import { acquireDiV0HistoricalPositions } from '../di-v0-position-acquisition';
import { buildDiV0HistoricalPositionQuery } from '../di-v0-position-query';
import {
  buildExpectedBucketLabels,
  deriveSecondAlignedEnclosingWindow,
  validateDiV0PositionWindow,
} from '../di-v0-position-window';
import { DI_V0_POSITION_QUERY_SPEC_V0_1 } from '../di-v0-position-acquisition.versions';
import {
  buildRequest,
  expectAcquired,
  FIXED_NOW,
  labelAt,
  nullLocationRow,
  row,
  signalsBody,
  staticTransport,
} from './position-acquisition-test-helpers';

const BASE = '2026-09-26T10:00:00Z';
const opts = { now: () => FIXED_NOW };

async function acquire(rows: unknown[] | null, seconds: number, from = BASE) {
  const transport = staticTransport(signalsBody(rows));
  const outcome = await acquireDiV0HistoricalPositions(
    buildRequest(from, labelAt(from, seconds)),
    transport,
    opts,
  );
  return { result: expectAcquired(outcome), transport };
}

describe('S3A query specification', () => {
  it('builds a 1s signals query selecting only the bucket label and location (AVG)', () => {
    const window = validateDiV0PositionWindow(BASE, labelAt(BASE, 60));
    const query = buildDiV0HistoricalPositionQuery(4242, window);
    expect(query).toContain('signals(');
    expect(query).toContain('tokenId: 4242');
    expect(query).toContain(`from: "${BASE}"`);
    expect(query).toContain(`to: "${labelAt(BASE, 60)}"`);
    expect(query).toContain('interval: "1s"');
    expect(query).toContain('currentLocationCoordinates(agg: AVG) { latitude longitude }');
    expect(query).not.toMatch(/speed|powertrain|obd/i);
    expect(DI_V0_POSITION_QUERY_SPEC_V0_1.interval).toBe('1s');
    expect(DI_V0_POSITION_QUERY_SPEC_V0_1.gridBoundary).toBe('FROM_INCLUSIVE_TO_EXCLUSIVE');
  });

  it('transport receives the tenant-scoped subject and the built query', async () => {
    const { transport } = await acquire([], 5);
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]).toMatchObject({
      organizationId: 'org-test',
      vehicleId: 'vehicle-test',
      dimoTokenId: 424242,
    });
    expect(transport.calls[0].query).toContain('interval: "1s"');
  });
});

describe('S3A grid reconstruction (Step 22)', () => {
  it('00 valid, 01 valid, 02 no row, 03 null location, 04 valid', async () => {
    const { result } = await acquire(
      [
        row(labelAt(BASE, 0), 51.1, 9.1),
        row(labelAt(BASE, 1), 51.2, 9.2),
        nullLocationRow(labelAt(BASE, 3)),
        row(labelAt(BASE, 4), 51.4, 9.4),
      ],
      5,
    );
    expect(result.buckets.map((b) => b.availability)).toEqual([
      'PRESENT',
      'PRESENT',
      'ROW_ABSENT',
      'SIGNAL_NULL',
      'PRESENT',
    ]);
    expect(result.expectedBucketCount).toBe(5);
    expect(result.presentCount + result.signalNullCount + result.rowAbsentCount).toBe(5);
    expect(result.observations[2].latitude).toBeUndefined();
    expect(result.observations[2].provenance.derivedFrom).toContain('EXPECTED_GRID_ROW_ABSENT');
    expect(result.observations[3].latitude).toBeUndefined();
  });

  it('no interpolation / fill-forward: absent and null buckets never receive coordinates', async () => {
    const rows = [row(labelAt(BASE, 0), 51, 9), row(labelAt(BASE, 9), 52, 10)];
    for (let s = 3; s < 6; s++) rows.push(nullLocationRow(labelAt(BASE, s)));
    const { result } = await acquire(rows, 10);
    const withCoords = result.observations.filter((o) => o.latitude != null);
    expect(withCoords.map((o) => o.bucketLabel)).toEqual([labelAt(BASE, 0), labelAt(BASE, 9)]);
    expect(result.rowAbsentCount).toBe(5);
    expect(result.signalNullCount).toBe(3);
  });

  it('valid rows are BUCKET_BOUNDED, never EXACT_PROVEN; non-usable rows are UNKNOWN', async () => {
    const { result } = await acquire([row(labelAt(BASE, 0), 51, 9), nullLocationRow(labelAt(BASE, 1))], 3);
    expect(result.buckets[0].temporalConfidence).toBe('BUCKET_BOUNDED');
    expect(result.buckets[1].temporalConfidence).toBe('UNKNOWN');
    expect(result.buckets[2].temporalConfidence).toBe('UNKNOWN');
    expect(result.buckets.some((b) => b.temporalConfidence === 'EXACT_PROVEN')).toBe(false);
  });

  it('single-sample semantics: row timestamp is a bucket label, interval is [label, label+1s)', async () => {
    const { result } = await acquire([row(labelAt(BASE, 2), 51, 9)], 3);
    const obs = result.observations[2];
    expect(obs.bucketLabel).toBe(labelAt(BASE, 2));
    expect(obs.intervalStart).toBe(labelAt(BASE, 2));
    expect(obs.intervalEnd).toBe(labelAt(BASE, 3));
    expect(obs).not.toHaveProperty('sourceTimestamp');
    expect(JSON.stringify(result)).not.toMatch(/sourceTimestamp|sampleTime/);
  });

  it('pre-classification only: no FRESH/FROZEN/RELEASE or motion states are assigned', async () => {
    const rows = [];
    for (let s = 0; s < 6; s++) rows.push(row(labelAt(BASE, s), 51.3353783, 9.506005));
    const { result } = await acquire(rows, 6);
    const serialized = JSON.stringify(result);
    for (const token of ['FRESH', 'FROZEN', 'RELEASE', 'STATIONARY', 'positionState', 'motionState', 'estimatedSpeedKmh']) {
      expect(serialized).not.toContain(token);
    }
    expect(result.presentCount).toBe(6);
  });
});

describe('S3A coordinate validation', () => {
  const cases: { name: string; lat: unknown; lon: unknown; status: string }[] = [
    { name: 'latitude > 90', lat: 90.0001, lon: 9, status: 'LATITUDE_OUT_OF_RANGE' },
    { name: 'latitude < -90', lat: -91, lon: 9, status: 'LATITUDE_OUT_OF_RANGE' },
    { name: 'longitude > 180', lat: 51, lon: 180.5, status: 'LONGITUDE_OUT_OF_RANGE' },
    { name: 'longitude < -180', lat: 51, lon: -181, status: 'LONGITUDE_OUT_OF_RANGE' },
    { name: 'NaN latitude', lat: Number.NaN, lon: 9, status: 'NON_FINITE' },
    { name: 'Infinity longitude', lat: 51, lon: Number.POSITIVE_INFINITY, status: 'NON_FINITE' },
    { name: 'string latitude', lat: '51.1', lon: 9, status: 'NON_NUMERIC' },
    { name: 'missing latitude', lat: null, lon: 9, status: 'MISSING_LATITUDE' },
    { name: 'missing longitude', lat: 51, lon: undefined, status: 'MISSING_LONGITUDE' },
  ];

  it.each(cases)('$name → PRESENT with unusable coordinates ($status)', async ({ lat, lon, status }) => {
    const { result } = await acquire([row(BASE, lat, lon)], 1);
    const bucket = result.buckets[0];
    expect(bucket.availability).toBe('PRESENT');
    expect(bucket.coordinateStatus).toBe(status);
    expect(bucket.anomalies).toContain('INVALID_COORDINATE');
    expect(bucket.temporalConfidence).toBe('UNKNOWN');
    expect(bucket.observation.latitude).toBeUndefined();
    expect(bucket.observation.longitude).toBeUndefined();
    expect(result.invalidCoordinateCount).toBe(1);
    expect(result.qualityFlags).toContain('INVALID_COORDINATES_PRESENT');
  });

  it('0,0 is accepted as a valid coordinate (no null-island rejection)', async () => {
    const { result } = await acquire([row(BASE, 0, 0)], 1);
    expect(result.buckets[0].coordinateStatus).toBe('VALID');
    expect(result.observations[0].latitude).toBe(0);
    expect(result.observations[0].longitude).toBe(0);
  });

  it('range boundaries ±90/±180 are valid', async () => {
    const { result } = await acquire([row(BASE, 90, -180), row(labelAt(BASE, 1), -90, 180)], 2);
    expect(result.buckets.map((b) => b.coordinateStatus)).toEqual(['VALID', 'VALID']);
  });

  it('both coordinates null → SIGNAL_NULL; location key absent → PRESENT FIELD_MISSING; non-object → MALFORMED_VALUE', async () => {
    const { result } = await acquire(
      [row(BASE, null, null), { timestamp: labelAt(BASE, 1) }, { timestamp: labelAt(BASE, 2), currentLocationCoordinates: 7 }],
      3,
    );
    expect(result.buckets[0].availability).toBe('SIGNAL_NULL');
    expect(result.buckets[1]).toMatchObject({ availability: 'PRESENT', coordinateStatus: 'FIELD_MISSING' });
    expect(result.buckets[2]).toMatchObject({ availability: 'PRESENT', coordinateStatus: 'MALFORMED_VALUE' });
  });
});

describe('S3A duplicates, ordering and window boundaries', () => {
  it('identical duplicate rows collapse to one observation with an anomaly', async () => {
    const { result } = await acquire([row(BASE, 51, 9), row(BASE, 51, 9)], 1);
    expect(result.observations).toHaveLength(1);
    expect(result.buckets[0]).toMatchObject({
      availability: 'PRESENT',
      coordinateStatus: 'VALID',
      providerRowCount: 2,
    });
    expect(result.buckets[0].anomalies).toEqual(['DUPLICATE_BUCKET_IDENTICAL']);
    expect(result.duplicateBucketCount).toBe(1);
    expect(result.qualityFlags).toContain('DUPLICATE_BUCKETS_PRESENT');
  });

  it('conflicting duplicate rows fail safe: PRESENT without coordinates, never averaged or picked', async () => {
    const { result } = await acquire([row(BASE, 51, 9), row(BASE, 51.001, 9)], 1);
    const bucket = result.buckets[0];
    expect(bucket.availability).toBe('PRESENT');
    expect(bucket.coordinateStatus).toBe('CONFLICTING_DUPLICATE');
    expect(bucket.anomalies).toContain('DUPLICATE_BUCKET_CONFLICTING');
    expect(bucket.observation.latitude).toBeUndefined();
    expect(bucket.temporalConfidence).toBe('UNKNOWN');
    expect(result.qualityFlags).toContain('CONFLICTING_DUPLICATE_BUCKETS');
  });

  it('valid + null duplicate in the same bucket is a conflict', async () => {
    const { result } = await acquire([row(BASE, 51, 9), nullLocationRow(BASE)], 1);
    expect(result.buckets[0].coordinateStatus).toBe('CONFLICTING_DUPLICATE');
  });

  it('out-of-order provider rows produce the same grid as ordered rows', async () => {
    const ordered = [0, 1, 2, 3].map((s) => row(labelAt(BASE, s), 51 + s / 1000, 9));
    const a = (await acquire(ordered, 4)).result;
    const b = (await acquire([ordered[2], ordered[0], ordered[3], ordered[1]], 4)).result;
    expect(b.observations).toEqual(a.observations);
    expect(b.snapshotIdentity).toEqual(a.snapshotIdentity);
  });

  it('rows labelled at `to` or outside the window are rejected, not snapped', async () => {
    const { result } = await acquire(
      [row(labelAt(BASE, -1), 51, 9), row(BASE, 51, 9), row(labelAt(BASE, 2), 51, 9)],
      2,
    );
    expect(result.expectedBucketCount).toBe(2);
    expect(result.buckets.map((b) => b.availability)).toEqual(['PRESENT', 'ROW_ABSENT']);
    expect(result.counters.outsideWindowRows).toBe(2);
    expect(result.rejectedProviderRows.map((r) => r.reason)).toEqual(['LABEL_OUTSIDE_WINDOW', 'LABEL_OUTSIDE_WINDOW']);
    expect(result.qualityFlags).toContain('ROWS_OUTSIDE_WINDOW');
  });

  it('sub-second, missing and unparseable labels are rejected, never rounded (no phase correction)', async () => {
    const { result } = await acquire(
      [
        row('2026-09-26T10:00:00.400Z', 51, 9),
        row(undefined, 51, 9),
        row('not-a-time', 51, 9),
        'garbage',
      ],
      1,
    );
    expect(result.buckets[0].availability).toBe('ROW_ABSENT');
    expect(result.rejectedProviderRows.map((r) => r.reason).sort()).toEqual([
      'LABEL_MISSING',
      'LABEL_NOT_SECOND_ALIGNED',
      'LABEL_UNPARSEABLE',
      'ROW_NOT_OBJECT',
    ]);
    expect(result.qualityFlags).toContain('PROVIDER_ROWS_REJECTED');
  });

  it('whole-second labels with explicit zero fraction or offset normalize exactly', async () => {
    const { result } = await acquire(
      [row('2026-09-26T10:00:00.000Z', 51, 9), row('2026-09-26T12:00:01+02:00', 52, 9)],
      2,
    );
    expect(result.buckets.map((b) => b.coordinateStatus)).toEqual(['VALID', 'VALID']);
    expect(result.rejectedProviderRows).toHaveLength(0);
  });

  it.each([1, 2, 60])('window of %is has exactly that many buckets', async (seconds) => {
    const { result } = await acquire([], seconds);
    expect(result.expectedBucketCount).toBe(seconds);
    expect(result.buckets).toHaveLength(seconds);
    expect(result.buckets[0].bucketLabel).toBe(BASE);
    expect(result.buckets[seconds - 1].bucketLabel).toBe(labelAt(BASE, seconds - 1));
  });

  it('expected labels are exact seconds over [from, to)', () => {
    const window = validateDiV0PositionWindow(BASE, labelAt(BASE, 3));
    expect(buildExpectedBucketLabels(window)).toEqual([BASE, labelAt(BASE, 1), labelAt(BASE, 2)]);
  });

  it('enclosing-window helper widens explicitly and reports widening', () => {
    const enclosing = deriveSecondAlignedEnclosingWindow(
      Date.parse('2026-09-26T10:00:00.250Z'),
      Date.parse('2026-09-26T10:00:04.100Z'),
    );
    expect(enclosing).toEqual({
      fromUtc: '2026-09-26T10:00:00Z',
      toUtc: '2026-09-26T10:00:05Z',
      widenedStartMs: 250,
      widenedEndMs: 900,
    });
  });
});

describe('S3A empty responses', () => {
  it('valid empty signals array → all ROW_ABSENT (not a failure)', async () => {
    const { result } = await acquire([], 10);
    expect(result.rowAbsentCount).toBe(10);
    expect(result.providerRowCount).toBe(0);
    expect(result.qualityFlags).toEqual(['NO_PROVIDER_ROWS']);
  });

  it('signals: null → all ROW_ABSENT with PROVIDER_SIGNALS_NULL flag', async () => {
    const { result } = await acquire(null, 4);
    expect(result.rowAbsentCount).toBe(4);
    expect(result.qualityFlags).toEqual(['NO_PROVIDER_ROWS', 'PROVIDER_SIGNALS_NULL']);
  });
});
