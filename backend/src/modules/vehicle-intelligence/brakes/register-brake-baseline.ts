import { BRAKE_HEALTH_CONFIG } from './brake-health.config';

export type RegistrationBrakeCondition = 'NEW' | 'USED' | 'UNKNOWN';

/** Brake payload accepted by register-from-dimo manualSpecs.brakes. */
export interface RegistrationBrakeManualSpec {
  condition?: RegistrationBrakeCondition | string | null;
  serviceDate?: string | null;
  odometerKm?: number | null;
  frontRotorDiameter?: number | null;
  frontRotorWidth?: number | null;
  frontPadThickness?: number | null;
  rearRotorDiameter?: number | null;
  rearRotorWidth?: number | null;
  rearPadThickness?: number | null;
  source?: string | null;
}

const NUMERIC_BRAKE_FIELDS = [
  'frontRotorDiameter',
  'frontRotorWidth',
  'frontPadThickness',
  'rearRotorDiameter',
  'rearRotorWidth',
  'rearPadThickness',
] as const satisfies ReadonlyArray<keyof RegistrationBrakeManualSpec>;

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
    toPositiveNumber(brakes.rearPadThickness) != null ||
    toPositiveNumber(brakes.frontRotorWidth) != null ||
    toPositiveNumber(brakes.rearRotorWidth) != null
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
  const frontPadMm = toPositiveNumber(brakes.frontPadThickness);
  const rearPadMm = toPositiveNumber(brakes.rearPadThickness);
  const frontDiscMm = toPositiveNumber(brakes.frontRotorWidth);
  const rearDiscMm = toPositiveNumber(brakes.rearRotorWidth);
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
