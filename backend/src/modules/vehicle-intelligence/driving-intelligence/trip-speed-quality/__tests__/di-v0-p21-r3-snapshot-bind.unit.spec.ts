import { verifyAndParseDiV0PinnedEvidenceSnapshot } from '../../s4d-replay/di-v0-s4d-verified-snapshot';

const baseScope = {
  organizationId: 'org-a',
  vehicleId: 'veh-a',
  tripId: 'trip-a',
  boundaryFingerprint: 'bf-a',
  snapshotHash: 'hash-a',
  sourceFamily: 'UNKNOWN' as const,
};

function stubRow(overrides: Partial<{
  organization_id: string;
  vehicle_id: string;
  trip_id: string;
  boundary_fingerprint: string;
}> = {}) {
  return {
    organization_id: 'org-a',
    vehicle_id: 'veh-a',
    trip_id: 'trip-a',
    boundary_fingerprint: 'bf-a',
    acquisition_window_start: new Date('2026-01-01T00:00:00Z'),
    acquisition_window_end: new Date('2026-01-01T00:01:00Z'),
    channel_manifest: {},
    payload_gzip: Buffer.from(''),
    uncompressed_bytes: 0,
    ...overrides,
  };
}

describe('P21 R3B snapshot scope binding (S4D verifier)', () => {
  it('rejects snapshot row when vehicle id does not match work-item scope', () => {
    const result = verifyAndParseDiV0PinnedEvidenceSnapshot(
      stubRow({ vehicle_id: 'veh-other' }),
      baseScope,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SNAPSHOT_SCOPE_INVALID');
  });

  it('rejects boundary fingerprint mismatch', () => {
    const result = verifyAndParseDiV0PinnedEvidenceSnapshot(
      stubRow({ boundary_fingerprint: 'bf-other' }),
      baseScope,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SNAPSHOT_SCOPE_INVALID');
  });

  it('rejects tenant org mismatch', () => {
    const result = verifyAndParseDiV0PinnedEvidenceSnapshot(
      stubRow({ organization_id: 'org-other' }),
      baseScope,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SNAPSHOT_SCOPE_INVALID');
  });

  it('rejects trip mismatch', () => {
    const result = verifyAndParseDiV0PinnedEvidenceSnapshot(
      stubRow({ trip_id: 'trip-other' }),
      baseScope,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SNAPSHOT_SCOPE_INVALID');
  });
});
