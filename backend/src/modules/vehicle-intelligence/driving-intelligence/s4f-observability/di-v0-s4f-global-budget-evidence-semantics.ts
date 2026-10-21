import type { DiV0S4fProviderGlobalBudgetEnabledEvidence } from './di-v0-s4f-activation-evidence';
import { classifyDiV0S4fTinyActivationGlobalBudgetEnv } from './di-v0-s4f-tiny-activation-global-budget-env';

/** Deployment config source file state (not active replica runtime). */
export type DiV0S4fGlobalBudgetConfigFileState =
  | 'EXPLICIT_ENABLED'
  | 'EXPLICIT_DISABLED'
  | 'MISSING'
  | 'MALFORMED'
  | 'UNREADABLE';

/** Active Production replica runtime state (post-bootstrap). */
export type DiV0S4fGlobalBudgetActiveRuntimeState =
  | 'CONFIRMED_ENABLED'
  | 'CONFIRMED_DISABLED'
  | 'UNVERIFIED';

export function classifyGlobalBudgetConfigFileStateFromRaw(
  raw: string | undefined,
  fileReadable: boolean,
): DiV0S4fGlobalBudgetConfigFileState {
  if (!fileReadable) return 'UNREADABLE';
  if (raw === undefined) return 'MISSING';
  const classified = classifyDiV0S4fTinyActivationGlobalBudgetEnv(raw);
  if (classified === 'ENABLED') return 'EXPLICIT_ENABLED';
  if (classified === 'DISABLED') return 'EXPLICIT_DISABLED';
  if (raw.trim() === '') return 'MISSING';
  return 'MALFORMED';
}

/**
 * Maps config-file + runtime evidence to frozen evaluator input.
 * ENABLED only when explicit config AND both replicas confirmed post-mutation bootstrap.
 */
export function resolveTinyActivationProviderGlobalBudgetEvidence(input: {
  configFileState: DiV0S4fGlobalBudgetConfigFileState;
  activeRuntimeState: DiV0S4fGlobalBudgetActiveRuntimeState;
}): DiV0S4fProviderGlobalBudgetEnabledEvidence {
  const { configFileState, activeRuntimeState } = input;
  if (configFileState === 'EXPLICIT_DISABLED') return 'DISABLED';
  if (configFileState !== 'EXPLICIT_ENABLED') return 'UNKNOWN';
  if (activeRuntimeState !== 'CONFIRMED_ENABLED') return 'UNKNOWN';
  return 'ENABLED';
}
