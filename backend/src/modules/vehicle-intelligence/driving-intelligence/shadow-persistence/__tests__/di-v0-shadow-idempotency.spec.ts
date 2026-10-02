import { buildDiV0ShadowRunIdempotencyKey } from '../di-v0-shadow-idempotency';
import { DEFAULT_DI_V0_VERSION_TUPLE } from '../../core/versions';

describe('DiV0Shadow idempotency', () => {
  const identity = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    sourceFamily: 'RUPTELA_R1',
    versions: DEFAULT_DI_V0_VERSION_TUPLE,
    inputEvidenceVersion: 'snap-sha-abc',
  };

  it('is deterministic', () => {
    const a = buildDiV0ShadowRunIdempotencyKey(identity);
    const b = buildDiV0ShadowRunIdempotencyKey(identity);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it('changes when input evidence version changes', () => {
    const base = buildDiV0ShadowRunIdempotencyKey(identity);
    const other = buildDiV0ShadowRunIdempotencyKey({
      ...identity,
      inputEvidenceVersion: 'snap-sha-other',
    });
    expect(base).not.toBe(other);
  });
});
