import { api } from '../../lib/api';
import type { DimoVehicle, RegisteredVehicle } from '../data/platform-data';

function parseOptionalNumber(value: string | number | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function parseOptionalFloat(value: string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function mapApiDimoToDimoVehicle(raw: Record<string, unknown>): DimoVehicle {
  const connectionStatus =
    raw.connectionStatus === 'Connected' || raw.connection_status === 'Connected'
      ? 'Connected'
      : 'Disconnected';
  return {
    id: String(raw.id ?? raw.dimoVehicleId ?? ''),
    tokenId:
      raw.tokenId != null
        ? Number(raw.tokenId)
        : raw.token_id != null
          ? Number(raw.token_id)
          : null,
    vin: String(raw.vin ?? ''),
    make: String(raw.make ?? raw.brand ?? 'Unknown'),
    model: String(raw.model ?? 'Unknown'),
    year: Number(raw.year ?? new Date().getFullYear()),
    odometer: Number(raw.odometer ?? raw.mileageKm ?? raw.mileage_km ?? 0),
    battery: raw.battery != null ? Number(raw.battery) : raw.batteryLevel != null ? Number(raw.batteryLevel) : null,
    fuelLevel: raw.fuelLevel != null ? Number(raw.fuelLevel) : raw.fuel_level != null ? Number(raw.fuel_level) : null,
    powertrainType: (raw.powertrainType ?? raw.powertrain_type ?? null) as string | null,
    lastSignal: String(raw.lastSignal ?? raw.last_signal ?? ''),
    connectionStatus,
  };
}

export function buildVehicleExtraData(rv: RegisteredVehicle): Record<string, unknown> {
  return {
    vehicleName: rv.vehicleName || `${rv.make} ${rv.model}`.trim(),
    licensePlate: rv.licensePlate || undefined,
    mileageKm: parseOptionalNumber(rv.mileage) ?? 0,
    fuelType: rv.fuelType,
    vehicleType: rv.vehicleType,
    hardwareType: rv.hardwareType ?? 'UNKNOWN',
    notes: rv.notes || undefined,
    drivetrain: rv.drivetrain || undefined,
    curbWeightKg: parseOptionalNumber(rv.curbWeight),
    idleRpm: parseOptionalNumber(rv.idleRpm),
    maxRpm: parseOptionalNumber(rv.maxRpm),
    brakeForceFrontPercent: parseOptionalFloat(rv.brakeForceDistribution),
    frontToRearWeightDistribution: rv.frontToRearWeightDistribution || undefined,
    tankCapacityLiters: parseOptionalFloat(rv.tankCapacityLiters),
    engineDisplacementCc: parseOptionalNumber(rv.engineDisplacementCc),
    cylinderCount: parseOptionalNumber(rv.cylinderCount),
    serviceIntervalManufacturerKm: parseOptionalNumber(rv.serviceIntervalManufacturerKm),
    serviceIntervalManufacturerMonths: parseOptionalNumber(rv.serviceIntervalManufacturerMonths),
    oilChangeIntervalKm: parseOptionalNumber(rv.oilChangeIntervalKm),
    oilChangeIntervalMonths: parseOptionalNumber(rv.oilChangeIntervalMonths),
  };
}

export function buildVehicleManualSpecs(rv: RegisteredVehicle) {
  const frontPad = parseOptionalFloat(rv.brakeFrontPadThickness);
  const rearPad = parseOptionalFloat(rv.brakeBackPadThickness);
  const hasBrakeInput =
    frontPad != null ||
    rearPad != null ||
    parseOptionalFloat(rv.brakeFrontRotorDiameter) != null ||
    parseOptionalFloat(rv.brakeBackRotorDiameter) != null;

  const hasTireInput =
    Boolean(rv.tireFrontDimension?.trim()) ||
    Boolean(rv.tireBackDimension?.trim()) ||
    parseOptionalFloat(rv.treadDepthFL) != null;

  const manualSpecs: Record<string, unknown> = {};

  if (rv.batteryType || rv.batteryAmpere || rv.batteryVolt) {
    manualSpecs.battery = {
      batteryType: rv.batteryType || null,
      batteryAmpere: parseOptionalNumber(rv.batteryAmpere),
      batteryVolt: parseOptionalNumber(rv.batteryVolt),
    };
  }

  if (hasBrakeInput) {
    manualSpecs.brakes = {
      condition: 'UNKNOWN',
      odometerKm: parseOptionalNumber(rv.mileage),
      frontPadThickness: frontPad,
      rearPadThickness: rearPad,
      frontRotorDiameter: parseOptionalFloat(rv.brakeFrontRotorDiameter),
      rearRotorDiameter: parseOptionalFloat(rv.brakeBackRotorDiameter),
      frontRotorWidth: parseOptionalFloat(rv.brakeFrontRotorWidth),
      rearRotorWidth: parseOptionalFloat(rv.brakeBackRotorWidth),
    };
  }

  if (hasTireInput) {
    manualSpecs.tires = {
      frontDimension: rv.tireFrontDimension || null,
      rearDimension: rv.tireBackDimension || null,
      brandModelFront: rv.tireFrontBrandModel || null,
      brandModelRear: rv.tireBackBrandModel || null,
      tireSeason: rv.tireFrontSeason || null,
      loadIndexFront: rv.tireFrontLoadIndex || null,
      speedIndexFront: rv.tireFrontSpeedIndex || null,
      loadIndexRear: rv.tireBackLoadIndex || null,
      speedIndexRear: rv.tireBackSpeedIndex || null,
      dotCodeFront: rv.tireFrontDot || null,
      dotCodeRear: rv.tireBackDot || null,
      tireCondition: rv.tireCondition || null,
      treadFL: parseOptionalFloat(rv.treadDepthFL),
      treadFR: parseOptionalFloat(rv.treadDepthFR),
      treadBL: parseOptionalFloat(rv.treadDepthBL),
      treadBR: parseOptionalFloat(rv.treadDepthBR),
      aiTireSpec: rv.aiTireSpec ?? null,
    };
  }

  return Object.keys(manualSpecs).length > 0 ? manualSpecs : undefined;
}

export type PersistMasterVehicleResult = {
  vehicleId: string;
};

export async function persistMasterRegisteredVehicle(
  rv: RegisteredVehicle,
  options: { dimoVehicleId?: string | null } = {},
): Promise<PersistMasterVehicleResult> {
  const orgId = rv.organizationId;
  if (!orgId) {
    throw new Error('ORGANIZATION_REQUIRED');
  }

  const extraData = buildVehicleExtraData(rv);
  const manualSpecs = buildVehicleManualSpecs(rv);

  if (options.dimoVehicleId) {
    const created = await api.vehicles.registerFromDimo(orgId, {
      dimoVehicleId: options.dimoVehicleId,
      extraData,
      manualSpecs,
    });
    const vehicleId = created?.vehicle?.id ?? created?.id;
    if (!vehicleId) {
      throw new Error('REGISTER_FROM_DIMO_NO_VEHICLE_ID');
    }
    return { vehicleId: String(vehicleId) };
  }

  const vin = rv.vin?.trim();
  if (!vin) {
    throw new Error('VIN_REQUIRED');
  }

  const created = await api.vehicles.create(orgId, {
    vin,
    make: rv.make?.trim() || 'Unknown',
    model: rv.model?.trim() || 'Unknown',
    year: rv.year || new Date().getFullYear(),
    ...extraData,
  });

  const vehicleId = created?.id ?? created?.vehicle?.id;
  if (!vehicleId) {
    throw new Error('MANUAL_CREATE_NO_VEHICLE_ID');
  }
  return { vehicleId: String(vehicleId) };
}
