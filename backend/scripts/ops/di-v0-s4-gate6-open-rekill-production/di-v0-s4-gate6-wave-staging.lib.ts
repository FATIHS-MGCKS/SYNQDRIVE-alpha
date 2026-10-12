/**
 * Gate-6-only wave-aware staging key contract.
 * Does not replace assertStagingKeysPresentAndPinned (five-flag / tiny-staging mutations).
 */
import { DI_V0_S4_ENV_ALLOWLISTS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
  parseCanonicalUtcNotBefore,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';
import { STAGING_PRESERVE_KEYS } from '../di-v0-s4-five-flag-tiny-activation-production/di-v0-s4-five-flag-tiny-activation-production.lib';
import { OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-frozen-not-before';
import {
  classifyStagingKeySemanticState,
  countEnvKeyOccurrences,
} from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production.lib';
import { envMapFromFileContent } from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';
import { evaluateRolloutWaveAllowlists, type RolloutWave } from './di-v0-s4-fleet-rollout.lib';

export function assertGate6WaveStagingKeysPresentAndPinned(
  content: string,
  wave: RolloutWave,
): { ok: boolean; failures: string[]; notBefore?: string } {
  const failures: string[] = [];

  for (const key of STAGING_PRESERVE_KEYS) {
    const state = classifyStagingKeySemanticState(content, key);
    if (state === 'MISSING') failures.push(`STAGING_${key}_MISSING`);
    else if (state === 'EMPTY') failures.push(`STAGING_${key}_EMPTY`);
    const occurrences = countEnvKeyOccurrences(content, key);
    if (occurrences > 1) failures.push(`STAGING_${key}_DUPLICATE`);
  }

  const map = envMapFromFileContent(content);
  const nb = map[OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV] ?? '';
  const org = map[DI_V0_S4_ENV_ALLOWLISTS.organization] ?? '';
  const veh = map[DI_V0_S4_ENV_ALLOWLISTS.vehicle] ?? '';

  if (!parseCanonicalUtcNotBefore(nb).ok) failures.push('NOT_BEFORE_INVALID');
  if (org !== CANONICAL_TINY_ORGANIZATION_ID) failures.push('ORG_MISMATCH');

  if (wave === 1) {
    if (veh !== CANONICAL_TINY_VEHICLE_ID) failures.push('VEH_MISMATCH');
  } else {
    const rollout = evaluateRolloutWaveAllowlists(map, wave);
    if (!rollout.ok) failures.push(...rollout.failures);
  }

  return { ok: failures.length === 0, failures, notBefore: nb };
}
