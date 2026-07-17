import type { PlausibilityCheck } from './document-extraction-plausibility.service';

export const TIRE_POSITIONS = ['fl', 'fr', 'rl', 'rr'] as const;

export type TirePosition = (typeof TIRE_POSITIONS)[number];

export const TIRE_PRESSURE_UNITS = ['bar', 'psi', 'kPa'] as const;

export type TirePressureUnit = (typeof TIRE_PRESSURE_UNITS)[number];

export const TIRE_TREAD_UNITS = ['mm'] as const;

export type TireTreadUnit = (typeof TIRE_TREAD_UNITS)[number];

export const TIRE_TREAD_MM_MAX = 14;
export const TIRE_PRESSURE_BAR_MIN = 1.0;
export const TIRE_PRESSURE_BAR_MAX = 4.5;

export type TireApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type TireApplyGateResult = {
  canApply: boolean;
  canArchive: boolean;
  blockers: TireApplyGateBlocker[];
};

export type TirePositionMeasurement = {
  position: TirePosition;
  treadDepthMm: number | null;
  pressureBar: number | null;
  dimension: string | null;
  dot: string | null;
};

export type TireMeasurementApplyPayload = {
  measurementDate: Date;
  treadDepthUnit: TireTreadUnit;
  pressureUnit: TirePressureUnit | null;
  odometerKm: number | null;
  workshopName: string | null;
  positions: TirePositionMeasurement[];
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
  return (value ?? '').trim().toLowerCase();
}

