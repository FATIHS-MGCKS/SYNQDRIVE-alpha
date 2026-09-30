import type { DiV0S4fProviderGlobalBudgetEnabledEvidence } from './di-v0-s4f-activation-evidence';

/**
 * Tiny Activation gate evidence for DIMO_GLOBAL_BUDGET_ENABLED.
 * Does NOT apply DimoProviderBudgetConfig parseBool(..., true) — missing must be UNKNOWN.
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
