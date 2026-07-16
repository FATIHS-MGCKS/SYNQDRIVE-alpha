import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
  ReferenceCapacityVerificationStatus,
} from '../battery-v2-domain';
import {
  evaluateReferenceCapacityCreate,
  evaluateReferenceCapacityVerify,
  isAllowedReferenceCapacitySource,
  resolveInitialVerificationStatus,
} from './vehicle-battery-reference-capacity.policy';
import {
  evaluateModulePermission,
  normalizeMembershipPermissions,
} from '@shared/auth/permission.util';

describe('vehicle-battery-reference-capacity.policy', () => {
  it('keeps KS FH 660E 57 kWh UNVERIFIED on create (no auto-verify)', () => {
    expect(resolveInitialVerificationStatus()).toBe(
      ReferenceCapacityVerificationStatus.UNVERIFIED,
    );

    const result = evaluateReferenceCapacityCreate({
      capacityKwh: 57,
      capacityType: BatteryReferenceCapacityType.USABLE,
      source: BatteryReferenceCapacitySource.VERIFIED_VEHICLE_SPEC,
    });

    expect(result.ok).toBe(true);
    expect(resolveInitialVerificationStatus()).not.toBe(
      ReferenceCapacityVerificationStatus.VERIFIED,
    );
  });

  it('allows only Prompt 56 source whitelist', () => {
    expect(
      isAllowedReferenceCapacitySource(
        BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      ),
    ).toBe(true);
    expect(
      isAllowedReferenceCapacitySource(BatteryReferenceCapacitySource.VEHICLE_MASTER),
    ).toBe(false);
    expect(
      isAllowedReferenceCapacitySource(BatteryReferenceCapacitySource.DIMO_NOMINAL_SIGNAL),
    ).toBe(false);
  });

  it('rejects gross-only capacity type for assessment compatibility', () => {
    const result = evaluateReferenceCapacityCreate({
      capacityKwh: 57,
      capacityType: BatteryReferenceCapacityType.GROSS,
      source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
    });

    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('CAPACITY_TYPE_NOT_ASSESSMENT_COMPATIBLE');
  });

  it('requires evidence before verify for document-backed sources', () => {
    const result = evaluateReferenceCapacityVerify({
      isActive: true,
      verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
      source: BatteryReferenceCapacitySource.WORKSHOP_DOCUMENT,
      documentId: null,
      serviceEventId: null,
    });

    expect(result.ok).toBe(false);
    expect(result.reasonCodes).toContain('MISSING_EVIDENCE_FOR_VERIFY');
  });

  it('allows verify for manual verified without document', () => {
    const result = evaluateReferenceCapacityVerify({
      isActive: true,
      verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
      source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      documentId: null,
      serviceEventId: null,
    });

    expect(result.ok).toBe(true);
  });
});

describe('vehicle-battery-reference-capacity permissions', () => {
  const workerPerms = normalizeMembershipPermissions({
    'fleet-condition': { read: true, write: false, manage: false },
  });
  const adminPerms = normalizeMembershipPermissions({
    'fleet-condition': { read: true, write: true, manage: true },
  });

  it('denies worker write/manage for create and verify', () => {
    expect(evaluateModulePermission(workerPerms, 'fleet-condition', 'read')).toBe(
      true,
    );
    expect(evaluateModulePermission(workerPerms, 'fleet-condition', 'write')).toBe(
      false,
    );
    expect(evaluateModulePermission(workerPerms, 'fleet-condition', 'manage')).toBe(
      false,
    );
  });

  it('allows org admin fleet-condition manage for verify', () => {
    expect(evaluateModulePermission(adminPerms, 'fleet-condition', 'manage')).toBe(
      true,
    );
    expect(evaluateModulePermission(adminPerms, 'fleet-condition', 'write')).toBe(
      true,
    );
  });
});
