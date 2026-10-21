/**
 * EXP-021 S4F-7Y — operator-bound live staging authorization packet (ops-only).
 */
import {
  isValidSha256LowerHex,
  parseCanonicalUtcNotBefore,
  validateFreshNotBeforeAgainstHistorical,
  validatePinnedTinyAllowlistIds,
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
} from './di-v0-s4-fresh-tiny-staging-authority';
import { assertToolShaPin } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-production.lib';
import { DI_V0_S4_ENV_ALLOWLISTS } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import { evaluateDiV0S4RuntimeConfigAttestation } from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4-runtime/di-v0-s4-runtime-config-attestation';
import { OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV } from '../di-v0-s4-tiny-staging-production/di-v0-s4-tiny-staging-frozen-not-before';

function deriveInternalFreshFingerprint(notBeforeCanonical: string): string {
  return evaluateDiV0S4RuntimeConfigAttestation({
    [OPS_DI_V0_S4_DISCOVERY_TRIP_END_NOT_BEFORE_ENV]: notBeforeCanonical,
    [DI_V0_S4_ENV_ALLOWLISTS.organization]: CANONICAL_TINY_ORGANIZATION_ID,
    [DI_V0_S4_ENV_ALLOWLISTS.vehicle]: CANONICAL_TINY_VEHICLE_ID,
  }).fingerprint;
}

export const DI_S4F7Y_LIVE_STAGING_AUTHORIZED_ENV = 'DI_S4F7Y_LIVE_STAGING_AUTHORIZED';
export const DI_S4F7V_LEGACY_LIVE_STAGING_AUTHORIZED_ENV = 'DI_S4F7V_LIVE_STAGING_AUTHORIZED';

export const AUTHORIZED_TOOL_SHA_ENV = 'AUTHORIZED_TOOL_SHA';
export const AUTHORIZED_PRODUCTION_SHA_ENV = 'AUTHORIZED_PRODUCTION_SHA';
export const AUTHORIZED_PRODUCTION_RELEASE_ID_ENV = 'AUTHORIZED_PRODUCTION_RELEASE_ID';
export const AUTHORIZED_PRE_ENV_SHA256_ENV = 'AUTHORIZED_PRE_ENV_SHA256';
export const AUTHORIZED_FRESH_NOT_BEFORE_ENV = 'AUTHORIZED_FRESH_NOT_BEFORE';
export const AUTHORIZED_FRESH_EXPECTED_FINGERPRINT_ENV = 'AUTHORIZED_FRESH_EXPECTED_FINGERPRINT';
export const AUTHORIZED_ORGANIZATION_ALLOWLIST_ENV = 'AUTHORIZED_ORGANIZATION_ALLOWLIST';
export const AUTHORIZED_VEHICLE_ALLOWLIST_ENV = 'AUTHORIZED_VEHICLE_ALLOWLIST';

export const DI_S4F7Y_ENGINEERING_TEST_HARNESS_ENV = 'DI_S4F7Y_ENGINEERING_TEST_HARNESS';
export const DI_S4F7Y_FORENSIC_PRODUCTION_SIMULATION_ENV = 'DI_S4F7Y_FORENSIC_PRODUCTION_SIMULATION';
export const PRODUCTION_SHARED_BACKEND_ENV_PATH = '/opt/synqdrive/shared/backend.env';

function evaluateFixtureTopologyContract(
  env: NodeJS.ProcessEnv,
  failures: string[],
): void {
  const backendEnv = (env.SYNQDRIVE_BACKEND_ENV ?? '').trim();
  if (!backendEnv) failures.push('BACKEND_ENV_MISSING');
  else if (backendEnv === PRODUCTION_SHARED_BACKEND_ENV_PATH) {
    failures.push('PRODUCTION_BACKEND_ENV_IN_HARNESS');
  }
  if (!(env.DI_S4F7V_FIXTURE_DEPLOYED_SHA ?? '').trim() && !(env.DI_S4F7Y_FIXTURE_DEPLOYED_SHA ?? '').trim()) {
    failures.push('FIXTURE_DEPLOYED_SHA_MISSING');
  }
  if (!(env.DI_S4F7V_FIXTURE_RELEASE_DIR ?? '').trim() && !(env.DI_S4F7Y_FIXTURE_RELEASE_DIR ?? '').trim()) {
    failures.push('FIXTURE_RELEASE_DIR_MISSING');
  }
}

export function isExternalLiveStagingAuthorized(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[DI_S4F7Y_LIVE_STAGING_AUTHORIZED_ENV] ?? '').trim() === 'YES';
}

