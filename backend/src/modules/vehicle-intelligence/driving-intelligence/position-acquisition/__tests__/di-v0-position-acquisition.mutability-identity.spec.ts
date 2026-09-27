import { normalizeDiV0PositionResponse } from '../di-v0-position-normalizer';
import { validateDiV0PositionAcquisitionRequest } from '../di-v0-position-window';
import { resolveDiV0SourceFamily } from '../di-v0-position-source-family';
import {
  FULL_R1_002_DEVICE_IDENTITY,
  FULL_R1_002_GOLDEN,
  FULL_R1_002_PROVIDER_ROWS,
} from './fixtures/full-r1-002-golden.fixture';
import { buildRequest, row, signalsBody } from './position-acquisition-test-helpers';

const FIXED_NOW = new Date('2030-01-01T00:00:00.000Z');

function normalizeRows(rows: readonly Record<string, unknown>[]) {
  const g = FULL_R1_002_GOLDEN;
  const validated = validateDiV0PositionAcquisitionRequest(
    buildRequest(g.fromUtc, g.toUtc, {
      organizationId: g.organizationId,
      vehicleId: g.vehicleId,
      tripId: g.tripId,
      dimoTokenId: g.dimoTokenId,
      dimoDeviceIdentity: FULL_R1_002_DEVICE_IDENTITY,
    }),
  );
  const sourceFamilyResolution = resolveDiV0SourceFamily(FULL_R1_002_DEVICE_IDENTITY);
  const outcome = normalizeDiV0PositionResponse({
    request: validated,
    sourceFamilyResolution,
    responseBody: signalsBody([...rows]),
    acquiredAt: FIXED_NOW,
  });
  if (!outcome.ok) throw new Error('normalize failed');
  return outcome.result;
}

describe('S3A normalized input identity vs provider response (C1G mutability contract)', () => {
  it('different normalized coordinates → different DI_NORMALIZED_INPUT_IDENTITY', () => {
    const a = normalizeRows(FULL_R1_002_PROVIDER_ROWS);
    const mutated = FULL_R1_002_PROVIDER_ROWS.map((r) =>
      r.timestamp === '2026-09-26T19:08:10Z' ? row(r.timestamp, 51.335471, 9.50682) : r,
    );
    const b = normalizeRows(mutated);
    expect(a.snapshotIdentity.digest).not.toBe(b.snapshotIdentity.digest);
  });

  it('unused provider-only fields do not change DI_NORMALIZED_INPUT_IDENTITY', () => {
    const plain = normalizeRows(FULL_R1_002_PROVIDER_ROWS);
    const withHdop = normalizeRows(
      FULL_R1_002_PROVIDER_ROWS.map((r) => ({
        ...r,
        hdop: 8,
        altitude: 200.7,
        extraProviderMetadata: { sealedC0Blend: true },
      })),
    );
    expect(withHdop.snapshotIdentity).toEqual(plain.snapshotIdentity);
  });
});
