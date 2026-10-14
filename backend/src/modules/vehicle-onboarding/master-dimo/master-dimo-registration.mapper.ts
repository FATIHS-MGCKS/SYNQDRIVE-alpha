import { DriveType, type Prisma } from '@prisma/client';
import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from '../contracts/vo-document-versions';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import type { VehicleAdministrativeBaselineDraftV1 } from '../contracts/vehicle-admin-baseline-draft.v1';
import type { VehicleTechnicalBaselineDraftV2 } from '../contracts/vehicle-technical-baseline-draft.v2';
import type { MasterDimoRegistrationInput } from './master-dimo-registration.types';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';

function readStringField(extra: MasterDimoRegistrationInput['extraData'], key: string): string | null {
  if (!extra || typeof extra !== 'object') return null;
  const raw = (extra as Record<string, unknown>)[key];
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

export function buildAdminBaselineDraftFromMasterInput(
  input: MasterDimoRegistrationInput,
): VehicleAdministrativeBaselineDraftV1 {
  const extra = input.extraData;
  return {
    version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
    vehicleName: readStringField(extra, 'vehicleName'),
    licensePlate: readStringField(extra, 'licensePlate'),
    stationId: input.stationId?.trim() || null,
    notes: readStringField(extra, 'notes'),
  };
}

export function buildTechnicalBaselineDraftFromMasterManualSpecs(
  input: MasterDimoRegistrationInput,
): VehicleTechnicalBaselineDraftV2 {
  const draft: VehicleTechnicalBaselineDraftV2 = {
    version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
  };
  const brakes = input.manualSpecs?.brakes;
  if (brakes) {
    const frontPad =
      brakes.frontPadNominalThicknessMm ?? brakes.frontPadThickness ?? null;
    const rearPad = brakes.rearPadNominalThicknessMm ?? brakes.rearPadThickness ?? null;
    const hasBrake =
      frontPad != null ||
      rearPad != null ||
      brakes.frontRotorDiameter != null ||
      brakes.rearRotorDiameter != null;
    if (hasBrake) {
      draft.brakeReference = {
        frontPadNominalThicknessMm: frontPad ?? undefined,
        rearPadNominalThicknessMm: rearPad ?? undefined,
        frontRotorDiameter: brakes.frontRotorDiameter ?? undefined,
        rearRotorDiameter: brakes.rearRotorDiameter ?? undefined,
        frontRotorWidth: brakes.frontRotorWidth ?? undefined,
        rearRotorWidth: brakes.rearRotorWidth ?? undefined,
        sourceType: brakes.source ?? 'manual_registration',
      };
    }
  }

  const tires = input.manualSpecs?.tires;
  if (tires) {
    const hasTire =
      Boolean(tires.frontDimension?.trim()) ||
      Boolean(tires.rearDimension?.trim()) ||
      Boolean(tires.brandModelFront?.trim()) ||
      Boolean(tires.brandModelRear?.trim()) ||
      tires.treadFL != null ||
      tires.treadFR != null ||
      tires.treadBL != null ||
      tires.treadBR != null;
    if (hasTire) {
      draft.tireInstalledConfig = {
        evidenceInstalled: true,
        brandModelFront: tires.brandModelFront ?? null,
        brandModelRear: tires.brandModelRear ?? null,
        tireSeason: tires.tireSeason ?? null,
        frontDimension: tires.frontDimension ?? null,
        rearDimension: tires.rearDimension ?? null,
      };
      draft.tireReferenceSpec = {
        frontDimension: tires.frontDimension ?? null,
        rearDimension: tires.rearDimension ?? null,
        loadIndexFront: tires.loadIndexFront ?? null,
        speedIndexFront: tires.speedIndexFront ?? null,
        loadIndexRear: tires.loadIndexRear ?? null,
        speedIndexRear: tires.speedIndexRear ?? null,
        referenceProvenance: 'manual_registration',
      };
    }
  }

  return draft;
}

/** Vehicle scalar fields not carried by canonical activation SQL insert. */
export function buildPostActivationVehiclePatch(
  input: MasterDimoRegistrationInput,
): Prisma.VehicleUpdateInput {
  const extra = input.extraData ?? {};
  const patch: Prisma.VehicleUpdateInput = {};

  const mileageKm = (extra as { mileageKm?: number }).mileageKm;
  if (mileageKm != null && Number.isFinite(mileageKm)) {
    patch.mileageKm = mileageKm;
  }

  const hardwareType = (extra as { hardwareType?: string }).hardwareType;
  if (hardwareType != null && String(hardwareType).trim() !== '') {
    patch.hardwareType = String(hardwareType).trim() as never;
  }

  const vehicleType = (extra as { vehicleType?: string }).vehicleType;
  if (vehicleType != null && String(vehicleType).trim() !== '') {
    patch.vehicleType = vehicleType as Prisma.VehicleUpdateInput['vehicleType'];
  }

  const drivetrainRaw = (extra as { drivetrain?: unknown }).drivetrain;
  const driveType = mapMasterFormDrivetrainToDriveType(drivetrainRaw);
  if (driveType) {
    patch.driveType = driveType;
  }

  const scalarKeys = [
    'curbWeightKg',
    'idleRpm',
    'maxRpm',
    'brakeForceFrontPercent',
    'tankCapacityLiters',
    'serviceIntervalManufacturerKm',
    'serviceIntervalManufacturerMonths',
    'oilChangeIntervalKm',
    'oilChangeIntervalMonths',
  ] as const;

  for (const key of scalarKeys) {
    const value = (extra as Record<string, unknown>)[key];
    if (value !== undefined && value !== null && value !== '') {
      (patch as Record<string, unknown>)[key] = value;
    }
  }

  const frontToRear = (extra as { frontToRearWeightDistribution?: unknown })
    .frontToRearWeightDistribution;
  if (frontToRear !== undefined && frontToRear !== null && frontToRear !== '') {
    const parsed = typeof frontToRear === 'number' ? frontToRear : Number(String(frontToRear));
    if (Number.isFinite(parsed)) {
      patch.frontWeightDistributionPct = parsed;
    }
  }

  return patch;
}

/** Maps Master form `drivetrain` strings to Prisma `DriveType` (vehicles.drive_type). */
export function mapMasterFormDrivetrainToDriveType(raw: unknown): DriveType | null {
  if (raw == null || String(raw).trim() === '') return null;
  const normalized = String(raw).trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
  if (normalized === '4WD' || normalized === '4X4' || normalized === 'FOUR_WD') {
    return DriveType.FOUR_WD;
  }
  if (normalized === 'FWD') return DriveType.FWD;
  if (normalized === 'RWD') return DriveType.RWD;
  if (normalized === 'AWD') return DriveType.AWD;
  return null;
}

export function masterManualSpecsNeedLegacyTireTreadPass(input: MasterDimoRegistrationInput): boolean {
  const tr = input.manualSpecs?.tires;
  if (!tr) return false;
  return (
    tr.treadFL != null ||
    tr.treadFR != null ||
    tr.treadBL != null ||
    tr.treadBR != null ||
    tr.initialTreadFrontMm != null ||
    tr.initialTreadRearMm != null ||
    tr.tireCondition != null ||
    tr.aiTireSpec != null
  );
}

export function hasLowVoltageBatteryManualSpec(input: MasterDimoRegistrationInput): boolean {
  const b = input.manualSpecs?.battery;
  if (!b) return false;
  return (
    (b.batteryType != null && String(b.batteryType).trim() !== '') ||
    b.batteryAmpere != null ||
    b.batteryVolt != null
  );
}

/** Optional HV capacity when operator supplied kWh in extra (rare on Master form). */
export function tryHvBatteryFromExtra(
  extra: MasterDimoRegistrationInput['extraData'],
): VehicleTechnicalBaselineDraftV2['hvBatteryReference'] | null {
  const capacityKwh = (extra as { hvBatteryCapacityKwh?: number })?.hvBatteryCapacityKwh;
  if (capacityKwh == null || !Number.isFinite(capacityKwh)) return null;
  return {
    capacityKwh,
    capacityType: BatteryReferenceCapacityType.USABLE,
    source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
  };
}