/** Engineering harness or Y.2 forensic production simulation (fixture-backed). */
export function isApprovedLiveFixtureHarness(env: NodeJS.ProcessEnv = process.env): boolean {
  if ((env[DI_S4F7Y_ENGINEERING_TEST_HARNESS_ENV] ?? '').trim() === 'YES') {
    return true;
  }
  return (
    (env[DI_S4F7Y_FORENSIC_PRODUCTION_SIMULATION_ENV] ?? '').trim() === 'YES' &&
    ((env.DI_S4F7V_FIXTURE_MODE ?? '').trim() === '1' || (env.DI_S4F7Y_FIXTURE_MODE ?? '').trim() === '1')
  );
}

export function evaluateEngineeringTestHarnessContract(
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if ((env[DI_S4F7Y_ENGINEERING_TEST_HARNESS_ENV] ?? '').trim() !== 'YES') {
    failures.push('ENGINEERING_TEST_HARNESS_NOT_ENABLED');
  }
  evaluateFixtureTopologyContract(env, failures);
  return { ok: failures.length === 0, failures };
}

export function evaluateForensicProductionSimulationContract(
  env: NodeJS.ProcessEnv = process.env,
): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  if ((env[DI_S4F7Y_FORENSIC_PRODUCTION_SIMULATION_ENV] ?? '').trim() !== 'YES') {
    failures.push('FORENSIC_PRODUCTION_SIMULATION_NOT_ENABLED');
  }
  if ((env.DI_S4F7V_FIXTURE_MODE ?? '').trim() !== '1' && (env.DI_S4F7Y_FIXTURE_MODE ?? '').trim() !== '1') {
    failures.push('FORENSIC_REQUIRES_FIXTURE_MODE');
  }
  evaluateFixtureTopologyContract(env, failures);
  return { ok: failures.length === 0, failures };
}

export function accidentalLiveTestControlsPresent(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.DI_S4F7V_TEST_MODE === '1' ||
    env.DI_S4F7Y_TEST_MODE === '1' ||
    env.DI_S4F7V_FIXTURE_MODE === '1' ||
    env.DI_S4F7Y_FIXTURE_MODE === '1' ||
    env.DI_S4F7Y_ENGINEERING_TEST_HARNESS === 'YES'
  );
}

export type LiveStagingAuthorizationFailure =
  | 'LIVE_STAGING_NOT_AUTHORIZED'
  | 'GENERIC_ACK_MISSING'
  | 'LEGACY_S4F7V_ALONE_INSUFFICIENT'
  | 'AUTHORIZED_FIELD_MISSING'
  | 'AUTHORIZED_TOOL_SHA_MISMATCH'
  | 'AUTHORIZED_PRODUCTION_SHA_MISMATCH'
  | 'AUTHORIZED_RELEASE_MISMATCH'
  | 'AUTHORIZED_PRE_ENV_SHA_MISMATCH'
  | 'AUTHORIZED_FRESH_NOT_BEFORE_MISMATCH'
  | 'AUTHORIZED_FRESH_NOT_BEFORE_INVALID'
  | 'AUTHORIZED_FRESH_FINGERPRINT_MISMATCH'
  | 'AUTHORIZED_FRESH_FINGERPRINT_INTERNAL_MISMATCH'
  | 'AUTHORIZED_ORG_MISMATCH'
  | 'AUTHORIZED_VEHICLE_MISMATCH'
  | 'TEST_FIXTURE_IN_LIVE_PATH';

export interface LiveStagingAuthorizationPacket {
  authorizedToolSha: string;
  authorizedProductionSha: string;
  authorizedProductionReleaseId: string;
  authorizedPreEnvSha256: string;
  authorizedFreshNotBefore: string;
  authorizedFreshExpectedFingerprint: string;
  authorizedOrganizationAllowlist: string;
  authorizedVehicleAllowlist: string;
}

export interface LiveStagingObservedExecutionPacket {
  actualToolSha: string;
  actualProductionSha: string;
  actualProductionReleaseId: string;
  actualPreEnvSha256: string;
  actualFreshNotBefore: string;
  actualFreshExpectedFingerprint: string;
  actualOrganizationAllowlist: string;
  actualVehicleAllowlist: string;
}

export interface LiveStagingAuthorizationGateInput {
  operatorAck?: string;
  liveStagingAuthorized?: string;
  legacyS4f7vLiveAuthorized?: string;
  /** When true, accidental fixture/test controls in a non-test live path fail closed. */
  testHarnessActive?: boolean;
  accidentalFixtureControlsPresent?: boolean;
  packet: LiveStagingAuthorizationPacket;
  observed: LiveStagingObservedExecutionPacket;
}

