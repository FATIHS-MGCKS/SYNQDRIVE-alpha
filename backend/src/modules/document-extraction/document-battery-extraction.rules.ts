import { BatteryEvidenceScope } from '@prisma/client';
import type { PlausibilityCheck } from './document-extraction-plausibility.service';

export const BATTERY_SCOPES = ['lv', 'hv'] as const;

export type BatteryScopeLabel = (typeof BATTERY_SCOPES)[number];

export const BATTERY_RECORD_KINDS = ['measurement', 'replacement'] as const;

export type BatteryRecordKind = (typeof BATTERY_RECORD_KINDS)[number];

export const BATTERY_SOH_SOURCES = [
  'WORKSHOP_CAPACITY_TEST',
  'HV_BMS_REPORT',
  'WORKSHOP_TEST_RESULT',
  'NONE',
  'INFERRED_LV',
] as const;

export type BatterySohSource = (typeof BATTERY_SOH_SOURCES)[number];

export const LV_VOLTAGE_MIN = 6;
export const LV_VOLTAGE_MAX = 16;
export const HV_VOLTAGE_MIN = 200;
export const HV_VOLTAGE_MAX = 500;
export const SOH_PERCENT_MIN = 0;
export const SOH_PERCENT_MAX = 100;

export type BatteryApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type BatteryApplyGateResult = {
  canApply: boolean;
  canArchive: boolean;
  blockers: BatteryApplyGateBlocker[];
};

export type BatteryApplyPayload = {
  scope: BatteryEvidenceScope;
  recordKind: BatteryRecordKind;
  isReplacement: boolean;
  observedAt: Date;
  odometerKm: number | null;
  workshopName: string | null;
  deviceOrWorkshop: string | null;
  measurementType: string | null;
  batteryType: string | null;
  sohPercent: number | null;
  sohSource: BatterySohSource | null;
  voltageV: number | null;
  restingVoltage: number | null;
  crankingVoltage: number | null;
  chargingVoltage: number | null;
  capacityKwh: number | null;
  capacityAh: number | null;
  temperatureC: number | null;
  temperatureContext: string | null;
  notes: string | null;
};

