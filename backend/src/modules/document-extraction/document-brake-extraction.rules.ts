import type { PlausibilityCheck } from './document-extraction-plausibility.service';

export const BRAKE_SERVICE_KINDS = [
  'inspection_only',
  'pads_service',
  'discs_service',
  'brake_fluid_service',
  'full_brake_service',
] as const;

export type BrakeServiceKind = (typeof BRAKE_SERVICE_KINDS)[number];

export const BRAKE_SCOPE_VALUES = [
  'front_pads',
  'rear_pads',
  'front_discs',
  'rear_discs',
] as const;

export type BrakeScopeValue = (typeof BRAKE_SCOPE_VALUES)[number];

export const BRAKE_AXLES = ['front', 'rear'] as const;

export type BrakeAxleLabel = (typeof BRAKE_AXLES)[number];

export const BRAKE_THICKNESS_UNIT = 'mm' as const;

export const BRAKE_PAD_MM_MAX = 25;
export const BRAKE_DISC_MM_MAX = 50;
export const BRAKE_PAD_MM_MIN = 0;
export const BRAKE_DISC_MM_MIN = 0;

export type BrakeApplyGateBlocker = {
  code: string;
  message: string;
  fieldKeys?: string[];
};

export type BrakeApplyGateResult = {
  canApply: boolean;
  canArchive: boolean;
  blockers: BrakeApplyGateBlocker[];
};

export type BrakeAxleMeasurement = {
  axle: BrakeAxleLabel;
  padMm: number | null;
  discMm: number | null;
  minimumPadMm: number | null;
  minimumDiscMm: number | null;
};

export type BrakeApplyPayload = {
  measurementDate: Date;
  serviceKind: BrakeServiceKind | null;
  scope: BrakeScopeValue[];
  thicknessUnit: typeof BRAKE_THICKNESS_UNIT;
  odometerKm: number | null;
  workshopName: string | null;
  workshopFinding: string | null;
  notes: string | null;
  axles: BrakeAxleMeasurement[];
  discCondition: string | null;
  brakeFluidStatus: string | null;
  immediateReplacement: boolean | null;
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

function toBoolean(raw: unknown): boolean | null {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (['yes', 'true', 'ja', '1', 'sofort'].includes(v)) return true;
    if (['no', 'false', 'nein', '0'].includes(v)) return false;
  }
  return null;
}

export function readMeasurementDate(data: Record<string, unknown>): string | null {
  return toStr(data.measurementDate) ?? toStr(data.eventDate) ?? toStr(data.serviceDate);
}

export function readThicknessUnit(data: Record<string, unknown>): typeof BRAKE_THICKNESS_UNIT | null {
  const raw = toStr(data.padThicknessUnit) ?? toStr(data.discThicknessUnit) ?? toStr(data.thicknessUnit);
  if (!raw) return null;
  return raw.toLowerCase() === 'mm' ? BRAKE_THICKNESS_UNIT : null;
}

export function readServiceKind(data: Record<string, unknown>): BrakeServiceKind | null {
  const raw = toStr(data.serviceKind)?.toLowerCase();
  if (!raw) return null;
  return (BRAKE_SERVICE_KINDS as readonly string[]).includes(raw)
    ? (raw as BrakeServiceKind)
    : null;
}

export function readStatedScope(data: Record<string, unknown>): BrakeScopeValue[] {
  const rawScope = Array.isArray(data.scope)
    ? data.scope
    : Array.isArray(data.serviceScope)
      ? data.serviceScope
      : typeof data.scopeCsv === 'string'
        ? data.scopeCsv.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];

  return rawScope.filter(
    (value: unknown): value is BrakeScopeValue =>
      value === 'front_pads' ||
      value === 'rear_pads' ||
      value === 'front_discs' ||
      value === 'rear_discs',
  );
}

export function readPadMmForAxle(data: Record<string, unknown>, axle: BrakeAxleLabel): number | null {
  const measured = (data.measured && typeof data.measured === 'object'
    ? data.measured
    : {}) as Record<string, unknown>;
  if (axle === 'front') {
    return toNum(data.frontPadMm ?? measured.frontPadMm);
  }
  return toNum(data.rearPadMm ?? measured.rearPadMm);
}

export function readDiscMmForAxle(data: Record<string, unknown>, axle: BrakeAxleLabel): number | null {
  const measured = (data.measured && typeof data.measured === 'object'
    ? data.measured
    : {}) as Record<string, unknown>;
  if (axle === 'front') {
    return toNum(data.frontDiscMm ?? data.frontRotorWidthMm ?? measured.frontDiscMm);
  }
  return toNum(data.rearDiscMm ?? data.rearRotorWidthMm ?? measured.rearDiscMm);
}

