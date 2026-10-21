import { DEFAULT_DI_V0_VERSION_TUPLE } from '../../core/versions';
import { buildDiV0ShadowRunIdempotencyKey } from '../../shadow-persistence/di-v0-shadow-idempotency';
import { acquireDiV0HistoricalPositions } from '../di-v0-position-acquisition';
import type { DiV0PositionAcquisitionRequest } from '../di-v0-position-acquisition.types';
import { DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1 } from '../di-v0-position-acquisition.versions';
import { canonicalNumber } from '../di-v0-position-snapshot';
import { resolveDiV0SourceFamily } from '../di-v0-position-source-family';
import {
  API_SYNTHETIC_IDENTITY,
  buildRequest,
  expectAcquired,
  labelAt,
  nullLocationRow,
  R1_IDENTITY,
  row,
  signalsBody,
  staticTransport,
  UNKNOWN_IDENTITY,
} from './position-acquisition-test-helpers';

const BASE = '2026-09-26T10:00:00Z';
const TO = labelAt(BASE, 5);

const BASE_ROWS = [
  row(BASE, 51.3353783, 9.506005),
  row(labelAt(BASE, 1), 51.33545, 9.50605),
  nullLocationRow(labelAt(BASE, 3)),
  row(labelAt(BASE, 4), 51.3356, 9.5062),
];

async function snapshotOf(
  rows: unknown[],
  requestOverrides: Partial<DiV0PositionAcquisitionRequest> = {},
  now = new Date('2030-01-01T00:00:00Z'),
) {
  const result = expectAcquired(
    await acquireDiV0HistoricalPositions(
      buildRequest(BASE, TO, requestOverrides),
      staticTransport(signalsBody(rows)),
      { now: () => now },
    ),
  );
  return result;
}

describe('S3A source-family resolution (canonical resolver, not hardwareType)', () => {
  it('R1 aftermarket serial → RUPTELA_R1 with uncertain historical OBD record time', () => {
    expect(resolveDiV0SourceFamily(R1_IDENTITY)).toEqual({
      sourceFamily: 'RUPTELA_R1',
      policyVersion: 'SOURCE_FAMILY_POLICY_V0_1',
      evidence: 'DIMO_DEVICE_IDENTITY',
      historicalObdRecordTimeUncertain: true,
      s1Supported: true,
    });
  });

  it('deceptive case: vehicle routed as LTE_R1 but DIMO identity is synthetic → API_SYNTHETIC', async () => {
    const request = {
      ...buildRequest(BASE, TO, { dimoDeviceIdentity: API_SYNTHETIC_IDENTITY }),
      hardwareType: 'LTE_R1',
    } as DiV0PositionAcquisitionRequest;
    const result = expectAcquired(
      await acquireDiV0HistoricalPositions(request, staticTransport(signalsBody([])), {}),
    );
    expect(result.sourceFamily).toBe('API_SYNTHETIC');
    expect(result.sourceFamilyResolution.historicalObdRecordTimeUncertain).toBe(false);
    expect(result.observations.every((o) => o.sourceFamily === 'API_SYNTHETIC')).toBe(true);
  });

  it('non-R1 aftermarket / conflicting / missing identity → UNKNOWN (fail closed), evidence still normalized', async () => {
    expect(resolveDiV0SourceFamily(UNKNOWN_IDENTITY).sourceFamily).toBe('UNKNOWN');
    expect(
      resolveDiV0SourceFamily({ aftermarketDevice: { serial: 'R1-X' }, syntheticDevice: { id: 1 } }).sourceFamily,
    ).toBe('UNKNOWN');
    expect(resolveDiV0SourceFamily(null).sourceFamily).toBe('UNKNOWN');
    const result = await snapshotOf(BASE_ROWS, { dimoDeviceIdentity: UNKNOWN_IDENTITY });
    expect(result.sourceFamily).toBe('UNKNOWN');
    expect(result.sourceFamilyResolution.s1Supported).toBe(false);
    expect(result.sourceFamilyResolution.historicalObdRecordTimeUncertain).toBe(false);
    expect(result.presentCount).toBe(3);
  });
});