function requireNonEmpty(value: string | undefined, field: string): string | null {
  const v = (value ?? '').trim();
  if (!v) return field;
  return null;
}

export function readLiveStagingAuthorizationPacketFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): LiveStagingAuthorizationPacket {
  return {
    authorizedToolSha: (env[AUTHORIZED_TOOL_SHA_ENV] ?? '').trim(),
    authorizedProductionSha: (env[AUTHORIZED_PRODUCTION_SHA_ENV] ?? '').trim(),
    authorizedProductionReleaseId: (env[AUTHORIZED_PRODUCTION_RELEASE_ID_ENV] ?? '').trim(),
    authorizedPreEnvSha256: (env[AUTHORIZED_PRE_ENV_SHA256_ENV] ?? '').trim(),
    authorizedFreshNotBefore: (env[AUTHORIZED_FRESH_NOT_BEFORE_ENV] ?? '').trim(),
    authorizedFreshExpectedFingerprint: (env[AUTHORIZED_FRESH_EXPECTED_FINGERPRINT_ENV] ?? '').trim(),
    authorizedOrganizationAllowlist: (env[AUTHORIZED_ORGANIZATION_ALLOWLIST_ENV] ?? '').trim(),
    authorizedVehicleAllowlist: (env[AUTHORIZED_VEHICLE_ALLOWLIST_ENV] ?? '').trim(),
  };
}

export function validateLiveStagingAuthorizationPacketShape(
  packet: LiveStagingAuthorizationPacket,
): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const fields: Array<[keyof LiveStagingAuthorizationPacket, string]> = [
    ['authorizedToolSha', AUTHORIZED_TOOL_SHA_ENV],
    ['authorizedProductionSha', AUTHORIZED_PRODUCTION_SHA_ENV],
    ['authorizedProductionReleaseId', AUTHORIZED_PRODUCTION_RELEASE_ID_ENV],
    ['authorizedPreEnvSha256', AUTHORIZED_PRE_ENV_SHA256_ENV],
    ['authorizedFreshNotBefore', AUTHORIZED_FRESH_NOT_BEFORE_ENV],
    ['authorizedFreshExpectedFingerprint', AUTHORIZED_FRESH_EXPECTED_FINGERPRINT_ENV],
    ['authorizedOrganizationAllowlist', AUTHORIZED_ORGANIZATION_ALLOWLIST_ENV],
    ['authorizedVehicleAllowlist', AUTHORIZED_VEHICLE_ALLOWLIST_ENV],
  ];
  for (const [key, label] of fields) {
    const miss = requireNonEmpty(packet[key], label);
    if (miss) missing.push(miss);
  }
  if (packet.authorizedPreEnvSha256 && !isValidSha256LowerHex(packet.authorizedPreEnvSha256)) {
    missing.push('AUTHORIZED_PRE_ENV_SHA256_MALFORMED');
  }
  if (
    packet.authorizedFreshExpectedFingerprint &&
    !isValidSha256LowerHex(packet.authorizedFreshExpectedFingerprint)
  ) {
    missing.push('AUTHORIZED_FRESH_EXPECTED_FINGERPRINT_MALFORMED');
  }
  return { ok: missing.length === 0, missing };
}