function toStr(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value.trim().replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  const raw = toStr(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function readMeasurementDate(data: Record<string, unknown>): string | null {
  return toStr(data.measurementDate) ?? toStr(data.eventDate) ?? toStr(data.serviceDate);
}

export function readBatteryScope(data: Record<string, unknown>): BatteryScopeLabel | null {
  const raw =
    normalizeToken(toStr(data.scope)) ||
    normalizeToken(toStr(data.batteryScope)) ||
    normalizeToken(toStr(data.targetScope));
  if (!raw) return null;
  if (raw === 'LV' || raw === '12V') return 'lv';
  if (raw === 'HV' || raw === 'TRACTION' || raw === 'HIGH_VOLTAGE') return 'hv';
  return null;
}

export function resolveBatteryEvidenceScope(
  data: Record<string, unknown>,
): BatteryEvidenceScope | null {
  const scope = readBatteryScope(data);
  if (scope === 'hv') return BatteryEvidenceScope.HV;
  if (scope === 'lv') return BatteryEvidenceScope.LV;
  return null;
}

export function readRecordKind(data: Record<string, unknown>): BatteryRecordKind | null {
  const raw =
    toStr(data.recordKind)?.toLowerCase() ??
    toStr(data.measurementType)?.toLowerCase() ??
    toStr(data.serviceKind)?.toLowerCase();
  if (!raw) return null;
  if (raw.includes('replacement') || raw.includes('service')) return 'replacement';
  if (raw.includes('measurement') || raw.includes('test')) return 'measurement';
  return null;
}

export function readSohSource(data: Record<string, unknown>): BatterySohSource | null {
  const explicit = normalizeToken(toStr(data.sohSource));
  if (explicit === 'WORKSHOP_CAPACITY_TEST') return 'WORKSHOP_CAPACITY_TEST';
  if (explicit === 'HV_BMS_REPORT') return 'HV_BMS_REPORT';
  if (explicit === 'WORKSHOP_TEST_RESULT') return 'WORKSHOP_TEST_RESULT';
  if (explicit === 'INFERRED_LV') return 'INFERRED_LV';
  if (explicit === 'NONE') return 'NONE';

  const testResult = toStr(data.testResult)?.toLowerCase() ?? '';
  if (testResult.includes('capacity') || testResult.includes('soh')) {
    return 'WORKSHOP_TEST_RESULT';
  }
  if (toNum(data.sohPercent) != null && readBatteryScope(data) === 'hv') {
    return 'HV_BMS_REPORT';
  }
  if (toNum(data.sohPercent) != null) {
    return 'INFERRED_LV';
  }
  return toNum(data.sohPercent) == null ? 'NONE' : 'INFERRED_LV';
}

export function readConfirmedSohPercent(data: Record<string, unknown>): number | null {
  const soh = toNum(data.sohPercent);
  if (soh == null) return null;
  const source = readSohSource(data);
  if (
    source === 'WORKSHOP_CAPACITY_TEST' ||
    source === 'HV_BMS_REPORT' ||
    source === 'WORKSHOP_TEST_RESULT'
  ) {
    return soh;
  }
  return null;
}

export function readBatteryType(data: Record<string, unknown>): string | null {
  return toStr(data.batteryType) ?? toStr(data.chemistry);
}

export function isKnownBatteryType(data: Record<string, unknown>): boolean {
  const raw = normalizeToken(readBatteryType(data));
  if (!raw || raw === 'UNKNOWN' || raw === 'UNCLEAR') return false;
  return true;
}

export function readDeviceOrWorkshop(data: Record<string, unknown>): string | null {
  return (
    toStr(data.deviceOrWorkshop) ??
    toStr(data.testDevice) ??
    toStr(data.workshopName) ??
    toStr(data.issuer)
  );
}

export function readTemperatureContext(data: Record<string, unknown>): string | null {
  return toStr(data.temperatureContext) ?? toStr(data.ambientTemperatureNote);
}

export function readCapacityKwh(data: Record<string, unknown>): number | null {
  return toNum(data.capacityKwh) ?? toNum(data.hvCapacityKwh);
}

export function readCapacityAh(data: Record<string, unknown>): number | null {
  return toNum(data.capacityAh) ?? toNum(data.lvCapacityAh);
}

export function hasExplicitMeasurementDate(data: Record<string, unknown>): boolean {
  return readMeasurementDate(data) != null;
}

export function isLvSohInferenceAttempt(data: Record<string, unknown>): boolean {
  return (
    readBatteryScope(data) === 'lv' &&
    toNum(data.sohPercent) != null &&
    readSohSource(data) === 'INFERRED_LV'
  );
}

export function buildBatteryApplyPayload(data: Record<string, unknown>): BatteryApplyPayload | null {
  const observedAt = toDate(readMeasurementDate(data));
  const scope = resolveBatteryEvidenceScope(data);
  const recordKind = readRecordKind(data);
  if (!observedAt || !scope) return null;

  const resolvedKind = recordKind ?? 'measurement';
  const isReplacement = resolvedKind === 'replacement';

  return {
    scope,
    recordKind: resolvedKind,
    isReplacement,
    observedAt,
    odometerKm: toNum(data.odometerKm),
    workshopName: toStr(data.workshopName),
    deviceOrWorkshop: readDeviceOrWorkshop(data),
    measurementType: toStr(data.measurementType) ?? toStr(data.recordKind),
    batteryType: readBatteryType(data),
    sohPercent: readConfirmedSohPercent(data),
    sohSource: readSohSource(data),
    voltageV: toNum(data.voltageV),
    restingVoltage: toNum(data.restingVoltage),
    crankingVoltage: toNum(data.crankingVoltage),
    chargingVoltage: toNum(data.chargingVoltage),
    capacityKwh: readCapacityKwh(data),
    capacityAh: readCapacityAh(data),
    temperatureC: toNum(data.temperatureC),
    temperatureContext: readTemperatureContext(data),
    notes: toStr(data.notes) ?? toStr(data.description),
  };
}

export function collectBatteryPlausibilityChecks(
  fields: Record<string, unknown>,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const scope = readBatteryScope(fields);
  const batteryType = readBatteryType(fields);

  if (!hasExplicitMeasurementDate(fields) && (scope || toNum(fields.voltageV) != null)) {
    checks.push({
      code: 'BATTERY_MISSING_MEASUREMENT_DATE',
      status: 'WARNING',
      message: 'Measurement date is missing — battery measurements cannot auto-apply.',
      source: 'DOCUMENT',
    });
  }

  if (!scope && (toNum(fields.voltageV) != null || toNum(fields.sohPercent) != null)) {
    checks.push({
      code: 'BATTERY_SCOPE_NOT_STATED',
      status: 'BLOCKER',
      message: 'Battery scope (lv/hv) must be stated — scope is never defaulted.',
      source: 'DOCUMENT',
    });
  }

  if (isLvSohInferenceAttempt(fields)) {
    checks.push({
      code: 'BATTERY_LV_SOH_NOT_REAL_SOURCE',
      status: 'BLOCKER',
      message: 'LV voltage/resting evidence cannot be treated as confirmed SOH.',
      source: 'DOCUMENT',
    });
  }

  if (batteryType && !isKnownBatteryType(fields)) {
    checks.push({
      code: 'BATTERY_TYPE_UNKNOWN',
      status: 'WARNING',
      message: 'Battery type is unknown — type-specific ranges are not evaluated.',
      source: 'DOCUMENT',
    });
  }

  const voltage = toNum(fields.voltageV) ?? toNum(fields.restingVoltage);
  if (scope === 'lv' && voltage != null && (voltage < LV_VOLTAGE_MIN || voltage > LV_VOLTAGE_MAX)) {
    checks.push({
      code: 'LV_VOLTAGE_RANGE',
      status: 'WARNING',
      message: `12V battery voltage (${voltage} V) is outside the plausible ${LV_VOLTAGE_MIN}–${LV_VOLTAGE_MAX} V range.`,
      source: 'DOCUMENT',
    });
  }

  if (scope === 'hv' && voltage != null && (voltage < HV_VOLTAGE_MIN || voltage > HV_VOLTAGE_MAX)) {
    checks.push({
      code: 'HV_VOLTAGE_RANGE',
      status: 'WARNING',
      message: `HV battery voltage (${voltage} V) is outside the plausible ${HV_VOLTAGE_MIN}–${HV_VOLTAGE_MAX} V range.`,
      source: 'DOCUMENT',
    });
  }

  const soh = toNum(fields.sohPercent);
  if (soh != null && (soh < SOH_PERCENT_MIN || soh > SOH_PERCENT_MAX)) {
    checks.push({
      code: 'SOH_RANGE',
      status: 'WARNING',
      message: `State of health (${soh}%) is outside ${SOH_PERCENT_MIN}–${SOH_PERCENT_MAX}%.`,
      source: 'DOCUMENT',
    });
  }

  const confirmedSoh = readConfirmedSohPercent(fields);
  if (soh != null && confirmedSoh == null) {
    checks.push({
      code: 'BATTERY_SOH_SOURCE_UNCONFIRMED',
      status: 'WARNING',
      message: 'SOH is present but not backed by a confirmed workshop/HV source.',
      source: 'DOCUMENT',
    });
  }

  return checks;
}

export function assessBatteryApplyGate(input: {
  fields: Record<string, unknown>;
}): BatteryApplyGateResult {
  const blockers: BatteryApplyGateBlocker[] = [];

  const plausibilityBlockers = collectBatteryPlausibilityChecks(input.fields).filter(
    (check) => check.status === 'BLOCKER',
  );
  for (const check of plausibilityBlockers) {
    blockers.push({ code: check.code, message: check.message });
  }

  if (!hasExplicitMeasurementDate(input.fields)) {
    blockers.push({
      code: 'BATTERY_MEASUREMENT_DATE_REQUIRED',
      message: 'Measurement date is required before battery measurements can be applied.',
      fieldKeys: ['measurementDate', 'eventDate'],
    });
  }

  if (!readBatteryScope(input.fields)) {
    blockers.push({
      code: 'BATTERY_SCOPE_REQUIRED',
      message: 'Battery scope (lv/hv) must be confirmed — no lv default is applied.',
      fieldKeys: ['scope'],
    });
  }

  if (isLvSohInferenceAttempt(input.fields)) {
    blockers.push({
      code: 'BATTERY_LV_SOH_BLOCKED',
      message: 'LV health evidence cannot be applied as confirmed SOH.',
      fieldKeys: ['sohPercent', 'sohSource'],
    });
  }

  if (!buildBatteryApplyPayload(input.fields)) {
    blockers.push({
      code: 'BATTERY_PAYLOAD_INCOMPLETE',
      message: 'Battery apply payload is incomplete — scope and measurement date are required.',
      fieldKeys: ['scope', 'measurementDate'],
    });
  }

  return {
    canApply: blockers.length === 0,
    canArchive: true,
    blockers,
  };
}