export function readMinimumPadMmForAxle(
  data: Record<string, unknown>,
  axle: BrakeAxleLabel,
): number | null {
  if (axle === 'front') {
    return toNum(data.minimumPadMmFront) ?? toNum(data.minimumPadMm);
  }
  return toNum(data.minimumPadMmRear) ?? toNum(data.minimumPadMm);
}

export function readMinimumDiscMmForAxle(
  data: Record<string, unknown>,
  axle: BrakeAxleLabel,
): number | null {
  if (axle === 'front') {
    return toNum(data.minimumDiscMmFront) ?? toNum(data.minimumDiscMm);
  }
  return toNum(data.minimumDiscMmRear) ?? toNum(data.minimumDiscMm);
}

export function readWorkshopFinding(data: Record<string, unknown>): string | null {
  return (
    toStr(data.workshopFinding) ??
    toStr(data.workshopReport) ??
    toStr(data.description) ??
    toStr(data.notes)
  );
}

export function readStatedBrakeAxles(data: Record<string, unknown>): BrakeAxleLabel[] {
  const axles = new Set<BrakeAxleLabel>();
  const scope = readStatedScope(data);

  for (const item of scope) {
    if (item.startsWith('front_')) axles.add('front');
    if (item.startsWith('rear_')) axles.add('rear');
  }

  if (readPadMmForAxle(data, 'front') != null || readDiscMmForAxle(data, 'front') != null) {
    axles.add('front');
  }
  if (readPadMmForAxle(data, 'rear') != null || readDiscMmForAxle(data, 'rear') != null) {
    axles.add('rear');
  }

  return BRAKE_AXLES.filter((axle) => axles.has(axle));
}

export function hasExplicitMeasurementDate(data: Record<string, unknown>): boolean {
  return readMeasurementDate(data) != null;
}

export function hasThicknessWithoutUnit(data: Record<string, unknown>): boolean {
  const hasThickness = readStatedBrakeAxles(data).some((axle) => {
    return (
      readPadMmForAxle(data, axle) != null ||
      readDiscMmForAxle(data, axle) != null ||
      readMinimumPadMmForAxle(data, axle) != null ||
      readMinimumDiscMmForAxle(data, axle) != null
    );
  });
  return hasThickness && readThicknessUnit(data) == null;
}

export function hasMeasurementWithoutStatedAxle(data: Record<string, unknown>): boolean {
  const frontMeasured =
    readPadMmForAxle(data, 'front') != null || readDiscMmForAxle(data, 'front') != null;
  const rearMeasured =
    readPadMmForAxle(data, 'rear') != null || readDiscMmForAxle(data, 'rear') != null;
  const statedAxles = readStatedBrakeAxles(data);
  if (frontMeasured && !statedAxles.includes('front')) return true;
  if (rearMeasured && !statedAxles.includes('rear')) return true;
  return false;
}

export function buildBrakeAxleMeasurements(data: Record<string, unknown>): BrakeAxleMeasurement[] {
  return readStatedBrakeAxles(data).map((axle) => ({
    axle,
    padMm: readPadMmForAxle(data, axle),
    discMm: readDiscMmForAxle(data, axle),
    minimumPadMm: readMinimumPadMmForAxle(data, axle),
    minimumDiscMm: readMinimumDiscMmForAxle(data, axle),
  }));
}

export function buildBrakeApplyPayload(data: Record<string, unknown>): BrakeApplyPayload | null {
  const measurementDate = toDate(readMeasurementDate(data));
  const thicknessUnit = readThicknessUnit(data);
  const axles = buildBrakeAxleMeasurements(data);
  const hasMeasurement = axles.some(
    (row) => row.padMm != null || row.discMm != null,
  );

  if (!measurementDate || !thicknessUnit || !hasMeasurement || axles.length === 0) {
    return null;
  }

  return {
    measurementDate,
    serviceKind: readServiceKind(data),
    scope: readStatedScope(data),
    thicknessUnit,
    odometerKm: toNum(data.odometerKm),
    workshopName: toStr(data.workshopName),
    workshopFinding: readWorkshopFinding(data),
    notes: toStr(data.notes) ?? toStr(data.description),
    axles,
    discCondition: toStr(data.discCondition) ?? toStr(data.brakeDiscCondition),
    brakeFluidStatus: toStr(data.brakeFluidStatus) ?? toStr(data.brakeFluid),
    immediateReplacement: toBoolean(data.immediateReplacement ?? data.replaceNow),
  };
}

