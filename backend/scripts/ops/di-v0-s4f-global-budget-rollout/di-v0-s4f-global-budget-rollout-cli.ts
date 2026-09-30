#!/usr/bin/env ts-node
/**
 * CLI for S4F-4 global-budget env mutation and pre/post validation (no arbitrary keys).
 */
import * as fs from 'fs';
import * as path from 'path';
import { validateDimoProviderBudgetConfig } from '../../../src/modules/dimo/provider-budget/dimo-provider-budget.config';
import {
  applyGlobalBudgetEnabledMutation,
  assertPreflightConfigStateAllowed,
  assertS4ControlFlagsSafe,
  classifyConfigFileFromEnvContent,
  envMapFromFileContent,
  sha256Hex,
  idempotentConvergenceDecision,
} from './di-v0-s4f-global-budget-rollout.lib';

function readFile(pathname: string): string {
  return fs.readFileSync(pathname, 'utf8');
}

function atomicWriteFile(target: string, content: string, mode?: number): void {
  const dir = path.dirname(target);
  const tmp = path.join(dir, `.${path.basename(target)}.s4f4.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: mode ?? 0o600 });
  fs.renameSync(tmp, target);
}

function cmdPreflight(file: string): void {
  let readable = false;
  try {
    fs.accessSync(file, fs.constants.R_OK);
    readable = true;
  } catch {
    readable = false;
  }
  let content = '';
  try {
    content = readFile(file);
  } catch {
    console.log('GLOBAL_BUDGET_CONFIG_FILE_STATE=UNREADABLE');
    process.exit(1);
  }
  const state = classifyConfigFileFromEnvContent(content, readable);
  console.log(`GLOBAL_BUDGET_CONFIG_FILE_STATE=${state}`);
  const allowed = assertPreflightConfigStateAllowed(state);
  if (!allowed.ok) {
    console.log(`PREFLIGHT_CONFIG_ALLOWED=NO reason=${allowed.reason}`);
    process.exit(1);
  }
  console.log('PREFLIGHT_CONFIG_ALLOWED=YES');
}

function cmdS4Safe(file: string): void {
  const content = readFile(file);
  const env = envMapFromFileContent(content);
  const { ok, unsafeKeys } = assertS4ControlFlagsSafe(env);
  if (!ok) {
    console.log(`S4_FLAGS_PRE_STATE_SAFE=NO unsafe=${unsafeKeys.join(',')}`);
    process.exit(1);
  }
  console.log('S4_FLAGS_PRE_STATE_SAFE=YES');
}

function cmdValidateBudget(file: string): void {
  const env = envMapFromFileContent(readFile(file));
  const merged: Record<string, string | undefined> = {
    ...process.env,
    ...env,
    DIMO_GLOBAL_BUDGET_ENABLED: 'true',
  };
  const config = {
    globalBudgetEnabled: true,
    globalMaxInFlight: parseInt(merged.DIMO_GLOBAL_MAX_IN_FLIGHT ?? '50', 10),
    globalAcquireTimeoutMs: parseInt(merged.DIMO_GLOBAL_ACQUIRE_TIMEOUT_MS ?? '15000', 10),
    globalLeaseMs: parseInt(merged.DIMO_GLOBAL_LEASE_MS ?? '30000', 10),
    globalRetryAfterMaxMs: parseInt(merged.DIMO_GLOBAL_RETRY_AFTER_MAX_MS ?? '120000', 10),
    globalMaxRetries: parseInt(merged.DIMO_GLOBAL_MAX_RETRIES ?? '3', 10),
    reservedHighPrioritySlots: parseInt(merged.DIMO_GLOBAL_RESERVED_HIGH_SLOTS ?? '10', 10),
    starvationPromotionMs: parseInt(merged.DIMO_GLOBAL_STARVATION_PROMOTION_MS ?? '30000', 10),
    providerCooldown429Threshold: parseInt(merged.DIMO_PROVIDER_COOLDOWN_429_THRESHOLD ?? '5', 10),
    providerCooldownMs: parseInt(merged.DIMO_PROVIDER_COOLDOWN_MS ?? '30000', 10),
    acquirePollIntervalMs: parseInt(merged.DIMO_GLOBAL_ACQUIRE_POLL_MS ?? '50', 10),
  };
  const errors = validateDimoProviderBudgetConfig(config);
  if (errors.length > 0) {
    console.log(`PROVIDER_BUDGET_CONFIG_VALID=NO errors=${errors.join(';')}`);
    process.exit(1);
  }
  console.log('PROVIDER_BUDGET_CONFIG_VALID=YES');
}

function cmdMutate(file: string): void {
  const before = readFile(file);
  const beforeSha = sha256Hex(before);
  const { nextContent, unrelatedDeltaCount, mutated } = applyGlobalBudgetEnabledMutation(before);
  if (unrelatedDeltaCount !== 0) {
    console.log(`UNRELATED_ENV_DELTA_COUNT=${unrelatedDeltaCount}`);
    console.log('MUTATION_VALIDATION=FAIL');
    process.exit(1);
  }
  const st = fs.statSync(file);
  atomicWriteFile(file, nextContent, st.mode & 0o777);
  const afterSha = sha256Hex(readFile(file));
  console.log(`ENV_MUTATION_PERFORMED=${mutated ? 'YES' : 'NO'}`);
  console.log(`UNRELATED_ENV_DELTA_COUNT=${unrelatedDeltaCount}`);
  console.log(`BACKEND_ENV_SHA256_BEFORE=${beforeSha}`);
  console.log(`BACKEND_ENV_SHA256_AFTER=${afterSha}`);
  const state = classifyConfigFileFromEnvContent(readFile(file), true);
  console.log(`GLOBAL_BUDGET_CONFIG_FILE_STATE=${state}`);
  if (state !== 'EXPLICIT_ENABLED') {
    console.log('MUTATION_VALIDATION=FAIL');
    process.exit(1);
  }
  console.log('DIMO_GLOBAL_BUDGET_CONFIG_NORMALIZED_VALUE=ENABLED');
  console.log('MUTATION_VALIDATION=PASS');
}

function cmdIdempotentDecision(file: string, runtimeA: string, runtimeB: string): void {
  const state = classifyConfigFileFromEnvContent(readFile(file), true);
  const mapRuntime = (v: string) => (v === 'ENABLED' || v === 'DISABLED' ? v : 'UNKNOWN');
  const decision = idempotentConvergenceDecision({
    configState: state,
    replicaARuntime: mapRuntime(runtimeA),
    replicaBRuntime: mapRuntime(runtimeB),
  });
  console.log(`IDEMPOTENT_DECISION=${decision}`);
}

const [cmd, file, arg1, arg2] = process.argv.slice(2);
if (!cmd || !file) {
  console.error('usage: cli.ts <preflight|s4-safe|validate-budget|mutate|idempotent-decision> <env-file> [runtimeA] [runtimeB]');
  process.exit(2);
}

switch (cmd) {
  case 'preflight':
    cmdPreflight(file);
    break;
  case 's4-safe':
    cmdS4Safe(file);
    break;
  case 'validate-budget':
    cmdValidateBudget(file);
    break;
  case 'mutate':
    cmdMutate(file);
    break;
  case 'idempotent-decision':
    cmdIdempotentDecision(file, arg1 ?? 'UNKNOWN', arg2 ?? 'UNKNOWN');
    break;
  default:
    console.error(`unknown command ${cmd}`);
    process.exit(2);
}
