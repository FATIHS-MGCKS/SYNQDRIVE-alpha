import { FuelType, VehicleType } from '@prisma/client';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { HighMobilityVehicle } from '@prisma/client';
import {
  VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
  VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
} from '../contracts/vo-document-versions';
import { resolveFuelTypeStrict } from '../policy/activation-field-resolution';
import type { VehicleTechnicalBaselineDraftV2 } from '../contracts/vehicle-technical-baseline-draft.v2';
import type { VehicleOnboardingHvBatteryReferenceDraft } from '../contracts/vehicle-technical-baseline-draft.v2';

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

export function normalizeHmOnlyFuelType(fuel?: string): FuelType | null {
  if (!fuel?.trim()) {
    return null;
  }
  try {
    return resolveFuelTypeStrict(fuel.trim()) as FuelType;
  } catch {
    return null;
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
    version: VEHICLE_ADMIN_BASELINE_DRAFT_VERSION,
    vehicleName: defaultName,
    licensePlate: dto.licensePlate?.trim() || null,
    stationId: null,
    notes:
      dto.notes?.trim() ||
      'Registered via High Mobility (HM_ONLY canonical onboarding)',
  };
}

export function buildHmOnlyTechnicalBaselineDraft(
  hvBattery?: VehicleOnboardingHvBatteryReferenceDraft | null,
): VehicleTechnicalBaselineDraftV2 {
  const draft: VehicleTechnicalBaselineDraftV2 = {
    version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
  };
  if (hvBattery) {
    draft.hvBatteryReference = hvBattery;
  }
  return draft;
}

export function resolveHmOnlyVehicleType(dto: RegisterHmOnlyVehicleDto): VehicleType {
  return resolveVehicleType(dto.vehicleType);
}