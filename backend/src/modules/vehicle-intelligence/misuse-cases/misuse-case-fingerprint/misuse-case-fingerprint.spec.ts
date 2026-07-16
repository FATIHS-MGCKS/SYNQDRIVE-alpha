import {
  MisuseAttributionScope,
  MisuseCaseCategory,
  MisuseCaseType,
  MisuseEvidenceSourceType,
} from '@prisma/client';
import {
  buildMisuseCaseFingerprintPair,
  buildMisuseCaseLogicalFingerprint,
  buildMisuseCaseScope,
  buildQualifiedEvidenceKeys,
  fingerprintsMatch,
  requiresMisuseCaseSupersede,
} from './misuse-case-fingerprint';
import { MISUSE_CASE_FINGERPRINT_VERSION } from './misuse-case-fingerprint.config';

describe('misuse-case-fingerprint', () => {
  const baseInput = {
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    scope: { kind: 'TRIP' as const, tripId: 'trip-1' },
    category: MisuseCaseCategory.MISUSE_SUSPICION,
    caseType: MisuseCaseType.COLD_ENGINE_ABUSE,
    attributionScope: MisuseAttributionScope.BOOKING_CUSTOMER,
    evidence: [
      {
        sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
        sourceId: 'ev-1',
        eventType: 'COLD_ENGINE_HIGH_RPM',
        occurredAt: new Date('2026-07-16T10:00:00Z'),
      },
    ],
  };

  it('produces identical fingerprints for identical input', () => {
    const a = buildMisuseCaseFingerprintPair({
      ...baseInput,
      modelVersion: MISUSE_CASE_FINGERPRINT_VERSION,
    });
    const b = buildMisuseCaseFingerprintPair({
      ...baseInput,
      modelVersion: MISUSE_CASE_FINGERPRINT_VERSION,
    });

    expect(a.logicalFingerprint).toBe(b.logicalFingerprint);
    expect(a.caseFingerprint).toBe(b.caseFingerprint);
    expect(a.logicalFingerprint).toHaveLength(64);
    expect(a.caseFingerprint).toHaveLength(64);
  });

  it('does not embed free text titles or descriptions', () => {
    const pair = buildMisuseCaseFingerprintPair({
      ...baseInput,
      modelVersion: MISUSE_CASE_FINGERPRINT_VERSION,
    });
    expect(pair.caseFingerprint).not.toContain('Aggressiv');
    expect(pair.logicalFingerprint).not.toContain('Test');
  });

  it('changes logical fingerprint when qualified evidence IDs change', () => {
    const a = buildMisuseCaseLogicalFingerprint(baseInput);
    const b = buildMisuseCaseLogicalFingerprint({
      ...baseInput,
      evidence: [
        {
          ...baseInput.evidence[0],
          sourceId: 'ev-2',
          occurredAt: new Date('2026-07-16T14:00:00Z'),
        },
      ],
    });
    expect(a).not.toBe(b);
  });

  it('separates temporally distant patterns without source IDs via buckets', () => {
    const a = buildMisuseCaseLogicalFingerprint({
      ...baseInput,
      evidence: [
        {
          sourceType: MisuseEvidenceSourceType.DERIVED_PATTERN,
          eventType: 'PATTERN_A',
          occurredAt: new Date('2026-07-16T10:00:00Z'),
        },
      ],
    });
    const b = buildMisuseCaseLogicalFingerprint({
      ...baseInput,
      evidence: [
        {
          sourceType: MisuseEvidenceSourceType.DERIVED_PATTERN,
          eventType: 'PATTERN_A',
          occurredAt: new Date('2026-07-16T12:00:00Z'),
        },
      ],
    });
    expect(a).not.toBe(b);
  });

  it('changes case fingerprint on model version bump while logical stays stable', () => {
    const v1 = buildMisuseCaseFingerprintPair({
      ...baseInput,
      modelVersion: 'misuse-fingerprint-v1',
    });
    const v2 = buildMisuseCaseFingerprintPair({
      ...baseInput,
      modelVersion: 'misuse-fingerprint-v2',
    });

    expect(v1.logicalFingerprint).toBe(v2.logicalFingerprint);
    expect(v1.caseFingerprint).not.toBe(v2.caseFingerprint);
    expect(
      requiresMisuseCaseSupersede(
        { modelVersion: v1.modelVersion, inputFingerprint: v1.logicalFingerprint },
        v2,
      ),
    ).toBe(true);
  });

  it('scopes rental separately from trip when preferRentalScope is set', () => {
    const tripScope = buildMisuseCaseScope({
      tripId: 'trip-1',
      bookingId: 'book-1',
      preferRentalScope: false,
    });
    const rentalScope = buildMisuseCaseScope({
      tripId: 'trip-1',
      bookingId: 'book-1',
      preferRentalScope: true,
    });

    const tripFp = buildMisuseCaseLogicalFingerprint({ ...baseInput, scope: tripScope });
    const rentalFp = buildMisuseCaseLogicalFingerprint({ ...baseInput, scope: rentalScope });
    expect(tripFp).not.toBe(rentalFp);
  });

  it('includes attribution scope in fingerprint', () => {
    const customer = buildMisuseCaseLogicalFingerprint(baseInput);
    const privateTrip = buildMisuseCaseLogicalFingerprint({
      ...baseInput,
      attributionScope: MisuseAttributionScope.PRIVATE_UNASSIGNED,
    });
    expect(customer).not.toBe(privateTrip);
  });

  it('sorts qualified evidence keys deterministically', () => {
    const keys = buildQualifiedEvidenceKeys([
      {
        sourceType: MisuseEvidenceSourceType.DRIVING_EVENT,
        sourceId: 'b',
        eventType: 'HARSH_BRAKING',
        occurredAt: new Date('2026-07-16T10:00:00Z'),
      },
      {
        sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
        sourceId: 'a',
        eventType: 'KICKDOWN',
        occurredAt: new Date('2026-07-16T10:05:00Z'),
      },
    ]);
    expect(keys).toEqual(['DRIVING_EVENT:b', 'TRIP_BEHAVIOR_EVENT:a']);
  });

  it('detects exact fingerprint match for idempotent upsert', () => {
    const pair = buildMisuseCaseFingerprintPair({
      ...baseInput,
      modelVersion: MISUSE_CASE_FINGERPRINT_VERSION,
    });
    expect(
      fingerprintsMatch(
        {
          fingerprint: pair.caseFingerprint,
          inputFingerprint: pair.logicalFingerprint,
          modelVersion: pair.modelVersion,
        },
        pair,
      ),
    ).toBe(true);
  });
});

describe('misuse-case-fingerprint tenant safety', () => {
  it('differs across organizations with otherwise identical input', () => {
    const input = {
      vehicleId: 'veh-1',
      scope: { kind: 'TRIP' as const, tripId: 'trip-1' },
      category: MisuseCaseCategory.USAGE_ANOMALY,
      caseType: MisuseCaseType.AGGRESSIVE_DRIVING_PATTERN,
      attributionScope: MisuseAttributionScope.VEHICLE_ONLY,
      evidence: [
        {
          sourceType: MisuseEvidenceSourceType.TRIP_BEHAVIOR_EVENT,
          sourceId: 'ev-1',
          eventType: 'KICKDOWN',
          occurredAt: new Date('2026-07-16T10:00:00Z'),
        },
      ],
    };

    const orgA = buildMisuseCaseLogicalFingerprint({ organizationId: 'org-a', ...input });
    const orgB = buildMisuseCaseLogicalFingerprint({ organizationId: 'org-b', ...input });
    expect(orgA).not.toBe(orgB);
  });
});