export function evaluateLiveStagingAuthorizationGate(input: LiveStagingAuthorizationGateInput): {
  ok: boolean;
  failures: LiveStagingAuthorizationFailure[];
} {
  const failures: LiveStagingAuthorizationFailure[] = [];

  if (input.accidentalFixtureControlsPresent && !input.testHarnessActive) {
    failures.push('TEST_FIXTURE_IN_LIVE_PATH');
  }
  if ((input.operatorAck ?? '').trim() !== 'YES') failures.push('GENERIC_ACK_MISSING');
  if ((input.liveStagingAuthorized ?? '').trim() !== 'YES') failures.push('LIVE_STAGING_NOT_AUTHORIZED');

  const legacyOnly =
    (input.legacyS4f7vLiveAuthorized ?? '').trim() === 'YES' &&
    (input.liveStagingAuthorized ?? '').trim() !== 'YES';
  if (legacyOnly) failures.push('LEGACY_S4F7V_ALONE_INSUFFICIENT');

  const shape = validateLiveStagingAuthorizationPacketShape(input.packet);
  if (!shape.ok) failures.push('AUTHORIZED_FIELD_MISSING');

  const nb = validateFreshNotBeforeAgainstHistorical(input.packet.authorizedFreshNotBefore);
  if (!nb.ok) failures.push('AUTHORIZED_FRESH_NOT_BEFORE_INVALID');

  const internalFp = nb.ok ? deriveInternalFreshFingerprint(nb.canonical) : '';
  if (
    nb.ok &&
    input.packet.authorizedFreshExpectedFingerprint &&
    internalFp !== input.packet.authorizedFreshExpectedFingerprint
  ) {
    failures.push('AUTHORIZED_FRESH_FINGERPRINT_INTERNAL_MISMATCH');
  }

  if (
    input.packet.authorizedOrganizationAllowlist !== CANONICAL_TINY_ORGANIZATION_ID ||
    !validatePinnedTinyAllowlistIds(
      input.packet.authorizedOrganizationAllowlist,
      input.packet.authorizedVehicleAllowlist,
    ).orgOk
  ) {
    failures.push('AUTHORIZED_ORG_MISMATCH');
  }
  if (
    input.packet.authorizedVehicleAllowlist !== CANONICAL_TINY_VEHICLE_ID ||
    !validatePinnedTinyAllowlistIds(
      input.packet.authorizedOrganizationAllowlist,
      input.packet.authorizedVehicleAllowlist,
    ).vehicleOk
  ) {
    failures.push('AUTHORIZED_VEHICLE_MISMATCH');
  }

  const { packet: auth, observed: act } = input;
  if (!assertToolShaPin(act.actualToolSha, auth.authorizedToolSha)) {
    failures.push('AUTHORIZED_TOOL_SHA_MISMATCH');
  }
  if (act.actualProductionSha !== auth.authorizedProductionSha) {
    failures.push('AUTHORIZED_PRODUCTION_SHA_MISMATCH');
  }
  if (act.actualProductionReleaseId !== auth.authorizedProductionReleaseId) {
    failures.push('AUTHORIZED_RELEASE_MISMATCH');
  }
  if (act.actualPreEnvSha256 !== auth.authorizedPreEnvSha256) {
    failures.push('AUTHORIZED_PRE_ENV_SHA_MISMATCH');
  }
  if (nb.ok && act.actualFreshNotBefore !== nb.canonical) {
    failures.push('AUTHORIZED_FRESH_NOT_BEFORE_MISMATCH');
  }
  if (act.actualFreshExpectedFingerprint !== auth.authorizedFreshExpectedFingerprint) {
    failures.push('AUTHORIZED_FRESH_FINGERPRINT_MISMATCH');
  }
  if (act.actualOrganizationAllowlist !== auth.authorizedOrganizationAllowlist) {
    failures.push('AUTHORIZED_ORG_MISMATCH');
  }
  if (act.actualVehicleAllowlist !== auth.authorizedVehicleAllowlist) {
    failures.push('AUTHORIZED_VEHICLE_MISMATCH');
  }

  const unique = [...new Set(failures)];
  return { ok: unique.length === 0, failures: unique };
}

export interface NoBackfillFinalTripGateInput {
  authorizedFreshNotBeforeCanonical: string;
  latestCompletedTripEndTime: string | null;
  completedTripEndTimeInFutureCount: number;
  existingEligibleCompletedTripCount: number;
}

export function evaluateNoBackfillFinalTripGate(input: NoBackfillFinalTripGateInput): {
  ok: boolean;
  reason?: 'FUTURE_TRIP_END' | 'ELIGIBLE_TRIP_EXISTS' | 'LATEST_TRIP_AFTER_CUTOFF' | 'INVALID_CUTOFF';
} {
  const cutoff = parseCanonicalUtcNotBefore(input.authorizedFreshNotBeforeCanonical);
  if (!cutoff.ok) return { ok: false, reason: 'INVALID_CUTOFF' };
  if (input.completedTripEndTimeInFutureCount !== 0) {
    return { ok: false, reason: 'FUTURE_TRIP_END' };
  }
  if (input.existingEligibleCompletedTripCount !== 0) {
    return { ok: false, reason: 'ELIGIBLE_TRIP_EXISTS' };
  }
  if (input.latestCompletedTripEndTime) {
    const latest = parseCanonicalUtcNotBefore(input.latestCompletedTripEndTime);
    if (!latest.ok) return { ok: false, reason: 'INVALID_CUTOFF' };
    if (latest.epochMs >= cutoff.epochMs) {
      return { ok: false, reason: 'LATEST_TRIP_AFTER_CUTOFF' };
    }
  }
  return { ok: true };
}
