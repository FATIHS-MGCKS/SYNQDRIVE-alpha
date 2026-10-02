import { PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV } from '@config/physical-refuel-reconciliation.config';
import { FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV } from '@config/fuel-station-enrichment.config';

function parseOptionalIsoFromEnv(
  env: NodeJS.ProcessEnv,
  key: string,
): Date | null {
  const raw = env[key];
  if (raw == null || raw.trim() === '') return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Effective V2 ownership cutover — explicit env first, then legacy fuel enrichment cutover from the same env. */
export function resolveEffectiveV2OwnershipCutoverAt(
  env: NodeJS.ProcessEnv = process.env,
): Date | null {
  const explicit = parseOptionalIsoFromEnv(
    env,
    PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV,
  );
  if (explicit) return explicit;
  return parseOptionalIsoFromEnv(env, FUEL_STATION_ENRICHMENT_CUTOVER_AT_ENV);
}
