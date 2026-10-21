import {
  DI_V0_S4_ENV_ALLOWLISTS,
  DI_V0_S4_ENV_FLAGS,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import {
  evaluateDiV0S4RuntimeConfigAttestation,
  EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT,
  type DiV0S4RuntimeAttestationState,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import { parseDiV0S4RuntimeConfigAttestationFromPrometheusBody } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation-metric-parse';
import { assertDiV0S4OpsControlFlagsSafe } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4f-observability/di-v0-s4f-ops-s4-control-preflight';
import {
  assertPreMutationTargetKeysAllMissing,
  assertTargetKeyCardinality,
  assertToolShaPin,
  classifyPreMutationTargetKeyStates,
  computeSemanticEnvDiff,
  countEnvKeyOccurrences,
  evaluateTinyStagingGuards,
  parseVehicleDbProofLines,
  SUPPORTED_ENV_MUTATION_KEY_COUNT,
  TINY_STAGING_TARGET_KEYS,
  type TinyStagingGuardFailure,
  type TinyStagingGuardInput,
} from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production.lib';
import { OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-frozen-not-before';
import { envMapFromFileContent, parseEnvFile } from '../di-v0-s4f-global-budget-rollout/di-v0-s4f-global-budget-rollout.lib';
import {
  assertFreshAuthorityAgeWithinWindow,
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
  DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT_ENV,
  DI_S4_TINY_FRESH_NOT_BEFORE_ENV,
  DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST_ENV,
  DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST_ENV,
  EXPECTED_FRESH_TINY_STAGING_TOOL_SHA_ENV,
  EXPECTED_PRESTATE_ATTESTATION_FINGERPRINT,
  FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS,
  isValidSha256LowerHex,
  validateFreshNotBeforeAgainstHistorical,
  validatePinnedTinyAllowlistIds,
} from './di-v0-s4-fresh-tiny-staging-authority';

export {
  assertToolShaPin,
  computeSemanticEnvDiff,
  countEnvKeyOccurrences,
  parseVehicleDbProofLines,
  SUPPORTED_ENV_MUTATION_KEY_COUNT,
  TINY_STAGING_TARGET_KEYS,
  EXPECTED_PRESTATE_ATTESTATION_FINGERPRINT,
  EXPECTED_DI_V0_S4_RUNTIME_PRESTATE_FINGERPRINT,
  FRESH_STAGING_AUTHORITY_MAX_AGE_SECONDS,
  DI_S4_TINY_FRESH_NOT_BEFORE_ENV,
  DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT_ENV,
  DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST_ENV,
  DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST_ENV,
  EXPECTED_FRESH_TINY_STAGING_TOOL_SHA_ENV,
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
};

export type FreshTinyStagingGuardFailure =
  | TinyStagingGuardFailure
  | 'FRESH_NOT_BEFORE_MISSING'
  | 'FRESH_NOT_BEFORE_INVALID'
  | 'FRESH_FINGERPRINT_MISSING'
  | 'FRESH_FINGERPRINT_MALFORMED'
  | 'FRESH_FINGERPRINT_MISMATCH'
  | 'FRESH_ORG_INVALID'
  | 'FRESH_VEHICLE_INVALID'
  | 'FRESH_AUTHORITY_TOO_OLD'
  | 'FRESH_AUTHORITY_FUTURE'
  | 'FRESH_AUTHORITY_AGE_NEGATIVE'
  | 'TOOL_SHA_PIN_MISMATCH'
  | 'TOOL_SHA_PIN_MISSING';

export interface FreshAuthorityInput {
  freshNotBefore: string | undefined;
  operatorExpectedFingerprint: string | undefined;
  organizationAllowlist: string | undefined;
  vehicleAllowlist: string | undefined;
  dbClockCanonicalUtc: string;
}

export interface FreshAuthorityValidation {
  ok: boolean;
  failures: FreshTinyStagingGuardFailure[];
  canonicalNotBefore?: string;
  internallyComputedFingerprint?: string;
  operatorExpectedFingerprint?: string;
  ageSeconds?: number;
}

export function deriveInternallyComputedFreshFingerprint(
  freshNotBeforeCanonical: string,
  organizationAllowlist: string,
  vehicleAllowlist: string,
): string {
  const att = evaluateDiV0S4RuntimeConfigAttestation({
    DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: freshNotBeforeCanonical,
    [DI_V0_S4_ENV_ALLOWLISTS.organization]: organizationAllowlist,
    [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: vehicleAllowlist,
  });
  return att.fingerprint;
}

export function classifyFreshStagingAttestationState(
  freshNotBeforeCanonical: string,
  organizationAllowlist: string,
  vehicleAllowlist: string,
): DiV0S4RuntimeAttestationState {
  return evaluateDiV0S4RuntimeConfigAttestation({
    DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE: freshNotBeforeCanonical,
    [DI_V0_S4_ENV_ALLOWLISTS.organization]: organizationAllowlist,
    [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: vehicleAllowlist,
  }).state;
}

export function validateFreshAuthority(input: FreshAuthorityInput): FreshAuthorityValidation {
  const failures: FreshTinyStagingGuardFailure[] = [];

  const nb = validateFreshNotBeforeAgainstHistorical(input.freshNotBefore);
  if (!nb.ok) {
    if (input.freshNotBefore == null || input.freshNotBefore.trim() === '') failures.push('FRESH_NOT_BEFORE_MISSING');
    else failures.push('FRESH_NOT_BEFORE_INVALID');
    return { ok: false, failures };
  }

  const allow = validatePinnedTinyAllowlistIds(input.organizationAllowlist, input.vehicleAllowlist);
  if (!allow.orgOk) failures.push('FRESH_ORG_INVALID');
  if (!allow.vehicleOk || allow.wildcardPresent) failures.push('FRESH_VEHICLE_INVALID');

  const opFp = (input.operatorExpectedFingerprint ?? '').trim();
  if (!opFp) failures.push('FRESH_FINGERPRINT_MISSING');
  else if (!isValidSha256LowerHex(opFp)) failures.push('FRESH_FINGERPRINT_MALFORMED');

  const internalFp = deriveInternallyComputedFreshFingerprint(
    nb.canonical,
    CANONICAL_TINY_ORGANIZATION_ID,
    CANONICAL_TINY_VEHICLE_ID,
  );
  if (opFp && internalFp !== opFp) failures.push('FRESH_FINGERPRINT_MISMATCH');

  const age = assertFreshAuthorityAgeWithinWindow(input.dbClockCanonicalUtc, nb.canonical);
  if (!age.ok) {
    if (age.reason === 'AUTHORITY_TOO_OLD') failures.push('FRESH_AUTHORITY_TOO_OLD');
    else if (age.reason === 'FUTURE_RELATIVE_TO_DB_CLOCK' || age.reason === 'AUTHORITY_AGE_NEGATIVE') {
      failures.push('FRESH_AUTHORITY_FUTURE');
    }
    else failures.push('FRESH_NOT_BEFORE_INVALID');
  }

  if (failures.length > 0) {
    return {
      ok: false,
      failures,
      canonicalNotBefore: nb.canonical,
      internallyComputedFingerprint: internalFp,
      operatorExpectedFingerprint: opFp,
      ageSeconds: age.ok ? age.ageSeconds : undefined,
    };
  }

  if (!age.ok) {
    return {
      ok: false,
      failures: ['FRESH_NOT_BEFORE_INVALID'],
      canonicalNotBefore: nb.canonical,
      internallyComputedFingerprint: internalFp,
      operatorExpectedFingerprint: opFp,
    };
  }

  return {
    ok: true,
    failures: [],
    canonicalNotBefore: nb.canonical,
    internallyComputedFingerprint: internalFp,
    operatorExpectedFingerprint: opFp,
    ageSeconds: age.ageSeconds,
  };
}

export function buildFreshStagingValuesMap(
  freshNotBeforeCanonical: string,
  organizationAllowlist: string,
  vehicleAllowlist: string,
): Readonly<Record<string, string>> {
  return {
    [OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV]: freshNotBeforeCanonical,
    [DI_V0_S4_ENV_ALLOWLISTS.organization]: organizationAllowlist,
    [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: vehicleAllowlist,
  };
}

export function serializeFreshTinyStagingEnvFile(
  map: Map<string, string>,
  originalLines: string[],
  stagingValues: Readonly<Record<string, string>>,
): string {
  const keysWritten = new Set<string>();
  const out: string[] = [];
  const s4Flags = Object.values(DI_V0_S4_ENV_FLAGS);
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
    if ((TINY_STAGING_TARGET_KEYS as readonly string[]).includes(key)) {
      if (!keysWritten.has(key)) {
        out.push(`${key}=${stagingValues[key]}`);
        keysWritten.add(key);
      }
      continue;
    }
    if ((s4Flags as readonly string[]).includes(key)) {
      out.push(line);
      keysWritten.add(key);
      continue;
    }
    out.push(line);
    keysWritten.add(key);
  }
  for (const key of TINY_STAGING_TARGET_KEYS) {
    if (!keysWritten.has(key)) {
      out.push(`${key}=${stagingValues[key]}`);
      keysWritten.add(key);
    }
  }
  return out.join('\n').replace(/\n*$/, '\n');
}

export function applyFreshTinyStagingMutation(
  originalContent: string,
  stagingValues: Readonly<Record<string, string>>,
): { nextContent: string; mutated: boolean; targetKeyCountAfter: number } {
  const cardinality = assertTargetKeyCardinality(originalContent);
  if (!cardinality.ok) throw new Error(`duplicate_target_key:${cardinality.duplicateKey}`);
  const prestate = assertPreMutationTargetKeysAllMissing(originalContent);
  if (!prestate.ok) throw new Error(`target_key_prestate:${prestate.key}:${prestate.state}`);
  const lines = originalContent.split('\n');
  const before = parseEnvFile(originalContent);
  const nextContent = serializeFreshTinyStagingEnvFile(before, lines, stagingValues);
  const afterCardinality = assertTargetKeyCardinality(nextContent);
  if (!afterCardinality.ok) throw new Error(`post_mutation_duplicate:${afterCardinality.duplicateKey}`);
  let targetKeyCountAfter = 0;
  for (const key of TINY_STAGING_TARGET_KEYS) {
    if (countEnvKeyOccurrences(nextContent, key) === 1) targetKeyCountAfter += 1;
  }
  const normalizedOriginal = originalContent.replace(/\n*$/, '\n');
  return { nextContent, mutated: nextContent !== normalizedOriginal, targetKeyCountAfter };
}

export function proveReplicaFreshPrimaryStagingRuntime(
  metricsBody: string,
  expectedFreshFingerprint: string,
): {
  ok: boolean;
  fingerprint: string;
  state: DiV0S4RuntimeAttestationState;
  contractVersion: string;
  reason?: string;
} {
  try {
    const parsed = parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(metricsBody);
    const ok =
      parsed.contractVersion === 'v1' &&
      parsed.state === 'OTHER' &&
      parsed.fingerprint === expectedFreshFingerprint;
    if (!ok) {
      let reason = 'FRESH_RUNTIME_MISMATCH';
      if (parsed.state === 'PRESTATE') reason = 'PRESTATE_DURING_PRIMARY_STAGING';
      if (parsed.state === 'STAGED') reason = 'STAGED_DURING_FRESH_PRIMARY';
      if (parsed.fingerprint !== expectedFreshFingerprint) reason = 'FRESH_FINGERPRINT_MISMATCH';
      return { ok: false, fingerprint: parsed.fingerprint, state: parsed.state, contractVersion: parsed.contractVersion, reason };
    }
    return { ok: true, fingerprint: parsed.fingerprint, state: parsed.state, contractVersion: parsed.contractVersion };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, fingerprint: '', state: 'OTHER', contractVersion: '', reason: msg };
  }
}

export function proveReplicaRecoveryPrestateRuntime(metricsBody: string): {
  ok: boolean;
  fingerprint: string;
  state: DiV0S4RuntimeAttestationState;
} {
  try {
    const parsed = parseDiV0S4RuntimeConfigAttestationFromPrometheusBody(metricsBody);
    const ok =
      parsed.contractVersion === 'v1' &&
      parsed.state === 'PRESTATE' &&
      parsed.fingerprint === EXPECTED_PRESTATE_ATTESTATION_FINGERPRINT;
    return { ok, fingerprint: parsed.fingerprint, state: parsed.state };
  } catch {
    return { ok: false, fingerprint: '', state: 'OTHER' };
  }
}

export interface FreshTinyStagingGuardInput extends TinyStagingGuardInput {
  freshAuthority: FreshAuthorityInput;
  toolCheckoutSha?: string;
  requiredToolSha?: string;
  /** When set, re-validates age at final pre-mutation gate. */
  finalPreMutationDbClock?: string;
}

export function evaluateFreshTinyStagingGuards(input: FreshTinyStagingGuardInput): {
  ok: boolean;
  failures: FreshTinyStagingGuardFailure[];
} {
  const base = evaluateTinyStagingGuards({
    ...input,
    // S4F-7J frozen NOT_BEFORE validation is not applicable — fresh path uses separate authority.
  });
  const failures: FreshTinyStagingGuardFailure[] = [...base.failures];

  const fresh = validateFreshAuthority(input.freshAuthority);
  if (!fresh.ok) failures.push(...fresh.failures);

  if (input.finalPreMutationDbClock && fresh.canonicalNotBefore) {
    const finalAge = assertFreshAuthorityAgeWithinWindow(input.finalPreMutationDbClock, fresh.canonicalNotBefore);
    if (!finalAge.ok) {
      if (finalAge.reason === 'AUTHORITY_TOO_OLD') failures.push('FRESH_AUTHORITY_TOO_OLD');
      else failures.push('FRESH_NOT_BEFORE_INVALID');
    }
  }

  const reqTool = (input.requiredToolSha ?? '').trim();
  if (!reqTool) failures.push('TOOL_SHA_PIN_MISSING');
  else if (!input.toolCheckoutSha || !assertToolShaPin(input.toolCheckoutSha, reqTool)) {
    failures.push('TOOL_SHA_PIN_MISMATCH');
  }

  // Override: base may flag NOT_BEFORE_INVALID from frozen validator — drop for fresh path.
  const filtered = failures.filter(
    (f) => f !== 'NOT_BEFORE_INVALID' && f !== 'ALLOWLIST_INVALID',
  );
  const unique = [...new Set(filtered)];
  return { ok: unique.length === 0, failures: unique };
}

export function assertEnvS4FlagsAllOff(envContent: string): boolean {
  const env = envMapFromFileContent(envContent);
  return assertDiV0S4OpsControlFlagsSafe(env).ok;
}

export function readFreshAuthorityFromProcessEnv(env: NodeJS.ProcessEnv = process.env): FreshAuthorityInput {
  return {
    freshNotBefore: env[DI_S4_TINY_FRESH_NOT_BEFORE_ENV],
    operatorExpectedFingerprint: env[DI_S4_TINY_FRESH_EXPECTED_FINGERPRINT_ENV],
    organizationAllowlist: env[DI_S4_TINY_FRESH_ORGANIZATION_ALLOWLIST_ENV],
    vehicleAllowlist: env[DI_S4_TINY_FRESH_VEHICLE_ALLOWLIST_ENV],
    dbClockCanonicalUtc: env.DI_S4F7V_DB_CLOCK_CANONICAL_UTC ?? '',
  };
}

export function intendedFreshThreeKeyDeltaLines(stagingValues: Readonly<Record<string, string>>): string[] {
  return TINY_STAGING_TARGET_KEYS.map((k) => `${k}=${stagingValues[k]}`);
}
