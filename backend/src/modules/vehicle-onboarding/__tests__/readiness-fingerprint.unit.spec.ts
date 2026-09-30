import { OrgProductStatus, ProductSlug } from '@prisma/client';
import { computeReadinessInputFingerprint } from '../readiness/readiness-input-fingerprint.v1';
import { RENTAL_ONBOARDING_PROFILE_V1 } from '../readiness/profiles/rental-onboarding.profile';
import { ONBOARDING_SOURCE_SNAPSHOT_VERSION } from '../contracts/vo-document-versions';

describe('readiness input fingerprint', () => {
  const baseCase = {
    organizationId: 'org-1',
    sourceMode: 'DIMO',
    draftIdentityVersion: 1,
    draftIdentityJson: { version: 1, make: 'A', model: 'B', year: 2020, fuelType: 'GASOLINE' },
    draftAdminBaselineVersion: 1,
    draftAdminBaselineJson: { version: 1, licensePlate: 'X' },
    draftTechnicalBaselineVersion: 1,
    draftTechnicalBaselineJson: { version: 1, referenceInputs: {} },
    validationFindingsVersion: 1,
    validationFindingsJson: { version: 1, findings: [] },
  };

  const fingerprintBase = {
    caseRow: baseCase as any,
    sourceRefs: [],
    profile: RENTAL_ONBOARDING_PROFILE_V1,
    jurisdictionCode: 'JURISDICTION_UNKNOWN',
    selectedProductSlug: ProductSlug.RENTAL,
    productEntitlementStatus: OrgProductStatus.ACTIVE,
    organizationBusinessType: 'RENTAL',
  };

  it('is stable for equivalent input', () => {
    const a = computeReadinessInputFingerprint(fingerprintBase);
    const b = computeReadinessInputFingerprint(fingerprintBase);
    expect(a).toBe(b);
  });

  it('changes when admin plate changes', () => {
    const a = computeReadinessInputFingerprint(fingerprintBase);
    const b = computeReadinessInputFingerprint({
      ...fingerprintBase,
      caseRow: {
        ...baseCase,
        draftAdminBaselineJson: { version: 1, licensePlate: 'Y' },
      } as any,
    });
    expect(a).not.toBe(b);
  });

  it('changes when HM clearance in source snapshot changes', () => {
    const snapApproved = {
      version: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
      providerType: 'HIGH_MOBILITY',
      connectionScope: { kind: 'ORG_TENANT', organizationId: 'org-1' },
      externalVehicleIdentity: 'hm-1',
      sourceMirrorTable: 'high_mobility_vehicles',
      sourceMirrorId: 'hm-1',
      vin: 'VIN123',
      vinProvenance: 'PROVIDER',
      vinVerificationState: 'UNVERIFIED',
      make: 'BMW',
      model: 'i3',
      year: 2020,
      fuelTypeHint: 'ELECTRIC',
      capabilityHints: [],
      observedAt: '2020-01-01T00:00:00.000Z',
      sourceEvidence: { clearanceStatus: 'APPROVED' },
      bindingMetadata: {},
    };
    const snapPending = {
      ...snapApproved,
      sourceEvidence: { clearanceStatus: 'CLEARANCE_PENDING' },
    };
    const refBase = {
      provider: 'HIGH_MOBILITY',
      connectionScopeKey: 'org:org-1',
      externalVehicleIdentity: 'hm-1',
      isPrimary: true,
      snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
    };
    const a = computeReadinessInputFingerprint({
      ...fingerprintBase,
      sourceRefs: [{ ...refBase, snapshotMetadataJson: snapApproved } as any],
    });
    const b = computeReadinessInputFingerprint({
      ...fingerprintBase,
      sourceRefs: [{ ...refBase, snapshotMetadataJson: snapPending } as any],
    });
    expect(a).not.toBe(b);
  });

  it('ignores observedAt-only source snapshot change', () => {
    const snap1 = {
      version: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
      providerType: 'DIMO',
      connectionScope: { kind: 'PLATFORM' },
      externalVehicleIdentity: 'ext-1',
      sourceMirrorTable: 'dimo_vehicles',
      sourceMirrorId: 'd1',
      vin: null,
      vinProvenance: null,
      vinVerificationState: null,
      make: 'Audi',
      model: 'A3',
      year: 2021,
      fuelTypeHint: 'GASOLINE',
      capabilityHints: [],
      observedAt: '2020-01-01T00:00:00.000Z',
      sourceEvidence: {},
      bindingMetadata: {},
    };
    const snap2 = { ...snap1, observedAt: '2025-01-01T00:00:00.000Z' };
    const refBase = {
      provider: 'DIMO',
      connectionScopeKey: 'platform',
      externalVehicleIdentity: 'ext-1',
      isPrimary: true,
      snapshotMetadataVersion: ONBOARDING_SOURCE_SNAPSHOT_VERSION,
    };
    const a = computeReadinessInputFingerprint({
      ...fingerprintBase,
      sourceRefs: [{ ...refBase, snapshotMetadataJson: snap1 } as any],
    });
    const b = computeReadinessInputFingerprint({
      ...fingerprintBase,
      sourceRefs: [{ ...refBase, snapshotMetadataJson: snap2 } as any],
    });
    expect(a).toBe(b);
  });
});
