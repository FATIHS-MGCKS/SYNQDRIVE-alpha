/**
 * EXP-021 autonomous orchestrator — testable helpers (policy gate, lock, fatal cleanup).
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { assertHfCalibrationPhaseActivationAllowed } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-calibration-phase.policy';
import {
  buildPhaseAdvancementConfig,
  cadenceSequenceFromPlan,
  nominalTotalDurationMs,
  resolveExp021CalibrationPlan,
  type Exp021CalibrationPlan,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-exp021-calibration-plan.lib';
import { parseAcquisitionState } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-session.repository';
import type { HfRecoveryPolicyV2Config } from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-recovery-v2.policy';
import {
  parseHfRecoveryPolicyV2ConfigFromEnv,
  resolveHfRecoveryPolicyForToken,
} from '../../src/modules/vehicle-intelligence/reference-capture/reference-capture-hf-recovery-v2.policy';

export const EXP021_ORCHESTRATOR_LOCK_KEY_PREFIX = 'exp021:autonomous-orchestrator:lock';
export const EXP021_ORCHESTRATOR_LOCK_TTL_MS = 4 * 60 * 60 * 1000;
export const EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY = 'exp021AutonomousOrchestrator';

export function loadBackendEnvFile(envPath?: string): void {
  const resolved = envPath ?? process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  for (const line of fs.readFileSync(resolved, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

export function readCurrentProductionSha(): string {
  try {
    return execSync('git -C /opt/synqdrive/current rev-parse HEAD', { encoding: 'utf8' })
      .trim()
      .toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Resolve deploy authority SHA without historical baked-in defaults.
 * Explicit EXP021_TARGET_DEPLOY_SHA wins; otherwise snapshot current production HEAD.
 */
export function resolveExp021TargetDeploySha(options?: {
  explicitSha?: string | null;
  productionSha?: string | null;
}): string {
  const explicit = (options?.explicitSha ?? process.env.EXP021_TARGET_DEPLOY_SHA ?? '')
    .trim()
    .toLowerCase();
  if (explicit) {
    return explicit;
  }
  const production = (options?.productionSha ?? readCurrentProductionSha()).trim().toLowerCase();
  if (production) {
    return production;
  }
  throw new Error(
    'EXP021 deploy SHA unresolved: set EXP021_TARGET_DEPLOY_SHA or ensure /opt/synqdrive/current is readable',
  );
}

export function isOrchestratorOwnedRecordingSession(
  preflightJson: unknown,
  orchestratorRunId: string,
): boolean {
  if (!preflightJson || typeof preflightJson !== 'object' || Array.isArray(preflightJson)) {
    return false;
  }
  const ownership = (preflightJson as Record<string, unknown>)[EXP021_ORCHESTRATOR_RUN_OWNERSHIP_KEY];
  if (!ownership || typeof ownership !== 'object' || Array.isArray(ownership)) {
    return false;
  }
  return (ownership as { runId?: string }).runId === orchestratorRunId;
}

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
export type Exp021RuntimeConfig = Readonly<{
  organizationId: string;
  vehicleId: string;
  tokenId: number;
  licensePlate: string;
  freshThresholdSec: number;
  movementSpeedKmh: number;
  parkedSpeedKmh: number;
  driveEndCandidateParkedSec: number;
  driveEndParkedSec: number;
  /** @deprecated Legacy MOVING gate — only used when calibrationPlan is LOWER_BOUND_V1. */
  phaseDurationMs: number;
  calibrationPlan: Exp021CalibrationPlan;
  cadencePhaseOrderMs: readonly number[];
  nominalTotalDurationMs: number;
  maxTotalDurationMs: number;
  pollMs: number;
  targetDeploySha: string;
  logPath: string;
}>;

/** Resolve all EXP-021 orchestrator runtime values after backend.env is loaded. */
export function buildExp021RuntimeConfig(options?: {
  env?: NodeJS.ProcessEnv;
  targetDeploySha?: string;
}): Exp021RuntimeConfig {
  const env = options?.env ?? process.env;
  const targetDeploySha =
    options?.targetDeploySha ??
    resolveExp021TargetDeploySha({ explicitSha: env.EXP021_TARGET_DEPLOY_SHA });
  const calibrationPlan = resolveExp021CalibrationPlan(env);
  const cadencePhaseOrderMs = cadenceSequenceFromPlan(calibrationPlan);
  const legacyPhaseDurationMs = Number.parseInt(env.EXP021_PHASE_DURATION_MS ?? '300000', 10);
  return Object.freeze({
    organizationId: env.ORGANIZATION_ID ?? 'faa710c9-6d91-4079-a7d5-91fdccdec14a',
    vehicleId: env.VEHICLE_ID ?? 'c10351f8-b6a2-4258-947f-631aeaa6d359',
    tokenId: Number.parseInt(env.TOKEN_ID ?? '187361', 10),
    licensePlate: env.LICENSE_PLATE ?? 'KS MS 661',
    freshThresholdSec: Number.parseInt(env.FRESH_THRESHOLD_SEC ?? '600', 10),
    movementSpeedKmh: Number.parseFloat(env.EXP021_MOVEMENT_SPEED_KMH ?? '8'),
    parkedSpeedKmh: Number.parseFloat(env.EXP021_PARKED_SPEED_KMH ?? '3'),
    driveEndCandidateParkedSec: Number.parseInt(env.EXP021_DRIVE_END_CANDIDATE_PARKED_SEC ?? '120', 10),
    driveEndParkedSec: Number.parseInt(env.EXP021_DRIVE_END_PARKED_SEC ?? '600', 10),
    phaseDurationMs: legacyPhaseDurationMs,
    calibrationPlan,
    cadencePhaseOrderMs,
    nominalTotalDurationMs: nominalTotalDurationMs(calibrationPlan),
    maxTotalDurationMs: calibrationPlan.maxTotalDurationMs,
    pollMs: Number.parseInt(env.EXP021_POLL_MS ?? '15000', 10),
    targetDeploySha,
    logPath:
      env.EXP021_AUTONOMOUS_LOG_PATH ??
      '/opt/synqdrive/shared/reference-evidence/exp-021-autonomous-orchestrator.jsonl',
  });
}

export function resolvePhaseAdvancementForIndex(
  config: Exp021RuntimeConfig,
  phaseIndex: number,
) {
  const phaseSpec = config.calibrationPlan.phases[phaseIndex];
  if (!phaseSpec) {
    throw new Error(`invalid phase index ${phaseIndex} for plan ${config.calibrationPlan.planVersion}`);
  }
  return buildPhaseAdvancementConfig(config.calibrationPlan, phaseSpec);
}

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
