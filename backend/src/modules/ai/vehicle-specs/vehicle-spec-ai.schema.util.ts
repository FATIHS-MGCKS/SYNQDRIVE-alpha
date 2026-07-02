import type { VehicleSpecContext, VehicleSpecsScopeResolution } from './vehicle-spec-ai.types';

export const VEHICLE_SPEC_FIELD_KEYS = [
  'lvBatteryType',
  'lvBatteryChemistry',
  'lvBatteryAmpere',
  'lvBatteryVolt',
  'hvBatteryPresent',
  'hvBatteryChemistry',
  'hvBatteryCellFormat',
  'hvBatteryGrossCapacityKwh',
  'hvBatteryUsableCapacityKwh',
  'hvBatteryNominalVoltage',
  'hvBatteryArchitecture',
  'hvBatteryModuleCount',
  'hvBatteryCellCount',
  'hvBatteryThermalManagement',
  'hvBatteryWarrantyYears',
  'hvBatteryWarrantyKm',
  'acOnboardChargerKw',
  'dcFastChargeMaxKw',
  'tankCapacityLiters',
  'engineDisplacementCc',
  'cylinderCount',
  'frontRotorDiameterMm',
  'frontRotorWidthMm',
  'frontPadThicknessMm',
  'rearRotorDiameterMm',
  'rearRotorWidthMm',
  'rearPadThicknessMm',
  'brakeForceDistribution',
  'idleRpm',
  'maxRpm',
  'curbWeightKg',
  'drivetrain',
  'frontToRearWeightDistribution',
  'manufacturerServiceIntervalKm',
  'manufacturerServiceIntervalMonths',
  'oilchangeIntervalKm',
  'oilchangeIntervalMonths',
] as const;

const LEGACY_ALIAS_KEYS = ['batteryType', 'batteryAmpere', 'batteryVolt', 'hvBatteryCapacityKwh'] as const;

function nullable(inner: Record<string, unknown>): Record<string, unknown> {
  return { anyOf: [inner, { type: 'null' }] };
}

export function buildVehicleSpecEmptyShape(): Record<string, string | number | boolean | null> {
  const empty: Record<string, string | number | boolean | null> = {};
  for (const key of [...VEHICLE_SPEC_FIELD_KEYS, ...LEGACY_ALIAS_KEYS]) {
    empty[key] = null;
  }
  return empty;
}

export function buildVehicleSpecJsonSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const key of VEHICLE_SPEC_FIELD_KEYS) {
    if (
      key === 'hvBatteryPresent' ||
      key.endsWith('Count') ||
      key === 'cylinderCount'
    ) {
      properties[key] = nullable({ type: 'number' });
      continue;
    }
    if (
      key.includes('Mm') ||
      key.includes('Km') ||
      key.includes('Kw') ||
      key.includes('Kwh') ||
      key.includes('Liters') ||
      key.includes('Cc') ||
      key.includes('Rpm') ||
      key.includes('Kg') ||
      key.includes('Months') ||
      key === 'brakeForceDistribution'
    ) {
      properties[key] = nullable({ type: 'number' });
      continue;
    }
    properties[key] = nullable({ type: 'string' });
  }

  return {
    type: 'object',
    properties,
    additionalProperties: false,
  };
}

export function normalizeVehicleTokenIds(tokenIds?: number[]): number[] | undefined {
  if (!tokenIds?.length) return undefined;
  const unique = [...new Set(tokenIds.filter((id) => Number.isFinite(id) && id > 0))];
  return unique.length > 0 ? unique.sort((a, b) => a - b) : undefined;
}

export function resolveVehicleSpecsScope(tokenIds?: number[]): VehicleSpecsScopeResolution {
  const vehicleIds = normalizeVehicleTokenIds(tokenIds);
  if (vehicleIds) {
    return { vehicleIds, hasVehicleScope: true, knowledgeOnlyFallback: false };
  }
  return { vehicleIds: undefined, hasVehicleScope: false, knowledgeOnlyFallback: true };
}

