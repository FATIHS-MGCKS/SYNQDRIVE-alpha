import { api } from '../../lib/api';
import type { DimoVehicle, RegisteredVehicle } from '../data/platform-data';
import { parseMotionPhysicsCurbMassField } from './motion-physics-reference-sync.util';
import {
  buildHvMasterSpecPatchFromRegisteredVehicle,
  extractHvMasterSpecFormFields,
} from './master-hv-master-specification.util';

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

function isElectrifiedFuelType(fuelType: string | undefined | null): boolean {
  const fuel = String(fuelType ?? '').trim().toLowerCase();
  if (!fuel) return false;
  return (
    fuel.includes('electric') ||
    fuel.includes('plugin') ||
    fuel.includes('phev') ||
    fuel === 'hybrid' ||
    fuel.includes('hybrid')
  );
}

/** HV traction capacity fields for Master DIMO register-from-dimo extraData (usable vs gross kept separate). */
export function buildMasterHvCapacityExtraFields(
  rv: RegisteredVehicle,
): Record<string, number> {
  if (!isElectrifiedFuelType(rv.fuelType)) return {};

  const usable =
    parseOptionalFloat(rv.hvBatteryUsableCapacityKwh) ??
    parseOptionalFloat(rv.hvBatteryCapacityKwh);
  const gross = parseOptionalFloat(rv.hvBatteryGrossCapacityKwh);

  const out: Record<string, number> = {};
  if (usable != null) out.hvBatteryUsableCapacityKwh = usable;
  if (gross != null) out.hvBatteryGrossCapacityKwh = gross;
  return out;
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
    systemMotorPowerKw: parseOptionalFloat(rv.systemMotorPowerKw),
    accel0To100S: parseOptionalFloat(rv.accel0To100S),
    motionPhysicsVariantAssumption: rv.motionPhysicsVariantAssumption?.trim() || undefined,
    idleRpm: parseOptionalNumber(rv.idleRpm),
    maxRpm: parseOptionalNumber(rv.maxRpm),
    brakeForceFrontPercent: parseOptionalFloat(rv.brakeForceDistribution),
    frontToRearWeightDistribution: rv.frontToRearWeightDistribution || undefined,
    tankCapacityLiters: parseOptionalFloat(rv.tankCapacityLiters),
    serviceIntervalManufacturerKm: parseOptionalNumber(rv.serviceIntervalManufacturerKm),
    serviceIntervalManufacturerMonths: parseOptionalNumber(rv.serviceIntervalManufacturerMonths),
    oilChangeIntervalKm: parseOptionalNumber(rv.oilChangeIntervalKm),
    oilChangeIntervalMonths: parseOptionalNumber(rv.oilChangeIntervalMonths),
    ...buildMasterHvCapacityExtraFields(rv),
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

export type ManualBaselineArea = 'tires' | 'battery' | 'brakes';

export type ManualBaselineFailure = {
  area: ManualBaselineArea;
  message: string;
};

export type PostActivationEnrichmentResult = {
  tireTread?: {
    status: 'FAILED';
    message: string;
  };
};

export type PersistMasterVehicleResult = {
  vehicleId: string;
  /** Present when the vehicle was created but post-create baseline APIs failed (manual create only). */
  baselineFailures?: ManualBaselineFailure[];
  /** Present when register-from-dimo succeeded but server-side tire enrichment failed. */
  postActivationEnrichment?: PostActivationEnrichmentResult;
};

function baselineErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return 'UNKNOWN_ERROR';
}

type ManualTirePayload = {
  frontDimension?: string | null;
  rearDimension?: string | null;
  brandModelFront?: string | null;
  brandModelRear?: string | null;
  tireSeason?: string | null;
  loadIndexFront?: string | null;
  speedIndexFront?: string | null;
  loadIndexRear?: string | null;
  speedIndexRear?: string | null;
  dotCodeFront?: string | null;
  dotCodeRear?: string | null;
  tireCondition?: string | null;
  treadFL?: number | null;
  treadFR?: number | null;
  treadBL?: number | null;
  treadBR?: number | null;
};
type ManualBrakePayload = {
  odometerKm?: number | null;
  frontPadThickness?: number | null;
  rearPadThickness?: number | null;
  frontRotorWidth?: number | null;
  rearRotorWidth?: number | null;
};
type ManualBatteryPayload = {
  batteryType?: string | null;
  batteryAmpere?: number | null;
  batteryVolt?: number | null;
};