describe('S3A snapshot identity', () => {
  it('is deterministic and versioned', async () => {
    const a = await snapshotOf(BASE_ROWS);
    const b = await snapshotOf(BASE_ROWS);
    expect(a.snapshotIdentity).toEqual(b.snapshotIdentity);
    expect(a.snapshotIdentity.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(a.snapshotIdentity.inputEvidenceVersion).toBe(
      `${DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1}:sha256:${a.snapshotIdentity.digest}`,
    );
  });

  it('is independent of provider row order and object key order', async () => {
    const reordered = [BASE_ROWS[3], BASE_ROWS[0], BASE_ROWS[2], BASE_ROWS[1]].map((r) =>
      Object.fromEntries(Object.entries(r).reverse()),
    );
    expect((await snapshotOf(reordered)).snapshotIdentity).toEqual((await snapshotOf(BASE_ROWS)).snapshotIdentity);
  });

  it('excludes acquisition time, organization and trip', async () => {
    const a = await snapshotOf(BASE_ROWS);
    const b = await snapshotOf(
      BASE_ROWS,
      { organizationId: 'org-other', tripId: 'trip-other' },
      new Date('2031-06-01T00:00:00Z'),
    );
    expect(b.acquisitionProvenance.acquiredAtUtc).not.toBe(a.acquisitionProvenance.acquiredAtUtc);
    expect(b.snapshotIdentity).toEqual(a.snapshotIdentity);
  });

  it.each([
    ['coordinate change', [row(BASE, 51.3353784, 9.506005), ...BASE_ROWS.slice(1)]],
    ['SIGNAL_NULL → ROW_ABSENT', [...BASE_ROWS.slice(0, 2), BASE_ROWS[3]]],
    ['ROW_ABSENT → SIGNAL_NULL', [...BASE_ROWS, nullLocationRow(labelAt(BASE, 2))]],
    ['identical duplicate added', [...BASE_ROWS, row(BASE, 51.3353783, 9.506005)]],
    ['rejected row added', [...BASE_ROWS, row(labelAt(BASE, 5), 51, 9)]],
  ])('changes when evidence changes: %s', async (_name, rows) => {
    expect((await snapshotOf(rows as unknown[])).snapshotIdentity.digest).not.toBe(
      (await snapshotOf(BASE_ROWS)).snapshotIdentity.digest,
    );
  });

  it('changes with subject and source family', async () => {
    const base = (await snapshotOf(BASE_ROWS)).snapshotIdentity.digest;
    expect((await snapshotOf(BASE_ROWS, { dimoTokenId: 7 })).snapshotIdentity.digest).not.toBe(base);
    expect((await snapshotOf(BASE_ROWS, { vehicleId: 'vehicle-other' })).snapshotIdentity.digest).not.toBe(base);
    expect(
      (await snapshotOf(BASE_ROWS, { dimoDeviceIdentity: API_SYNTHETIC_IDENTITY })).snapshotIdentity.digest,
    ).not.toBe(base);
  });

  it('canonical number rendering normalizes -0 and is locale independent', () => {
    expect(canonicalNumber(-0)).toBe('0');
    expect(canonicalNumber(51.3353783)).toBe('51.3353783');
    expect(canonicalNumber(1e-7)).toBe('1e-7');
  });

  it('never contains credentials', async () => {
    const result = await snapshotOf(BASE_ROWS);
    expect(JSON.stringify(result)).not.toMatch(/Bearer|eyJ|authorization|jwt/i);
  });
});

describe('S3A → S2 compatibility (identity only; no persistence call)', () => {
  it('inputEvidenceVersion is a non-empty string that drives the S2 run idempotency key', async () => {
    const a = await snapshotOf(BASE_ROWS);
    const b = await snapshotOf([row(BASE, 51.3353784, 9.506005), ...BASE_ROWS.slice(1)]);
    expect(typeof a.snapshotIdentity.inputEvidenceVersion).toBe('string');
    expect(a.snapshotIdentity.inputEvidenceVersion.length).toBeGreaterThan(0);
    const identity = (inputEvidenceVersion: string) => ({
      organizationId: 'org-test',
      vehicleId: 'vehicle-test',
      tripId: 'trip-test',
      sourceFamily: a.sourceFamily,
      versions: DEFAULT_DI_V0_VERSION_TUPLE,
      inputEvidenceVersion,
    });
    expect(buildDiV0ShadowRunIdempotencyKey(identity(a.snapshotIdentity.inputEvidenceVersion))).toBe(
      buildDiV0ShadowRunIdempotencyKey(identity(a.snapshotIdentity.inputEvidenceVersion)),
    );
    expect(buildDiV0ShadowRunIdempotencyKey(identity(a.snapshotIdentity.inputEvidenceVersion))).not.toBe(
      buildDiV0ShadowRunIdempotencyKey(identity(b.snapshotIdentity.inputEvidenceVersion)),
    );
  });

  it('emits at most one observation per bucket label (S2 interval uniqueness)', async () => {
    const result = await snapshotOf([...BASE_ROWS, row(BASE, 51.3353783, 9.506005), row(labelAt(BASE, 1), 50, 9)]);
    const labels = result.observations.map((o) => o.bucketLabel);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toHaveLength(result.expectedBucketCount);
  });
});
