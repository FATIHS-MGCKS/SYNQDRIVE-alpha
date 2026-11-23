import { FuelType, VehicleType } from '@prisma/client';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { HighMobilityVehicle } from '@prisma/client';
import {
  BATTERY_REFERENCE_CAPACITY_ALLOWED_SOURCES,
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import { resolveFuelTypeStrict } from '../policy/activation-field-resolution';
import type { VehicleTechnicalBaselineDraftV2 } from '../contracts/vehicle-technical-baseline-draft.v2';

function resolveVehicleType(raw: string | undefined): VehicleType {
  if (!raw?.trim()) {
    return VehicleType.SEDAN;
  }
  const upper = raw.trim().toUpperCase();
  if (Object.values(VehicleType).includes(upper as VehicleType)) {
    return upper as VehicleType;
  }
  return VehicleType.SEDAN;
}

export function normalizeHmOnlyFuelType(fuel?: string): FuelType {
  if (!fuel?.trim()) {
    return FuelType.OTHER;
  }
  try {
    return resolveFuelTypeStrict(fuel.trim()) as FuelType;
  } catch {
    return FuelType.OTHER;
  }
}

export function buildHmOnlyAdminBaselineDraft(
  dto: RegisterHmOnlyVehicleDto,
  hm: Pick<HighMobilityVehicle, 'brand' | 'vin'>,
) {
  const defaultName =
    dto.vehicleName?.trim() ||
    `${hm.brand} ${hm.vin.slice(-6)}`;
  return {
    vehicleName: defaultName,
    licensePlate: dto.licensePlate?.trim() || null,
    stationId: null,
    notes:
      dto.notes?.trim() ||
      'Registered via High Mobility (HM_ONLY canonical onboarding)',
  };
}

function parseOperatorBatteryReference(
  dto: RegisterHmOnlyVehicleDto,
): VehicleTechnicalBaselineDraftV2['hvBatteryReference'] | undefined {
  const capacity = dto.hvBatteryUsableCapacityKwh;
  const sourceRaw = dto.hvBatteryReferenceSource?.trim();
  if (capacity == null || !Number.isFinite(capacity) || capacity <= 0) {
    return undefined;
  }
  if (!sourceRaw) {
    return undefined;
  }
  const allowed = BATTERY_REFERENCE_CAPACITY_ALLOWED_SOURCES as readonly string[];
  if (!allowed.includes(sourceRaw)) {
    return undefined;
  }
  return {
    capacityKwh: capacity,
    capacityType: BatteryReferenceCapacityType.USABLE,
    source: sourceRaw as BatteryReferenceCapacitySource,
  };
}

/**
 * Technical baseline without fabricated OEM/battery guesses.
 * HV battery reference is included only when the registration request carries
 * an explicit capacity plus an allowed reference source (operator-provided evidence).
 */
export function buildHmOnlyTechnicalBaselineDraft(
  dto: RegisterHmOnlyVehicleDto,
): VehicleTechnicalBaselineDraftV2 {
  const draft: VehicleTechnicalBaselineDraftV2 = {
    version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
  };
  const hvBattery = parseOperatorBatteryReference(dto);
  if (hvBattery) {
    draft.hvBatteryReference = hvBattery;
  }
  return draft;
}

export function resolveHmOnlyVehicleType(dto: RegisterHmOnlyVehicleDto): VehicleType {
  return resolveVehicleType(dto.vehicleType);
}

/** Test / readiness aid: EV/PHEV fuel classes that require HV battery evidence when product mandates it. */
export function hmOnlyFuelRequiresHvBatteryEvidence(fuel?: string): boolean {
  const fuelType = normalizeHmOnlyFuelType(fuel);
  return fuelType === FuelType.ELECTRIC || fuelType === FuelType.PLUGIN_HYBRID;
}