/** Fields only applied via register-from-dimo today (no safe post-create API). */
export const MANUAL_CREATE_UNSUPPORTED_REGISTERED_VEHICLE_FIELDS = [
  'serviceHistory',
  'highMobilityActivation',
] as const;

/** Not persisted on register-from-dimo (no vehicle columns); use vehicle update after registration. */
export const REGISTER_FROM_DIMO_UNSUPPORTED_EXTRA_FIELDS = [
  'engineDisplacementCc',
  'cylinderCount',
] as const;

export async function applyManualBaselinesAfterCreate(
  orgId: string,
  vehicleId: string,
  rv: RegisteredVehicle,
): Promise<ManualBaselineFailure[]> {
  const failures: ManualBaselineFailure[] = [];
  const manualSpecs = buildVehicleManualSpecs(rv);
  if (!manualSpecs) return failures;

  const tires = manualSpecs.tires as ManualTirePayload | undefined;
  if (tires) {
    try {
      await api.vehicles.upsertTires(orgId, vehicleId, {
      frontDimension: tires.frontDimension ?? null,
      rearDimension: tires.rearDimension ?? null,
      brandModelFront: tires.brandModelFront ?? null,
      brandModelRear: tires.brandModelRear ?? null,
      tireSeason: tires.tireSeason ?? null,
      loadIndexFront: tires.loadIndexFront ?? null,
      speedIndexFront: tires.speedIndexFront ?? null,
      loadIndexRear: tires.loadIndexRear ?? null,
      speedIndexRear: tires.speedIndexRear ?? null,
      dotCodeFront: tires.dotCodeFront ?? null,
      dotCodeRear: tires.dotCodeRear ?? null,
      tireCondition: tires.tireCondition ?? null,
      treadFL: tires.treadFL ?? null,
      treadFR: tires.treadFR ?? null,
      treadBL: tires.treadBL ?? null,
      treadBR: tires.treadBR ?? null,
      });
    } catch (error) {
      failures.push({ area: 'tires', message: baselineErrorMessage(error) });
    }
  }

  const battery = manualSpecs.battery as ManualBatteryPayload | undefined;
  if (battery) {
    try {
      await api.vehicleIntelligence.createBatterySpec(vehicleId, {
      batteryType: battery.batteryType ?? null,
      batteryAmpere: battery.batteryAmpere ?? null,
      batteryVolt: battery.batteryVolt ?? null,
      sourceType: 'MANUAL',
      sourceConfidence: 1,
      });
    } catch (error) {
      failures.push({ area: 'battery', message: baselineErrorMessage(error) });
    }
  }

  const brakes = manualSpecs.brakes as ManualBrakePayload | undefined;
  if (brakes) {
    const hasPad =
      brakes.frontPadThickness != null ||
      brakes.rearPadThickness != null ||
      brakes.frontRotorWidth != null ||
      brakes.rearRotorWidth != null;
    if (hasPad) {
      try {
        await api.vehicleIntelligence.brakeHealthInitialize(vehicleId, {
          serviceDate: new Date().toISOString(),
          odometerKm: brakes.odometerKm ?? parseOptionalNumber(rv.mileage) ?? undefined,
          frontPadMm: brakes.frontPadThickness ?? undefined,
          rearPadMm: brakes.rearPadThickness ?? undefined,
          frontRotorWidthMm: brakes.frontRotorWidth ?? undefined,
          rearRotorWidthMm: brakes.rearRotorWidth ?? undefined,
        });
      } catch (error) {
        failures.push({ area: 'brakes', message: baselineErrorMessage(error) });
      }
    }
  }

  return failures;
}

