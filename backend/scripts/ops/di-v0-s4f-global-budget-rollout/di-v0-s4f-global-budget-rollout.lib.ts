import { createHash } from 'crypto';
import {
  classifyGlobalBudgetConfigFileStateFromRaw,
  type DiV0S4fGlobalBudgetConfigFileState,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-global-budget-evidence-semantics';
import { assertDiV0S4OpsControlFlagsSafe } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-ops-s4-control-preflight';

export const DI_S4_GLOBAL_BUDGET_ENV_KEY = 'DIMO_GLOBAL_BUDGET_ENABLED';
export const DI_S4_GLOBAL_BUDGET_TARGET_VALUE = 'true';

export const DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK_ENV = 'DI_S4_GLOBAL_BUDGET_ROLLOUT_ACK';
export const DI_S4_REQUIRED_GIT_SHA_ENV = 'DI_S4_REQUIRED_GIT_SHA';

export const GLOBAL_BUDGET_RUNTIME_LOG_MARKER = 'DIMO global provider budget enabled';
export const GLOBAL_BUDGET_RUNTIME_DISABLED_MARKER = 'DIMO_GLOBAL_BUDGET_ENABLED=false';

export function sha256Hex(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function parseEnvFile(content: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of content.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    map.set(key, line.slice(idx + 1));
  }
  return map;
}

export function serializeEnvFile(map: Map<string, string>, originalLines: string[]): string {
  const keysWritten = new Set<string>();
  const out: string[] = [];
  for (const line of originalLines) {
    if (!line || line.startsWith('#')) {
      out.push(line);
      continue;
    }
    const idx = line.indexOf('=');
    if (idx <= 0) {
      out.push(line);
      continue;
    }
    const key = line.slice(0, idx);
    if (key === DI_S4_GLOBAL_BUDGET_ENV_KEY) {
      if (!keysWritten.has(key)) {
        out.push(`${DI_S4_GLOBAL_BUDGET_ENV_KEY}=${DI_S4_GLOBAL_BUDGET_TARGET_VALUE}`);
        keysWritten.add(key);
      }
      continue;
    }
    out.push(line);
    keysWritten.add(key);
  }
  if (!keysWritten.has(DI_S4_GLOBAL_BUDGET_ENV_KEY)) {
    out.push(`${DI_S4_GLOBAL_BUDGET_ENV_KEY}=${DI_S4_GLOBAL_BUDGET_TARGET_VALUE}`);
  }
  return out.join('\n').replace(/\n*$/, '\n');
}

export function applyGlobalBudgetEnabledMutation(originalContent: string): {
  nextContent: string;
  unrelatedDeltaCount: number;
  mutated: boolean;
} {
  const lines = originalContent.split('\n');
  const before = parseEnvFile(originalContent);
  const nextContent = serializeEnvFile(before, lines);
  const after = parseEnvFile(nextContent);
  let unrelatedDeltaCount = 0;
  for (const [key, value] of before) {
    if (key === DI_S4_GLOBAL_BUDGET_ENV_KEY) continue;
    if (after.get(key) !== value) unrelatedDeltaCount += 1;
  }
  for (const key of after.keys()) {
    if (key === DI_S4_GLOBAL_BUDGET_ENV_KEY) continue;
    if (!before.has(key)) unrelatedDeltaCount += 1;
  }
  const normalizedOriginal = originalContent.replace(/\n*$/, '\n');
  const mutated = nextContent !== normalizedOriginal;
  return { nextContent, unrelatedDeltaCount, mutated };
}

export function classifyConfigFileFromEnvContent(
  content: string,
  readable: boolean,
): DiV0S4fGlobalBudgetConfigFileState {
  if (!readable) return 'UNREADABLE';
  const map = parseEnvFile(content);
  if (!map.has(DI_S4_GLOBAL_BUDGET_ENV_KEY)) return 'MISSING';
  return classifyGlobalBudgetConfigFileStateFromRaw(map.get(DI_S4_GLOBAL_BUDGET_ENV_KEY), true);
}

export function assertPreflightConfigStateAllowed(
  state: DiV0S4fGlobalBudgetConfigFileState,
): { ok: true } | { ok: false; reason: string } {
  if (state === 'MISSING' || state === 'EXPLICIT_ENABLED') return { ok: true };
  if (state === 'EXPLICIT_DISABLED') {
    return { ok: false, reason: 'EXPLICIT_DISABLED requires separate investigation' };
  }
  if (state === 'MALFORMED') return { ok: false, reason: 'MALFORMED config' };
  if (state === 'UNREADABLE') return { ok: false, reason: 'UNREADABLE config file' };
  return { ok: false, reason: `unsupported state ${state}` };
}

export function assertS4ControlFlagsSafe(env: Readonly<Record<string, string | undefined>>): {
  ok: boolean;
  unsafeKeys: string[];
} {
  return assertDiV0S4OpsControlFlagsSafe(env);
}

export function envMapFromFileContent(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of parseEnvFile(content)) out[k] = v;
  return out;
}

export type RuntimeBudgetProof = 'ENABLED' | 'DISABLED' | 'UNKNOWN';

export function classifyRuntimeBudgetFromLogSnippet(snippet: string): RuntimeBudgetProof {
  if (snippet.includes(GLOBAL_BUDGET_RUNTIME_DISABLED_MARKER)) return 'DISABLED';
  if (snippet.includes(GLOBAL_BUDGET_RUNTIME_LOG_MARKER)) return 'ENABLED';
  return 'UNKNOWN';
}

export function idempotentConvergenceDecision(input: {
  configState: DiV0S4fGlobalBudgetConfigFileState;
  replicaARuntime: RuntimeBudgetProof;
  replicaBRuntime: RuntimeBudgetProof;
}): 'NO_OP' | 'RESTART_FOR_RUNTIME_PROOF' | 'MUTATE_AND_RESTART' | 'ABORT' {
  const { configState, replicaARuntime, replicaBRuntime } = input;
  if (configState === 'EXPLICIT_DISABLED' || configState === 'MALFORMED' || configState === 'UNREADABLE') {
    return 'ABORT';
  }
  if (configState === 'MISSING') return 'MUTATE_AND_RESTART';
  if (configState === 'EXPLICIT_ENABLED') {
    if (replicaARuntime === 'ENABLED' && replicaBRuntime === 'ENABLED') return 'NO_OP';
    return 'RESTART_FOR_RUNTIME_PROOF';
  }
  return 'ABORT';
}
