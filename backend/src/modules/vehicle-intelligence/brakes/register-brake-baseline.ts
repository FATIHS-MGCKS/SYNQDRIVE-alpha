import { BRAKE_HEALTH_CONFIG } from './brake-health.config';
import {
  BRAKE_REFERENCE_SPEC_PLAUSIBILITY,
  validateLegacyRotorWidthPlausibility,
  validateThicknessPlausibility,
} from './brake-reference-spec.domain';

export type RegistrationBrakeCondition = 'NEW' | 'USED' | 'UNKNOWN';

/** Brake payload accepted by register-from-dimo manualSpecs.brakes. */
export interface RegistrationBrakeManualSpec {
  condition?: RegistrationBrakeCondition | string | null;
  serviceDate?: string | null;
  odometerKm?: number | null;
  frontRotorDiameter?: number | null;
  frontRotorWidth?: number | null;
  frontPadThickness?: number | null;
  frontPadNominalThicknessMm?: number | null;
  rearRotorDiameter?: number | null;
  rearRotorWidth?: number | null;
  rearPadThickness?: number | null;
  rearPadNominalThicknessMm?: number | null;
  frontDiscNominalThicknessMm?: number | null;
  rearDiscNominalThicknessMm?: number | null;
  source?: string | null;
  sourceUrl?: string | null;
  sourcePartNumber?: string | null;
  sourceProvider?: string | null;
  sourceConfidence?: number | null;
  userConfirmedAt?: string | null;
  userConfirmedBy?: string | null;
}

const NUMERIC_BRAKE_FIELDS = [
  'frontRotorDiameter',
  'frontRotorWidth',
  'frontPadThickness',
  'frontPadNominalThicknessMm',
  'rearRotorDiameter',
  'rearRotorWidth',
  'rearPadThickness',
  'rearPadNominalThicknessMm',
  'frontDiscNominalThicknessMm',
  'rearDiscNominalThicknessMm',
] as const satisfies ReadonlyArray<keyof RegistrationBrakeManualSpec>;

const ODO_MAX = 5_000_000;

export interface RegistrationBrakeValidationResult {
  valid: boolean;
  errors: string[];
}

function checkPositiveMm(
  errors: string[],
  label: string,
  value: unknown,
  max: number,
): void {
  if (value == null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push(`${label} must be a positive number`);
    return;
  }
  if (value > max) {
    errors.push(`${label} exceeds plausible maximum (${max} mm)`);
  }
}

function checkOdometer(errors: string[], value: unknown): void {
  if (value == null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    errors.push('odometerKm must be a non-negative number');
    return;
  }
  if (value > ODO_MAX) {
    errors.push(`odometerKm exceeds plausible maximum (${ODO_MAX} km)`);
  }
}

/** Server-side plausibility checks for registration brake payloads. */
export function validateRegistrationBrakeInput(
  brakes: RegistrationBrakeManualSpec,
): RegistrationBrakeValidationResult {
  const errors: string[] = [];

  checkPositiveMm(errors, 'frontPadThickness', brakes.frontPadThickness, BRAKE_REFERENCE_SPEC_PLAUSIBILITY.pad.maxMm);
  checkPositiveMm(errors, 'rearPadThickness', brakes.rearPadThickness, BRAKE_REFERENCE_SPEC_PLAUSIBILITY.pad.maxMm);
  checkPositiveMm(
    errors,
    'frontPadNominalThicknessMm',
    brakes.frontPadNominalThicknessMm,
    BRAKE_REFERENCE_SPEC_PLAUSIBILITY.pad.maxMm,
  );
  checkPositiveMm(
    errors,
    'rearPadNominalThicknessMm',
    brakes.rearPadNominalThicknessMm,
    BRAKE_REFERENCE_SPEC_PLAUSIBILITY.pad.maxMm,
  );
  if (brakes.frontDiscNominalThicknessMm != null) {
    const disc = validateThicknessPlausibility('FRONT_DISCS', brakes.frontDiscNominalThicknessMm);
    if (!disc.valid) errors.push(...disc.errors);
  }
  if (brakes.rearDiscNominalThicknessMm != null) {
    const disc = validateThicknessPlausibility('REAR_DISCS', brakes.rearDiscNominalThicknessMm);
    if (!disc.valid) errors.push(...disc.errors);
  }
  if (brakes.frontRotorWidth != null) {
    const rotor = validateLegacyRotorWidthPlausibility('front', brakes.frontRotorWidth);
    if (!rotor.valid) errors.push(...rotor.errors);
  }
  if (brakes.rearRotorWidth != null) {
    const rotor = validateLegacyRotorWidthPlausibility('rear', brakes.rearRotorWidth);
    if (!rotor.valid) errors.push(...rotor.errors);
  }
  checkPositiveMm(
    errors,
    'frontRotorDiameter',
    brakes.frontRotorDiameter,
    BRAKE_REFERENCE_SPEC_PLAUSIBILITY.rotorDiameter.maxMm,
  );
  checkPositiveMm(
    errors,
    'rearRotorDiameter',
    brakes.rearRotorDiameter,
    BRAKE_REFERENCE_SPEC_PLAUSIBILITY.rotorDiameter.maxMm,
  );
  checkOdometer(errors, brakes.odometerKm);

  if (brakes.serviceDate != null && String(brakes.serviceDate).trim() !== '') {
    const parsed = new Date(brakes.serviceDate);
    if (Number.isNaN(parsed.getTime())) {
      errors.push('serviceDate must be a valid ISO-8601 date');
    }
  }

  return { valid: errors.length === 0, errors };
}

function toPositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function toOdometerKm(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value);
}

export function normalizeRegistrationBrakeCondition(
  value: RegistrationBrakeManualSpec['condition'],
): RegistrationBrakeCondition {
  const key = String(value ?? 'UNKNOWN')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (key === 'NEW' || key === 'NEW_INSTALLED' || key === 'NEW_DELIVERED') return 'NEW';
  if (key === 'USED' || key === 'ALREADY_MOUNTED' || key === 'EXISTING') return 'USED';
  return 'UNKNOWN';
}

export function hasRegistrationBrakeMeasurements(brakes: RegistrationBrakeManualSpec): boolean {
  return (
    toPositiveNumber(brakes.frontPadThickness) != null ||
    toPositiveNumber(brakes.frontPadNominalThicknessMm) != null ||
    toPositiveNumber(brakes.rearPadThickness) != null ||
    toPositiveNumber(brakes.rearPadNominalThicknessMm) != null ||
    toPositiveNumber(brakes.frontDiscNominalThicknessMm) != null ||
    toPositiveNumber(brakes.rearDiscNominalThicknessMm) != null
  );
}

export function hasRegistrationBrakeSpecValues(brakes: RegistrationBrakeManualSpec): boolean {
  return NUMERIC_BRAKE_FIELDS.some((field) => toPositiveNumber(brakes[field]) != null);
}

export function shouldInitializeBrakesFromRegistration(brakes: RegistrationBrakeManualSpec): boolean {
  const condition = normalizeRegistrationBrakeCondition(brakes.condition);
  if (condition === 'NEW') return true;
  return hasRegistrationBrakeMeasurements(brakes) || hasRegistrationBrakeSpecValues(brakes);
}

/**
 * For declared-new brakes without measured pad thickness, apply documented
 * nominal defaults so the canonical initializer can anchor ESTIMATED (not MEASURED).
 */
export function applyNewBrakeDefaults(
  brakes: RegistrationBrakeManualSpec,
  condition: RegistrationBrakeCondition = normalizeRegistrationBrakeCondition(brakes.condition),
): RegistrationBrakeManualSpec {
  if (condition !== 'NEW') return brakes;
  const defaultPad = BRAKE_HEALTH_CONFIG.registration.defaultNewPadThicknessMm;
  return {
    ...brakes,
    frontPadThickness: toPositiveNumber(brakes.frontPadThickness) ?? defaultPad,
    rearPadThickness: toPositiveNumber(brakes.rearPadThickness) ?? defaultPad,
  };
}

export function resolveRegistrationBrakeOdometerKm(input: {
  brakesOdometerKm?: number | null;
  registrationMileageKm?: number | null;
  latestStateOdometerKm?: number | null;
  condition?: RegistrationBrakeCondition;
}): number | null {
  const fromBrakes = toOdometerKm(input.brakesOdometerKm);
  if (fromBrakes != null) return fromBrakes;

  const fromRegistration = toOdometerKm(input.registrationMileageKm);
  if (fromRegistration != null) return fromRegistration;

  const fromState = toOdometerKm(input.latestStateOdometerKm);
  if (fromState != null) return fromState;

  if (input.condition === 'NEW') return 0;
  return null;
}

export function registrationBrakeMeasuredSnapshot(
  brakes: RegistrationBrakeManualSpec,
): {
  frontPadMm?: number;
  rearPadMm?: number;
  frontDiscMm?: number;
  rearDiscMm?: number;
} | undefined {
  const frontPadMm =
    toPositiveNumber(brakes.frontPadNominalThicknessMm) ??
    toPositiveNumber(brakes.frontPadThickness);
  const rearPadMm =
    toPositiveNumber(brakes.rearPadNominalThicknessMm) ??
    toPositiveNumber(brakes.rearPadThickness);
  const frontDiscMm = toPositiveNumber(brakes.frontDiscNominalThicknessMm);
  const rearDiscMm = toPositiveNumber(brakes.rearDiscNominalThicknessMm);
  if (frontPadMm == null && rearPadMm == null && frontDiscMm == null && rearDiscMm == null) {
    return undefined;
  }
  return {
    ...(frontPadMm != null ? { frontPadMm } : {}),
    ...(rearPadMm != null ? { rearPadMm } : {}),
    ...(frontDiscMm != null ? { frontDiscMm } : {}),
    ...(rearDiscMm != null ? { rearDiscMm } : {}),
  };
}
