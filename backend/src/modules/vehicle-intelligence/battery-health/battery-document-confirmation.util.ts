import { BatteryEvidenceScope } from '@prisma/client';

export interface NormalizedBatteryDocumentConfirm {
  scope: BatteryEvidenceScope;
  recordKind: 'measurement' | 'replacement';
  isReplacement: boolean;
  observedAt: Date;
  odometerKm: number | null;
  sohPercent: number | null;
  voltageV: number | null;
  restingVoltage: number | null;
  crankingVoltage: number | null;
  chargingVoltage: number | null;
  temperatureC: number | null;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizeBatteryDocumentConfirm(
  payload: Record<string, unknown>,
  now: Date = new Date(),
): NormalizedBatteryDocumentConfirm {
  const scopeRaw =
    (typeof payload.scope === 'string' && payload.scope.toLowerCase()) ||
    (typeof payload.batteryScope === 'string' &&
      payload.batteryScope.toLowerCase()) ||
    (typeof payload.targetScope === 'string' &&
      payload.targetScope.toLowerCase()) ||
    'lv';
  const scope: BatteryEvidenceScope =
    scopeRaw === 'hv' || scopeRaw === 'traction'
      ? BatteryEvidenceScope.HV
      : BatteryEvidenceScope.LV;

  const recordKindRaw =
    (typeof payload.recordKind === 'string' &&
      payload.recordKind.toLowerCase()) ||
    (typeof payload.serviceKind === 'string' &&
      payload.serviceKind.toLowerCase()) ||
    '';
  const isReplacement =
    recordKindRaw.includes('replacement') ||
    recordKindRaw.includes('service') ||
    payload.isReplacement === true;

  const observedAt =
    typeof payload.eventDate === 'string' && payload.eventDate
      ? new Date(payload.eventDate)
      : now;

  return {
    scope,
    recordKind: isReplacement ? 'replacement' : 'measurement',
    isReplacement,
    observedAt,
    odometerKm: parseNumber(payload.odometerKm),
    sohPercent: parseNumber(payload.sohPercent),
    voltageV: parseNumber(payload.voltageV),
    restingVoltage: parseNumber(payload.restingVoltage),
    crankingVoltage: parseNumber(payload.crankingVoltage),
    chargingVoltage: parseNumber(payload.chargingVoltage),
    temperatureC: parseNumber(payload.temperatureC),
  };
}