export function collectBrakePlausibilityChecks(
  fields: Record<string, unknown>,
): PlausibilityCheck[] {
  const checks: PlausibilityCheck[] = [];

  if (!hasExplicitMeasurementDate(fields) && readStatedBrakeAxles(fields).length > 0) {
    checks.push({
      code: 'BRAKE_MISSING_MEASUREMENT_DATE',
      status: 'WARNING',
      message: 'Measurement date is missing — brake measurements cannot auto-apply.',
      source: 'DOCUMENT',
    });
  }

  if (hasThicknessWithoutUnit(fields)) {
    checks.push({
      code: 'BRAKE_MISSING_THICKNESS_UNIT',
      status: 'BLOCKER',
      message: 'Pad/disc thickness unit must be explicit (mm) when measurements are present.',
      source: 'DOCUMENT',
    });
  }

  if (hasMeasurementWithoutStatedAxle(fields)) {
    checks.push({
      code: 'BRAKE_AXLE_NOT_STATED',
      status: 'BLOCKER',
      message: 'Brake axle/position must be stated — axles are never invented.',
      source: 'DOCUMENT',
    });
  }

  for (const axle of readStatedBrakeAxles(fields)) {
    const pad = readPadMmForAxle(fields, axle);
    const disc = readDiscMmForAxle(fields, axle);
    const minPad = readMinimumPadMmForAxle(fields, axle);
    const minDisc = readMinimumDiscMmForAxle(fields, axle);

    if (pad != null && (pad < BRAKE_PAD_MM_MIN || pad > BRAKE_PAD_MM_MAX)) {
      checks.push({
        code: `BRAKE_PAD_RANGE_${axle.toUpperCase()}`,
        status: 'WARNING',
        message: `${axle} pad thickness (${pad} mm) is outside the plausible 0–${BRAKE_PAD_MM_MAX} mm range.`,
        source: 'DOCUMENT',
      });
    }

    if (disc != null && (disc < BRAKE_DISC_MM_MIN || disc > BRAKE_DISC_MM_MAX)) {
      checks.push({
        code: `BRAKE_DISC_RANGE_${axle.toUpperCase()}`,
        status: 'WARNING',
        message: `${axle} disc thickness (${disc} mm) is outside the plausible 0–${BRAKE_DISC_MM_MAX} mm range.`,
        source: 'DOCUMENT',
      });
    }

    if (pad != null && minPad != null && pad < minPad) {
      checks.push({
        code: `BRAKE_PAD_BELOW_MINIMUM_${axle.toUpperCase()}`,
        status: 'WARNING',
        message: `${axle} pad thickness (${pad} mm) is below stated minimum (${minPad} mm).`,
        source: 'DOCUMENT',
      });
    }

    if (disc != null && minDisc != null && disc < minDisc) {
      checks.push({
        code: `BRAKE_DISC_BELOW_MINIMUM_${axle.toUpperCase()}`,
        status: 'WARNING',
        message: `${axle} disc thickness (${disc} mm) is below stated minimum (${minDisc} mm).`,
        source: 'DOCUMENT',
      });
    }
  }

  return checks;
}

export function assessBrakeApplyGate(input: {
  fields: Record<string, unknown>;
}): BrakeApplyGateResult {
  const blockers: BrakeApplyGateBlocker[] = [];

  const plausibilityBlockers = collectBrakePlausibilityChecks(input.fields).filter(
    (check) => check.status === 'BLOCKER',
  );
  for (const check of plausibilityBlockers) {
    blockers.push({ code: check.code, message: check.message });
  }

  if (!hasExplicitMeasurementDate(input.fields)) {
    blockers.push({
      code: 'BRAKE_MEASUREMENT_DATE_REQUIRED',
      message: 'Measurement date is required before brake measurements can be applied.',
      fieldKeys: ['measurementDate', 'eventDate'],
    });
  }

  if (!buildBrakeApplyPayload(input.fields)) {
    blockers.push({
      code: 'BRAKE_PAYLOAD_INCOMPLETE',
      message:
        'Brake apply payload is incomplete — stated axle measurements, thickness unit, and measurement date are required.',
      fieldKeys: ['frontPadMm', 'rearPadMm', 'padThicknessUnit', 'measurementDate'],
    });
  }

  return {
    canApply: blockers.length === 0,
    canArchive: true,
    blockers,
  };
}
