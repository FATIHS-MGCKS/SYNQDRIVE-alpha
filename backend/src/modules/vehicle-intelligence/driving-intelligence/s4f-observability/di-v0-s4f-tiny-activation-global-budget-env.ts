import type { DiV0S4fProviderGlobalBudgetEnabledEvidence } from './di-v0-s4f-activation-evidence';

/**
 * Classifies a **supplied raw config value** (e.g. from a deployment env file line).
 *
 * Does NOT apply DimoProviderBudgetConfig parseBool(..., true) — missing must be UNKNOWN.
 * Does NOT prove Production PM2 replicas loaded that value after bootstrap; pair with
 * `DiV0S4fGlobalBudgetActiveRuntimeState` via `resolveTinyActivationProviderGlobalBudgetEvidence`.
 */
export function classifyDiV0S4fTinyActivationGlobalBudgetEnv(
  raw: string | undefined,
): DiV0S4fProviderGlobalBudgetEnabledEvidence {
  if (raw === undefined || raw.trim() === '') return 'UNKNOWN';
  const normalized = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return 'ENABLED';
  if (['0', 'false', 'no', 'off'].includes(normalized)) return 'DISABLED';
  return 'UNKNOWN';
}
