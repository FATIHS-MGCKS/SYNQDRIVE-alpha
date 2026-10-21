import {
  canonicalizeCutoverEvidencePayload,
  hashCanonicalCutoverEvidencePayload,
} from './physical-state-cutover-evidence.canonical';
import { validateCutoverEvidenceTimestamp } from './physical-state-cutover-evidence.timestamps';
import { buildDefaultCutoverEvidencePayload } from './physical-state-cutover-evidence.signer';

const scope = {
  organizationId: 'org-canonical',
  vehicleId: 'veh-canonical',
  provider: 'DIMO',
};

describe('physical-state-cutover-evidence.canonical', () => {
  it('produces identical canonical bytes for semantically equal payloads with reordered keys', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    const payloadA = buildDefaultCutoverEvidencePayload(scope, {
      bundleId: 'bundle-canonical',
      issuer: 'ops',
      issuedAt: now,
      expiresAt: new Date(now.getTime() + 3600_000),
      capableBuildId: 'build-a',
    });
    const payloadB = JSON.parse(JSON.stringify(payloadA)) as Record<string, unknown>;
    payloadB.scope = {
      provider: scope.provider,
      vehicleId: scope.vehicleId,
      organizationId: scope.organizationId,
    };

    const canonicalA = canonicalizeCutoverEvidencePayload(payloadA);
    const canonicalB = canonicalizeCutoverEvidencePayload(payloadB);
    expect(canonicalA).toBe(canonicalB);
    expect(hashCanonicalCutoverEvidencePayload(payloadA)).toBe(
      hashCanonicalCutoverEvidencePayload(payloadB),
    );
  });

  it('rejects non-finite numbers', () => {
    expect(() => canonicalizeCutoverEvidencePayload({ count: NaN })).toThrow('non_finite_number');
    expect(() => canonicalizeCutoverEvidencePayload({ count: Infinity })).toThrow(
      'non_finite_number',
    );
  });
});

describe('physical-state-cutover-evidence.timestamps', () => {
  it('rejects non-canonical timezone offset timestamps at verification', () => {
    const result = validateCutoverEvidenceTimestamp('2026-09-15T12:00:00+00:00', Date.now());
    expect(result.ok).toBe(false);
  });
});

