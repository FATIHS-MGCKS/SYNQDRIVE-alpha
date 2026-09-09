/**
 * EXP-021 autonomous orchestrator — testable helpers (policy gate, lock, fatal cleanup).
 */
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { assertHfCalibrationPhaseActivationAllowed } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-calibration-phase.policy';
import { parseAcquisitionState } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import type { HfRecoveryPolicyV2Config } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-recovery-v2.policy';
import {
  parseHfRecoveryPolicyV2ConfigFromEnv,
  resolveHfRecoveryPolicyForToken,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-recovery-v2.policy';

export const EXP021_ORCHESTRATOR_LOCK_KEY_PREFIX = 'exp021:autonomous-orchestrator:lock';
export const EXP021_ORCHESTRATOR_LOCK_TTL_MS = 4 * 60 * 60 * 1000;

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export interface OrchestratorLockHandle {
  key: string;
  token: string;
}

export type OrchestratorLockAcquireResult =
  | { acquired: true; handle: OrchestratorLockHandle }
  | { acquired: false; reason: 'contended' | 'redis_unavailable' };

export interface EffectivePolicyGateResult {
  allowed: boolean;
  effectiveMode: 'V2' | 'LEGACY';
  blocker?: string;
}

export type FatalSessionCleanupMode = 'abort' | 'stop';

export function buildOrchestratorLockKey(organizationId: string, vehicleId: string): string {
  return `${EXP021_ORCHESTRATOR_LOCK_KEY_PREFIX}:${organizationId}:${vehicleId}`;
}

export async function acquireOrchestratorLock(
  redis: Pick<Redis, 'set'>,
  key: string,
  ttlMs: number = EXP021_ORCHESTRATOR_LOCK_TTL_MS,
): Promise<OrchestratorLockAcquireResult> {
  const token = randomUUID();
  try {
    const result = await redis.set(key, token, 'PX', ttlMs, 'NX');
    if (result === 'OK') {
      return { acquired: true, handle: { key, token } };
    }
    return { acquired: false, reason: 'contended' };
  } catch {
    return { acquired: false, reason: 'redis_unavailable' };
  }
}

export async function releaseOrchestratorLock(
  redis: Pick<Redis, 'eval'>,
  handle: OrchestratorLockHandle,
): Promise<boolean> {
  try {
    const released = await redis.eval(RELEASE_SCRIPT, 1, handle.key, handle.token);
    return released === 1;
  } catch {
    return false;
  }
}

export async function extendOrchestratorLock(
  redis: Pick<Redis, 'eval'>,
  handle: OrchestratorLockHandle,
  ttlMs: number = EXP021_ORCHESTRATOR_LOCK_TTL_MS,
): Promise<boolean> {
  try {
    const extended = await redis.eval(EXTEND_SCRIPT, 1, handle.key, handle.token, String(ttlMs));
    return extended === 1;
  } catch {
    return false;
  }
}

export function evaluateEffectivePolicyGate(
  hfPolicyBase: HfRecoveryPolicyV2Config,
  tokenId: number,
): EffectivePolicyGateResult {
  const effective = resolveHfRecoveryPolicyForToken(hfPolicyBase, tokenId);
  try {
    assertHfCalibrationPhaseActivationAllowed(effective, hfPolicyBase);
    return { allowed: true, effectiveMode: 'V2' };
  } catch (error) {
    return {
      allowed: false,
      effectiveMode: effective.mode,
      blocker: error instanceof Error ? error.message : String(error),
    };
  }
}

export function evaluateEffectivePolicyGateFromEnv(
  env: NodeJS.ProcessEnv,
  tokenId: number,
): EffectivePolicyGateResult {
  const base = parseHfRecoveryPolicyV2ConfigFromEnv(env);
  return evaluateEffectivePolicyGate(base, tokenId);
}

/** Derive terminal cleanup path from current Reference Capture lifecycle semantics. */
export function resolveFatalSessionCleanupMode(
  acquisitionStateJson: unknown,
): FatalSessionCleanupMode {
  const state = parseAcquisitionState(acquisitionStateJson);
  const series = state.hfCalibrationSeries;
  if (!series) {
    return 'abort';
  }
  const hasScientificPhase =
    Boolean(series.activePhase) ||
    Boolean(series.pendingPhaseRequest) ||
    (Array.isArray(series.completedPhaseSummaries) && series.completedPhaseSummaries.length > 0);
  return hasScientificPhase ? 'stop' : 'abort';
}