/** Admin GET may expose legacy `hvBatteryCapacityKwh` without split usable/gross fields. */
export function resolveAdminDtoHvUsableCapacityKwh(
  dto: Record<string, unknown>,
): string {
  const usable = dto.hvBatteryUsableCapacityKwh;
  if (usable != null && String(usable).trim() !== '') {
    return String(usable);
  }
  const legacy = dto.hvBatteryCapacityKwh;
  if (legacy != null && String(legacy).trim() !== '') {
    return String(legacy);
  }
  return '';
}

export function assertMasterHvCapacityConsistency(rv: RegisteredVehicle): void {
  const usable =
    parseOptionalFloat(rv.hvBatteryUsableCapacityKwh) ??
    parseOptionalFloat(rv.hvBatteryCapacityKwh);
  const gross = parseOptionalFloat(rv.hvBatteryGrossCapacityKwh);
  if (usable != null && gross != null && usable > gross) {
    throw new Error('HV_USABLE_EXCEEDS_GROSS');
  }
}

export type MasterVehicleHvStammdatenDiff = {
  vehiclePatch: Record<string, unknown>;
  usableReferenceKwh: number | null;
  usableReferenceChanged: boolean;
};

/**
 * Master spec edit: vehicle-table HV scalars (usable legacy column + tank).
 * Gross kWh has no vehicle column; canonical gross reference is not written here
 * (single active reference row + gross not used as SOH reference on register).
 */
export function buildMasterVehicleHvStammdatenDiff(
  current: RegisteredVehicle,
  baseline: RegisteredVehicle,
): MasterVehicleHvStammdatenDiff {
  const vehiclePatch: Record<string, unknown> = {};
  const electrified = isElectrifiedFuelType(current.fuelType);

  const nextUsable =
    parseOptionalFloat(current.hvBatteryUsableCapacityKwh) ??
    parseOptionalFloat(current.hvBatteryCapacityKwh);
  const prevUsable =
    parseOptionalFloat(baseline.hvBatteryUsableCapacityKwh) ??
    parseOptionalFloat(baseline.hvBatteryCapacityKwh);

  if (electrified) {
    if (nextUsable !== prevUsable) {
      vehiclePatch.hvBatteryCapacityKwh = nextUsable;
    }
  }

  const nextTank = parseOptionalFloat(current.tankCapacityLiters);
  const prevTank = parseOptionalFloat(baseline.tankCapacityLiters);
  if (nextTank !== prevTank) {
    vehiclePatch.tankCapacityLiters = nextTank;
  }

  const usableReferenceChanged =
    electrified && nextUsable != null && nextUsable !== prevUsable;

  return {
    vehiclePatch,
    usableReferenceKwh: electrified ? nextUsable : null,
    usableReferenceChanged,
  };
}