export function buildVehicleSpecPrompt(
  vehicle: VehicleSpecContext | undefined,
  scope: VehicleSpecsScopeResolution,
): { system: string; user: string } {
  const vinLine = vehicle?.vin ? `VIN: ${vehicle.vin}` : '';
  const makeLine = vehicle?.make ? `MAKE: ${vehicle.make}` : '';
  const modelLine = vehicle?.model ? `MODEL: ${vehicle.model}` : '';
  const yearLine = vehicle?.year ? `YEAR: ${vehicle.year}` : '';
  const drivetrainLine = vehicle?.drivetrain ? `DRIVETRAIN: ${vehicle.drivetrain}` : '';
  const powertrainLine = vehicle?.powertrainType ? `POWERTRAIN_TYPE: ${vehicle.powertrainType}` : '';
  const fuelTypeLine = vehicle?.fuelType ? `FUEL_TYPE: ${vehicle.fuelType}` : '';
  const vehicleBlock = [vinLine, makeLine, modelLine, yearLine, drivetrainLine, powertrainLine, fuelTypeLine]
    .filter(Boolean)
    .join('\n');
  const tokenCtx =
    scope.vehicleIds && scope.vehicleIds.length > 0
      ? `Vehicle Token IDs (DIMO linkage for context only): ${scope.vehicleIds.join(', ')}`
      : '';

  const scopeNote = scope.knowledgeOnlyFallback
    ? 'No DIMO tokenId is available. Use make/model/year/VIN context only. Do NOT claim live DIMO telemetry or invent live vehicle data.'
    : 'DIMO tokenId(s) provided — vehicle context may be used, but return OEM factory specs as JSON only.';

  const system = `You are a vehicle specification database assistant with deep automotive engineering knowledge.
Answer from your automotive knowledge only. Do NOT perform web searches.
Return structured OEM/factory specifications. Use null when genuinely unknown — never invent values.
${scopeNote}`;

  const user = `${vehicleBlock ? `Vehicle context:\n${vehicleBlock}\n${tokenCtx}\n` : ''}
Fill factory/OEM specifications for this vehicle.
Rules:
- use null ONLY if you genuinely do not know the value
- numbers without units in numeric fields
- tankCapacityLiters: fuel tank liters for ICE/HEV/PHEV, null for pure EV
- drivetrain: FWD, RWD, AWD, or 4WD
- brakeForceDistribution: front percentage as number (e.g. 60)
- frontToRearWeightDistribution: string ratio, e.g. "60/40"
- lvBattery* = low-voltage auxiliary 12V battery
- hvBatteryPresent=true only for HEV/PHEV/EV, false for pure ICE
- for ICE vehicles, set all hvBattery* to null and hvBatteryPresent=false
- for pure EV, engineDisplacementCc and cylinderCount must be null`;

  return { system, user };
}

export function parseVehicleSpecJson(
  parsed: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean | null> {
  const result = buildVehicleSpecEmptyShape();
  if (!parsed || typeof parsed !== 'object') return result;

  for (const key of Object.keys(result)) {
    if (key in parsed && parsed[key] !== undefined) {
      result[key] = parsed[key] as string | number | boolean | null;
    }
  }

  if (result.lvBatteryType !== null && result.batteryType === null) result.batteryType = result.lvBatteryType;
  if (result.lvBatteryAmpere !== null && result.batteryAmpere === null) result.batteryAmpere = result.lvBatteryAmpere;
  if (result.lvBatteryVolt !== null && result.batteryVolt === null) result.batteryVolt = result.lvBatteryVolt;
  if (result.hvBatteryUsableCapacityKwh !== null && result.hvBatteryCapacityKwh === null) {
    result.hvBatteryCapacityKwh = result.hvBatteryUsableCapacityKwh;
  }

  return result;
}
