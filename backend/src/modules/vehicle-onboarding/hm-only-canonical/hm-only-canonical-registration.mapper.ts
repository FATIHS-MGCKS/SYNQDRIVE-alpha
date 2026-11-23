import { FuelType, VehicleType } from '@prisma/client';
import type { RegisterHmOnlyVehicleDto } from '@modules/high-mobility/dto/high-mobility.dto';
import type { HighMobilityVehicle } from '@prisma/client';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 } from '../contracts/vo-document-versions';
import { resolveFuelTypeStrict } from '../policy/activation-field-resolution';

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

export function buildHmOnlyTechnicalBaselineDraft(dto: RegisterHmOnlyVehicleDto) {
  const fuel = normalizeHmOnlyFuelType(dto.fuelType);
  if (fuel === FuelType.ELECTRIC || fuel === FuelType.PLUGIN_HYBRID) {
    return {
      version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2,
      hvBatteryReference: {
        capacityKwh: 77,
        capacityType: BatteryReferenceCapacityType.USABLE,
        source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      },
    };
  }
  return { version: VEHICLE_TECHNICAL_BASELINE_DRAFT_VERSION_V2 };
}

export function resolveHmOnlyVehicleType(dto: RegisterHmOnlyVehicleDto): VehicleType {
  return resolveVehicleType(dto.vehicleType);
}