function readNestedRecord(
  data: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const raw = data[key];
  return raw != null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

export function readMeasurementDate(data: Record<string, unknown>): string | null {
  return toStr(data.measurementDate) ?? toStr(data.eventDate) ?? toStr(data.serviceDate);
}

export function readTreadDepthUnit(data: Record<string, unknown>): TireTreadUnit | null {
  const raw = normalizeToken(toStr(data.treadDepthUnit));
  if (!raw) return null;
  return raw === 'mm' ? 'mm' : null;
}

export function readPressureUnit(data: Record<string, unknown>): TirePressureUnit | null {
  const raw = normalizeToken(toStr(data.pressureUnit));
  if (!raw) return null;
  if (raw === 'bar') return 'bar';
  if (raw === 'psi') return 'psi';
  if (raw === 'kpa') return 'kPa';
  return null;
}

export function readTreadDepthForPosition(
  data: Record<string, unknown>,
  position: TirePosition,
): number | null {
  const tread = readNestedRecord(data, 'treadDepthMm');
  if (tread) {
    const value = toNum(tread[position]);
    if (value != null) return value;
  }
  const flat = toNum(data[`treadDepthMm.${position}`]);
  return flat;
}

export function readPressureForPosition(
  data: Record<string, unknown>,
  position: TirePosition,
): number | null {
  const pressure = readNestedRecord(data, 'pressureBar') ?? readNestedRecord(data, 'pressure');
  if (pressure) {
    const value = toNum(pressure[position]);
    if (value != null) return value;
  }
  const flat = toNum(data[`pressureBar.${position}`]) ?? toNum(data[`pressure.${position}`]);
  return flat;
}

export function readDimensionForPosition(
  data: Record<string, unknown>,
  position: TirePosition,
): string | null {
  const dimensions = readNestedRecord(data, 'dimension');
  if (dimensions) {
    const value = toStr(dimensions[position]);
    if (value) return value;
  }
  if (position === 'fl' || position === 'fr') {
    return toStr(data.tireSize) ?? toStr(data.dimensionFront);
  }
  if (position === 'rl' || position === 'rr') {
    return toStr(data.tireSizeRear) ?? toStr(data.dimensionRear) ?? toStr(data.tireSize);
  }
  return null;
}

export function readDotForPosition(
  data: Record<string, unknown>,
  position: TirePosition,
): string | null {
  const dots = readNestedRecord(data, 'dotByPosition');
  if (dots) {
    const value = toStr(dots[position]);
    if (value) return value;
  }
  if (position === 'fl' || position === 'fr') {
    return toStr(data.dot) ?? toStr(data.dotFront);
  }
  return toStr(data.dotRear) ?? toStr(data.dot);
}

export function readStatedTirePositions(data: Record<string, unknown>): TirePosition[] {
  const positions = new Set<TirePosition>();
  for (const position of TIRE_POSITIONS) {
    const hasTread = readTreadDepthForPosition(data, position) != null;
    const hasPressure = readPressureForPosition(data, position) != null;
    const hasDimension = readDimensionForPosition(data, position) != null;
    const hasDot = readDotForPosition(data, position) != null;
    if (hasTread || hasPressure || hasDimension || hasDot) {
      positions.add(position);
    }
  }
  return TIRE_POSITIONS.filter((position) => positions.has(position));
}

export function hasExplicitMeasurementDate(data: Record<string, unknown>): boolean {
  return readMeasurementDate(data) != null;
}

export function hasStatedTreadMeasurements(data: Record<string, unknown>): boolean {
  return readStatedTirePositions(data).some(
    (position) => readTreadDepthForPosition(data, position) != null,
  );
}

export function hasPressureWithoutUnit(data: Record<string, unknown>): boolean {
  const hasPressure = readStatedTirePositions(data).some(
    (position) => readPressureForPosition(data, position) != null,
  );
  return hasPressure && readPressureUnit(data) == null;
}

export function hasTreadWithoutUnit(data: Record<string, unknown>): boolean {
  const hasTread = hasStatedTreadMeasurements(data);
  return hasTread && readTreadDepthUnit(data) == null;
}

export function buildTirePositionMeasurements(
  data: Record<string, unknown>,
): TirePositionMeasurement[] {
  return readStatedTirePositions(data).map((position) => ({
    position,
    treadDepthMm: readTreadDepthForPosition(data, position),
    pressureBar: readPressureForPosition(data, position),
    dimension: readDimensionForPosition(data, position),
    dot: readDotForPosition(data, position),
  }));
}

export function buildTireMeasurementApplyPayload(
  data: Record<string, unknown>,
): TireMeasurementApplyPayload | null {
  const measurementDate = toDate(readMeasurementDate(data));
  const treadDepthUnit = readTreadDepthUnit(data);
  const positions = buildTirePositionMeasurements(data);
  const hasTread = positions.some((row) => row.treadDepthMm != null);

  if (!measurementDate || !treadDepthUnit || !hasTread || positions.length === 0) {
    return null;
  }

  return {
    measurementDate,
    treadDepthUnit,
    pressureUnit: readPressureUnit(data),
    odometerKm: toNum(data.odometerKm),
    workshopName: toStr(data.workshopName),
    positions,
  };
}

export function collectTirePlausibilityChecks(
  fields: Record<string, unknown>,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];
  const statedPositions = readStatedTirePositions(fields);

  if (!hasExplicitMeasurementDate(fields) && hasStatedTreadMeasurements(fields)) {
    checks.push({
      code: 'TIRE_MISSING_MEASUREMENT_DATE',
      status: 'WARNING',
      message: 'Measurement date is missing — tread measurements cannot auto-apply.',
      source: 'DOCUMENT',
    });
  }

  if (hasTreadWithoutUnit(fields)) {
    checks.push({
      code: 'TIRE_MISSING_TREAD_UNIT',
      status: 'BLOCKER',
      message: 'Tread depth unit must be explicit (mm) when measurements are present.',
      source: 'DOCUMENT',
    });
  }

  if (hasPressureWithoutUnit(fields)) {
    checks.push({
      code: 'TIRE_MISSING_PRESSURE_UNIT',
      status: 'BLOCKER',
      message: 'Pressure unit must be explicit (bar, psi, or kPa) when pressure values are present.',
      source: 'DOCUMENT',
    });
  }

  if (hasStatedTreadMeasurements(fields) && statedPositions.length === 0) {
    checks.push({
      code: 'TIRE_POSITION_NOT_STATED',
      status: 'BLOCKER',
      message: 'Tire position must be stated — positions are never invented.',
      source: 'DOCUMENT',
    });
  }

  for (const position of statedPositions) {
    const tread = readTreadDepthForPosition(fields, position);
    if (tread != null && tread < 0) {
      checks.push({
        code: `TIRE_TREAD_NEGATIVE_${position.toUpperCase()}`,
        status: 'BLOCKER',
        message: `Tread depth (${position.toUpperCase()}) is negative.`,
        source: 'DOCUMENT',
      });
    } else if (tread != null && tread > TIRE_TREAD_MM_MAX) {
      checks.push({
        code: `TIRE_TREAD_IMPLAUSIBLE_${position.toUpperCase()}`,
        status: 'WARNING',
        message: `Tread depth ${position.toUpperCase()} (${tread} mm) is unrealistically high.`,
        source: 'DOCUMENT',
      });
    }

    const pressure = readPressureForPosition(fields, position);
    const unit = readPressureUnit(fields);
    if (pressure != null && unit === 'bar') {
      if (pressure < TIRE_PRESSURE_BAR_MIN || pressure > TIRE_PRESSURE_BAR_MAX) {
        checks.push({
          code: `TIRE_PRESSURE_RANGE_${position.toUpperCase()}`,
          status: 'WARNING',
          message: `Pressure ${position.toUpperCase()} (${pressure} bar) is outside the plausible ${TIRE_PRESSURE_BAR_MIN}–${TIRE_PRESSURE_BAR_MAX} bar range.`,
          source: 'DOCUMENT',
        });
      }
    }
  }

  return checks;
}

export function assessTireApplyGate(input: {
  fields: Record<string, unknown>;
}): TireApplyGateResult {
  const blockers: TireApplyGateBlocker[] = [];

  const plausibilityBlockers = collectTirePlausibilityChecks(input.fields).filter(
    (check) => check.status === 'BLOCKER',
  );
  for (const check of plausibilityBlockers) {
    blockers.push({ code: check.code, message: check.message });
  }

  if (!hasExplicitMeasurementDate(input.fields)) {
    blockers.push({
      code: 'TIRE_MEASUREMENT_DATE_REQUIRED',
      message: 'Measurement date is required before tire measurements can be applied.',
      fieldKeys: ['measurementDate', 'eventDate'],
    });
  }

  if (!buildTireMeasurementApplyPayload(input.fields)) {
    blockers.push({
      code: 'TIRE_PAYLOAD_INCOMPLETE',
      message:
        'Tire apply payload is incomplete — stated positions, tread unit, and measurement date are required.',
      fieldKeys: ['treadDepthMm', 'treadDepthUnit', 'measurementDate'],
    });
  }

  return {
    canApply: blockers.length === 0,
    canArchive: true,
    blockers,
  };
}
