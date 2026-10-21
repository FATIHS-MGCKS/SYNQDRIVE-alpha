import {
  buildAdminBaselineDraftFromMasterInput,
  buildPostActivationVehiclePatch,
  buildTechnicalBaselineDraftFromMasterManualSpecs,
  mapMasterFormDrivetrainToDriveType,
  resolveHvBatteryCapacityFromMasterExtra,
} from '../master-dimo-registration.mapper';
import { DriveType } from '@prisma/client';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { ReferenceCapacityVerificationStatus } from '@prisma/client';
import { resolveInitialVerificationStatus } from '@modules/vehicle-intelligence/battery-health/reference-capacity/vehicle-battery-reference-capacity.policy';

describe('master-dimo-registration.mapper', () => {
  it('maps admin baseline from Master extraData and stationId', () => {
    const draft = buildAdminBaselineDraftFromMasterInput({
      organizationId: 'org-1',
      stationId: 'station-1',
      dimoVehicleId: 'dimo-1',
      extraData: {
        vehicleName: 'Fleet 1',
        licensePlate: 'B-XY 1',
        notes: 'note',
      },
      actorUserId: null,
    });
    expect(draft.vehicleName).toBe('Fleet 1');
    expect(draft.licensePlate).toBe('B-XY 1');
    expect(draft.stationId).toBe('station-1');
    expect(draft.notes).toBe('note');
  });

  it('maps brake manual specs into technical baseline v2', () => {
    const draft = buildTechnicalBaselineDraftFromMasterManualSpecs({
      organizationId: 'org-1',
      stationId: null,
      dimoVehicleId: 'dimo-1',
      manualSpecs: {
        brakes: { frontPadThickness: 10, rearPadThickness: 9 },
      },
      actorUserId: null,
    });
    expect(draft.brakeReference?.frontPadNominalThicknessMm).toBe(10);
    expect(draft.brakeReference?.rearPadNominalThicknessMm).toBe(9);
  });

  describe('resolveHvBatteryCapacityFromMasterExtra', () => {
    it('returns USABLE reference for usable kWh', () => {
      const resolved = resolveHvBatteryCapacityFromMasterExtra({
        hvBatteryUsableCapacityKwh: 55.2,
      });
      expect(resolved.kind).toBe('usable_reference');
      if (resolved.kind !== 'usable_reference') return;
      expect(resolved.reference.capacityKwh).toBe(55.2);
      expect(resolved.reference.capacityType).toBe(BatteryReferenceCapacityType.USABLE);
      expect(resolved.reference.source).toBe(BatteryReferenceCapacitySource.MANUAL_VERIFIED);
      expect(resolveInitialVerificationStatus()).toBe(ReferenceCapacityVerificationStatus.UNVERIFIED);
    });

    it('accepts legacy hvBatteryCapacityKwh as usable alias', () => {
      const resolved = resolveHvBatteryCapacityFromMasterExtra({
        hvBatteryCapacityKwh: 57,
      });
      expect(resolved.kind).toBe('usable_reference');
      if (resolved.kind !== 'usable_reference') return;
      expect(resolved.reference.capacityKwh).toBe(57);
    });

    it('returns none for gross-only (no SOH-compatible reference)', () => {
      expect(
        resolveHvBatteryCapacityFromMasterExtra({ hvBatteryGrossCapacityKwh: 60 }).kind,
      ).toBe('none');
    });

    it('returns none when no capacity fields', () => {
      expect(resolveHvBatteryCapacityFromMasterExtra({}).kind).toBe('none');
    });

    it('rejects usable greater than gross', () => {
      const resolved = resolveHvBatteryCapacityFromMasterExtra({
        hvBatteryUsableCapacityKwh: 58,
        hvBatteryGrossCapacityKwh: 57,
      });
      expect(resolved.kind).toBe('invalid');
    });

    it('allows usable and gross together when consistent', () => {
      const resolved = resolveHvBatteryCapacityFromMasterExtra({
        hvBatteryUsableCapacityKwh: 55,
        hvBatteryGrossCapacityKwh: 57,
      });
      expect(resolved.kind).toBe('usable_reference');
      if (resolved.kind !== 'usable_reference') return;
      expect(resolved.reference.capacityType).toBe(BatteryReferenceCapacityType.USABLE);
    });

    it('prefers explicit usable over legacy alias', () => {
      const resolved = resolveHvBatteryCapacityFromMasterExtra({
        hvBatteryUsableCapacityKwh: 55.2,
        hvBatteryCapacityKwh: 57,
      });
      expect(resolved.kind).toBe('usable_reference');
      if (resolved.kind !== 'usable_reference') return;
      expect(resolved.reference.capacityKwh).toBe(55.2);
    });
  });

  it('maps drivetrain form values to DriveType on post-activation patch', () => {
    const patch = buildPostActivationVehiclePatch({
      organizationId: 'org-1',
      stationId: null,
      dimoVehicleId: 'dimo-1',
      extraData: { drivetrain: '4WD' },
      actorUserId: null,
    });
    expect(patch.driveType).toBe(DriveType.FOUR_WD);
    expect(mapMasterFormDrivetrainToDriveType('AWD')).toBe(DriveType.AWD);
  });
});