/** Maps Master admin GET vehicle DTO into the registration modal shape (full baseline for edit). */
export function mapAdminVehicleDtoToRegisteredVehicle(
  dto: Record<string, unknown>,
): RegisteredVehicle {
  const str = (key: string, fallback = '') => {
    const v = dto[key];
    return v != null && String(v).trim() !== '' ? String(v) : fallback;
  };
  const num = (key: string, fallback = 0) => {
    const v = dto[key];
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const makeRaw = str('make');
  const modelRaw = str('model');
  const mileageRaw = dto.mileage ?? dto.mileageKm;
  const hardwareRaw = dto.hardwareType != null ? String(dto.hardwareType).trim() : '';

  return {
    id: str('id'),
    vehicleName: str('vehicleName', `${makeRaw} ${modelRaw}`.trim()),
    vin: str('vin'),
    make: makeRaw || 'Unknown',
    model: modelRaw || 'Unknown',
    year: dto.year != null && dto.year !== '' ? num('year', 0) : 0,
    organizationId: str('organizationId'),
    organizationName: str('organizationName'),
    station: str('station'),
    status: (str('status') as RegisteredVehicle['status']) || 'Available',
    health: (str('health') as RegisteredVehicle['health']) || 'Good',
    lastSignal: str('lastSignal'),
    online: Boolean(dto.online),
    fuelType: str('fuelType'),
    mileage:
      mileageRaw != null && mileageRaw !== '' && Number.isFinite(Number(mileageRaw))
        ? Number(mileageRaw)
        : 0,
    licensePlate: str('licensePlate'),
    vehicleType: str('vehicleType'),
    operationalStatus: str('operationalStatus', 'Active'),
    notes: str('notes'),
    batteryType: str('batteryType'),
    batteryAmpere: str('batteryAmpere'),
    batteryVolt: str('batteryVolt'),
    lvBatteryChemistry: str('lvBatteryChemistry'),
    hvBatteryCapacityKwh:
      str('hvBatteryCapacityKwh') || resolveAdminDtoHvUsableCapacityKwh(dto),
    tankCapacityLiters: str('tankCapacityLiters'),
    hvBatteryPresent: str('hvBatteryPresent'),
    hvBatteryChemistry: str('hvBatteryChemistry'),
    hvBatteryCellFormat: str('hvBatteryCellFormat'),
    hvBatteryGrossCapacityKwh: str('hvBatteryGrossCapacityKwh'),
    hvBatteryUsableCapacityKwh: resolveAdminDtoHvUsableCapacityKwh(dto),
    hvBatteryNominalVoltage: str('hvBatteryNominalVoltage'),
    hvBatteryArchitecture: str('hvBatteryArchitecture'),
    hvBatteryThermalManagement: str('hvBatteryThermalManagement'),
    hvBatteryWarrantyYears: str('hvBatteryWarrantyYears'),
    hvBatteryWarrantyKm: str('hvBatteryWarrantyKm'),
    acOnboardChargerKw: str('acOnboardChargerKw'),
    dcFastChargeMaxKw: str('dcFastChargeMaxKw'),
    engineDisplacementCc: str('engineDisplacementCc'),
    cylinderCount: str('cylinderCount'),
    tireFrontDimension: str('tireFrontDimension'),
    tireFrontBrandModel: str('tireFrontBrandModel'),
    tireFrontSeason: str('tireFrontSeason'),
    tireFrontDot: str('tireFrontDot'),
    tireFrontLoadIndex: str('tireFrontLoadIndex'),
    tireFrontSpeedIndex: str('tireFrontSpeedIndex'),
    tireBackDimension: str('tireBackDimension'),
    tireBackBrandModel: str('tireBackBrandModel'),
    tireBackSeason: str('tireBackSeason'),
    tireBackDot: str('tireBackDot'),
    tireBackLoadIndex: str('tireBackLoadIndex'),
    tireBackSpeedIndex: str('tireBackSpeedIndex'),
    treadDepthFL: str('treadDepthFL'),
    treadDepthFR: str('treadDepthFR'),
    treadDepthBL: str('treadDepthBL'),
    treadDepthBR: str('treadDepthBR'),
    tireCondition: (str('tireCondition') as RegisteredVehicle['tireCondition']) || '',
    aiTireSpec: (dto.aiTireSpec as Record<string, unknown> | null) ?? null,
    brakeFrontRotorDiameter: str('brakeFrontRotorDiameter'),
    brakeFrontRotorWidth: str('brakeFrontRotorWidth'),
    brakeFrontPadThickness: str('brakeFrontPadThickness'),
    brakeBackRotorDiameter: str('brakeBackRotorDiameter'),
    brakeBackRotorWidth: str('brakeBackRotorWidth'),
    brakeBackPadThickness: str('brakeBackPadThickness'),
    idleRpm: str('idleRpm'),
    maxRpm: str('maxRpm'),
    drivetrain: str('drivetrain'),
    brakeForceDistribution: str('brakeForceDistribution'),
    frontToRearWeightDistribution: str('frontToRearWeightDistribution'),
    curbWeight: str('curbWeight'),
    systemMotorPowerKw: str('systemMotorPowerKw'),
    accel0To100S: str('accel0To100S'),
    motionPhysicsVariantAssumption: str('motionPhysicsVariantAssumption'),
    connectionModality:
      dto.connectionModality != null && String(dto.connectionModality).trim() !== ''
        ? String(dto.connectionModality)
        : null,
    telemetryConnectionFamily:
      dto.telemetryConnectionFamily != null &&
      String(dto.telemetryConnectionFamily).trim() !== ''
        ? String(dto.telemetryConnectionFamily)
        : null,
    serviceIntervals: str('serviceIntervals'),
    serviceIntervalManufacturerKm: str('serviceIntervalManufacturerKm'),
    serviceIntervalManufacturerMonths: str('serviceIntervalManufacturerMonths'),
    oilChangeIntervalKm: str('oilChangeIntervalKm'),
    oilChangeIntervalMonths: str('oilChangeIntervalMonths'),
    lastTuev: str('lastTuev'),
    lastBokraft: str('lastBokraft'),
    lastInspection: str('lastInspection'),
    lastOilChange: str('lastOilChange'),
    lastBrakePadChange: str('lastBrakePadChange'),
    lastBrakeRotorChange: str('lastBrakeRotorChange'),
    hardwareType: (hardwareRaw || 'UNKNOWN') as RegisteredVehicle['hardwareType'],
  };
}

export function parseCurbWeightKgFromForm(curbWeight: string | undefined | null): number | null {
  const parsed = parseMotionPhysicsCurbMassField(String(curbWeight ?? ''));
  if (parsed.status === 'empty') return null;
  if (parsed.status === 'invalid') {
    throw new Error('CURB_MASS_INVALID');
  }
  return parsed.kg;
}

/**
 * Connected-vehicles spec edit: only changed vehicle-table physics scalars (curb mass).
 * Motion power/accel/variant persist via motion-physics-reference APIs in the modal.
 */
export function buildMasterVehiclePhysicsSpecPatch(
  current: RegisteredVehicle,
  baseline: RegisteredVehicle,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const nextKg = parseCurbWeightKgFromForm(current.curbWeight);
  const prevKg = parseCurbWeightKgFromForm(baseline.curbWeight);
  if (nextKg != null && nextKg !== prevKg) {
    patch.curbWeightKg = nextKg;
  }
  return patch;
}

export type MasterVehiclePhysicsEditOptions = {
  baseline: RegisteredVehicle;
};

/** Spec edit from Connected Vehicles — vehicle physics PATCH only; no tire/battery/brake side effects. */
export async function updateMasterRegisteredVehicle(
  rv: RegisteredVehicle,
  options: MasterVehiclePhysicsEditOptions,
): Promise<void> {
  const orgId = rv.organizationId?.trim();
  const vehicleId = rv.id?.trim();
  if (!orgId || !vehicleId) {
    throw new Error('ORG_VEHICLE_REQUIRED');
  }
  if (!options.baseline?.id) {
    throw new Error('EDIT_BASELINE_REQUIRED');
  }

  const patch = buildMasterVehiclePhysicsSpecPatch(rv, options.baseline);
  if (Object.keys(patch).length > 0) {
    await api.vehicles.update(orgId, vehicleId, patch);
  }

  const hvMasterPatch = buildHvMasterSpecPatchFromRegisteredVehicle(rv, options.baseline);
  if (hvMasterPatch) {
    await api.vehicles.upsertHvMasterSpecification(vehicleId, hvMasterPatch);
  }
}

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
    const postActivationEnrichment = created?.postActivationEnrichment as
      | PostActivationEnrichmentResult
      | undefined;
    return {
      vehicleId: String(vehicleId),
      postActivationEnrichment,
    };
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
  const id = String(vehicleId);
  const baselineFailures = await applyManualBaselinesAfterCreate(orgId, id, rv);
  return {
    vehicleId: id,
    baselineFailures: baselineFailures.length > 0 ? baselineFailures : undefined,
  };
}
