/**
 * EXP-021 S4F-7M — in-process S4 runtime config attestation (pure; reads caller-supplied env snapshot).
 */
import { createHash } from 'crypto';
import {
  DI_V0_S4_ENV_ALLOWLISTS,
  DI_V0_S4_ENV_FLAGS,
  parseDiV0S4BooleanFlag,
  parseDiV0S4ControlPlaneConfig,
} from '../s4a-foundation/di-v0-s4a-control-plane';

export { DI_V0_S4_ENV_ALLOWLISTS };

export const DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_CONTRACT_VERSION = 'v1';

export const DI_V0_S4_RUNTIME_CONFIG_ATTESTATION_METRIC =
  'synqdrive_di_v0_s4_runtime_config_attestation_info';

/** Frozen Tiny staging authority (matches OPS / S4F-7I / S4F-7L). */
export const DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_NOT_BEFORE = '2026-10-02T05:55:28.839Z';
export const DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_ORG_ALLOWLIST = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
export const DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_VEHICLE_ALLOWLIST = 'c10351f8-b6a2-4258-947f-631aeaa6d359';

export const DI_V0_S4_RUNTIME_ATTESTATION_KEY_COUNT = 9;

export type DiV0S4StagingValueSemantic = 'MISSING' | 'EMPTY' | { kind: 'VALUE'; value: string };

export type DiV0S4RuntimeAttestationState = 'PRESTATE' | 'STAGED' | 'OTHER';

export interface DiV0S4RuntimeConfigAttestation {
  fingerprint: string;
  state: DiV0S4RuntimeAttestationState;
  serialization: string;
}

const ATTESTATION_KEY_ORDER: readonly string[] = [
  DI_V0_S4_ENV_FLAGS.master,
  DI_V0_S4_ENV_FLAGS.discovery,
  DI_V0_S4_ENV_FLAGS.worker,
  DI_V0_S4_ENV_FLAGS.position,
  DI_V0_S4_ENV_FLAGS.r1,
  DI_V0_S4_ENV_FLAGS.native,
  'DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE',
  DI_V0_S4_ENV_ALLOWLISTS.organization,
  DI_V0_S4_ENV_ALLOWLISTS.vehicle,
] as const;

export function classifyDiV0S4StagingValueSemantic(raw: string | undefined): DiV0S4StagingValueSemantic {
  if (raw === undefined) return 'MISSING';
  if (raw.trim() === '') return 'EMPTY';
  return { kind: 'VALUE', value: raw };
}

export function canonicalizeDiV0S4EnableFlag(raw: string | undefined): 'ON' | 'OFF' {
  return parseDiV0S4BooleanFlag(raw) ? 'ON' : 'OFF';
}

export function canonicalizeDiV0S4StagingValueForSerialization(semantic: DiV0S4StagingValueSemantic): string {
  if (semantic === 'MISSING') return 'MISSING';
  if (semantic === 'EMPTY') return 'EMPTY';
  return `VALUE:${semantic.value}`;
}

export function buildDiV0S4RuntimeConfigAttestationSerialization(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const lines: string[] = [];
  for (const key of ATTESTATION_KEY_ORDER) {
    if (
      key === DI_V0_S4_ENV_FLAGS.master ||
      key === DI_V0_S4_ENV_FLAGS.discovery ||
      key === DI_V0_S4_ENV_FLAGS.worker ||
      key === DI_V0_S4_ENV_FLAGS.position ||
      key === DI_V0_S4_ENV_FLAGS.r1 ||
      key === DI_V0_S4_ENV_FLAGS.native
    ) {
      lines.push(`${key}=${canonicalizeDiV0S4EnableFlag(env[key])}`);
      continue;
    }
    const semantic = classifyDiV0S4StagingValueSemantic(env[key]);
    lines.push(`${key}=${canonicalizeDiV0S4StagingValueForSerialization(semantic)}`);
  }
  return `${lines.join('\n')}\n`;
}

export function fingerprintDiV0S4RuntimeConfigAttestation(serialization: string): string {
  return createHash('sha256').update(serialization, 'utf8').digest('hex');
}

function stagingSemanticIsMissing(semantic: DiV0S4StagingValueSemantic): boolean {
  return semantic === 'MISSING';
}

function stagingSemanticExactValue(semantic: DiV0S4StagingValueSemantic, expected: string): boolean {
  return semantic !== 'MISSING' && semantic !== 'EMPTY' && semantic.kind === 'VALUE' && semantic.value === expected;
}

export function classifyDiV0S4RuntimeAttestationState(
  env: Readonly<Record<string, string | undefined>>,
): DiV0S4RuntimeAttestationState {
  const cfg = parseDiV0S4ControlPlaneConfig(env);
  const allFlagsOff =
    !cfg.masterEnabled &&
    !cfg.discoveryEnabled &&
    !cfg.workerEnabled &&
    !cfg.positionEnabled &&
    !cfg.r1Enabled &&
    !cfg.nativeEnabled;

  const notBefore = classifyDiV0S4StagingValueSemantic(env.DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE);
  const org = classifyDiV0S4StagingValueSemantic(env[DI_V0_S4_ENV_ALLOWLISTS.organization]);
  const vehicle = classifyDiV0S4StagingValueSemantic(env[DI_V0_S4_ENV_ALLOWLISTS.vehicle]);

  if (!allFlagsOff) return 'OTHER';

  const prestate =
    stagingSemanticIsMissing(notBefore) &&
    stagingSemanticIsMissing(org) &&
    stagingSemanticIsMissing(vehicle);
  if (prestate) return 'PRESTATE';

  const staged =
    stagingSemanticExactValue(notBefore, DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_NOT_BEFORE) &&
    stagingSemanticExactValue(org, DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_ORG_ALLOWLIST) &&
    stagingSemanticExactValue(vehicle, DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_VEHICLE_ALLOWLIST);
  if (staged) return 'STAGED';

  return 'OTHER';
}

export function evaluateDiV0S4RuntimeConfigAttestation(
  env: Readonly<Record<string, string | undefined>>,
): DiV0S4RuntimeConfigAttestation {
  const serialization = buildDiV0S4RuntimeConfigAttestationSerialization(env);
  const fingerprint = fingerprintDiV0S4RuntimeConfigAttestation(serialization);
  const state = classifyDiV0S4RuntimeAttestationState(env);
  return { fingerprint, state, serialization };
}

/** Snapshot `process.env` without copying unrelated keys into the attestation fingerprint. */
export function readDiV0S4RuntimeAttestationEnvFromProcess(
  processEnv: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of ATTESTATION_KEY_ORDER) {
    out[key] = processEnv[key];
  }
  return out;
}

export function evaluateDiV0S4RuntimeConfigAttestationFromProcess(
  processEnv: NodeJS.ProcessEnv = process.env,
): DiV0S4RuntimeConfigAttestation {
  return evaluateDiV0S4RuntimeConfigAttestation(readDiV0S4RuntimeAttestationEnvFromProcess(processEnv));
}

export const EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT = evaluateDiV0S4RuntimeConfigAttestation({}).fingerprint;

export const EXPECTED_DI_V0_S4_RUNTIME_STAGED_FINGERPRINT = evaluateDiV0S4RuntimeConfigAttestation({
  DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_NOT_BEFORE,
  [DI_V0_S4_ENV_ALLOWLISTS.organization]: DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_ORG_ALLOWLIST,
  [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: DI_V0_S4_RUNTIME_ATTESTATION_FROZEN_VEHICLE_ALLOWLIST,
}).fingerprint;
