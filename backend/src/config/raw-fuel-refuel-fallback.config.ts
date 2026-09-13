import { registerAs } from '@nestjs/config';

/** Master raw scan/runtime gate — default false; F4-PR1 reader only (no production wiring). */
export const RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV = 'RAW_FUEL_REFUEL_FALLBACK_ENABLED';

/** F2 candidate staging gate only — MUST NEVER authorize VehicleEnergyEvent promotion. */
export const RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV =
  'RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED';

/**
 * Cutover instant preserved for F6+ rollout enforcement.
 * F4 does not discard delayed evidence using this value.
 */
export const RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV = 'RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT';

export interface RawFuelRefuelFallbackConfig {
  /** Master raw branch scan gate. Absent/malformed => false. */
  masterEnabled: boolean;
  /** F2 candidate persistence gate. Independent of master; never implies VEE promotion. */
  persistEnabled: boolean;
  /** Parsed ISO cutover instant when valid; null when absent or malformed. */
  cutoverAt: Date | null;
}

/**
 * Fail-closed boolean parser for RFRF flags.
 * Absent => false. Malformed => false (never implicit true).
 */
export function parseRawFuelRefuelFallbackBoolean(value: string | undefined): boolean {
  if (value == null || value.trim() === '') return false;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return false;
}

function parseOptionalIsoDate(value: string | undefined): Date | null {
  if (value == null || value.trim() === '') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function loadRawFuelRefuelFallbackConfig(
  env: NodeJS.ProcessEnv = process.env,
): RawFuelRefuelFallbackConfig {
  return {
    masterEnabled: parseRawFuelRefuelFallbackBoolean(
      env[RAW_FUEL_REFUEL_FALLBACK_ENABLED_ENV],
    ),
    persistEnabled: parseRawFuelRefuelFallbackBoolean(
      env[RAW_FUEL_REFUEL_FALLBACK_PERSIST_ENABLED_ENV],
    ),
    cutoverAt: parseOptionalIsoDate(env[RAW_FUEL_REFUEL_FALLBACK_CUTOVER_AT_ENV]),
  };
}

export default registerAs('rawFuelRefuelFallback', () => loadRawFuelRefuelFallbackConfig());

/** Convenience for unit tests and future F4-PR2 wiring. */
export function isRawFuelRefuelFallbackMasterEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return loadRawFuelRefuelFallbackConfig(env).masterEnabled;
}

export function isRawFuelRefuelFallbackPersistEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return loadRawFuelRefuelFallbackConfig(env).persistEnabled;
}

/**
 * Persist flag gates F2 staging only — never VehicleEnergyEvent promotion (F5 authority).
 * This helper exists to make the contract explicit in tests and future call sites.
 */
export function canRawRefuelFallbackAuthorizeVehicleEnergyEventPromotion(): false {
  return false;
}
