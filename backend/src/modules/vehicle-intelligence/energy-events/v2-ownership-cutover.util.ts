import { PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV } from '@config/physical-refuel-reconciliation.config';
import { getFuelStationEnrichmentCutoverAt } from '@config/fuel-station-enrichment.config';

/** Effective V2 ownership cutover — explicit env first, then legacy fuel enrichment cutover. */
export function resolveEffectiveV2OwnershipCutoverAt(
  env: NodeJS.ProcessEnv = process.env,
): Date | null {
  const raw = env[PHYSICAL_REFUEL_RECONCILIATION_V2_CUTOVER_AT_ENV];
  if (raw != null && raw.trim() !== '') {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return getFuelStationEnrichmentCutoverAt();
}
