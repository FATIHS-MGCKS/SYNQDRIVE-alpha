import type { RawRefuelCandidate } from '@prisma/client';
import type { RawFuelAbsoluteSignalTrust } from './raw-fuel-refuel-fallback.types';
import { readHybridAbsoluteSignalTrustEvidence } from './raw-fuel-hybrid-trust-evidence-metadata';

export const RFRF_HYBRID_TRUST_ACTIVATION_POLICY_VERSION = 'rfrf-hybrid-trust-activation-v1';

export const RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV = 'RFRF_HYBRID_TRUST_ACTIVATION_MODE';
export const RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV =
  'RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS';
export const RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV =
  'RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS';

export type HybridTrustActivationMode = 'OFF' | 'ALPHA_ALLOWLIST';

export const HYBRID_TRUST_ACTIVATION_MODES: readonly HybridTrustActivationMode[] = [
  'OFF',
  'ALPHA_ALLOWLIST',
] as const;

export type HybridTrustActivationScopeType =
  | 'NONE'
  | 'ORGANIZATION'
  | 'VEHICLE'
  | 'UNSCOPED';

export interface HybridTrustActivationConfig {
  activationPolicyVersion: string;
  activationMode: HybridTrustActivationMode;
  allowedOrganizationIds: ReadonlySet<string>;
  allowedVehicleIds: ReadonlySet<string>;
}

export interface HybridTrustActivationDecision {
  activationPolicyVersion: string;
  activationMode: HybridTrustActivationMode;
  activationAuthorized: boolean;
  activationScopeType: HybridTrustActivationScopeType;
  computedHybridClassification: RawFuelAbsoluteSignalTrust;
  effectiveAbsoluteSignalTrust: RawFuelAbsoluteSignalTrust;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function parseHybridTrustActivationMode(
  raw: string | undefined,
): HybridTrustActivationMode {
  if (raw == null || raw.trim() === '') return 'OFF';
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'ALPHA_ALLOWLIST') return 'ALPHA_ALLOWLIST';
  if (normalized === 'OFF') return 'OFF';
  return 'OFF';
}

export function parseHybridTrustActivationUuidAllowlist(
  raw: string | undefined,
): ReadonlySet<string> {
  if (raw == null || raw.trim() === '') return new Set();
  const ids = new Set<string>();
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!UUID_RE.test(trimmed)) continue;
    ids.add(trimmed.toLowerCase());
  }
  return ids;
}

export function loadHybridTrustActivationConfig(
  env: NodeJS.ProcessEnv = process.env,
): HybridTrustActivationConfig {
  const activationMode = parseHybridTrustActivationMode(env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]);
  return {
    activationPolicyVersion: RFRF_HYBRID_TRUST_ACTIVATION_POLICY_VERSION,
    activationMode,
    allowedOrganizationIds: parseHybridTrustActivationUuidAllowlist(
      env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV],
    ),
    allowedVehicleIds: parseHybridTrustActivationUuidAllowlist(
      env[RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV],
    ),
  };
}

function normalizeId(value: string | null | undefined): string | null {
  if (!isNonEmptyString(value)) return null;
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

/**
 * Scoped production activation — separate from observation-local hybrid semantics.
 * Fail-closed: absent/malformed mode => OFF; empty allowlists => nobody authorized.
 */
export function evaluateHybridTrustActivationAuthorization(input: {
  organizationId?: string | null;
  vehicleId?: string | null;
  computedHybridClassification: RawFuelAbsoluteSignalTrust;
  config?: HybridTrustActivationConfig;
}): Omit<HybridTrustActivationDecision, 'effectiveAbsoluteSignalTrust'> {
  const config = input.config ?? loadHybridTrustActivationConfig();
  const computed = input.computedHybridClassification;

  let activationAuthorized = false;
  let activationScopeType: HybridTrustActivationScopeType = 'NONE';

  if (config.activationMode === 'ALPHA_ALLOWLIST') {
    const orgId = normalizeId(input.organizationId);
    const vehicleId = normalizeId(input.vehicleId);

    if (
      orgId &&
      config.allowedOrganizationIds.size > 0 &&
      config.allowedOrganizationIds.has(orgId)
    ) {
      activationAuthorized = true;
      activationScopeType = 'ORGANIZATION';
    } else if (
      vehicleId &&
      config.allowedVehicleIds.size > 0 &&
      config.allowedVehicleIds.has(vehicleId)
    ) {
      activationAuthorized = true;
      activationScopeType = 'VEHICLE';
    }
  }

  return {
    activationPolicyVersion: config.activationPolicyVersion,
    activationMode: config.activationMode,
    activationAuthorized,
    activationScopeType,
    computedHybridClassification: computed,
  };
}

export function deriveEffectiveAbsoluteSignalTrust(
  computedHybridClassification: RawFuelAbsoluteSignalTrust,
  activationAuthorized: boolean,
): RawFuelAbsoluteSignalTrust {
  if (computedHybridClassification === 'UNTRUSTED') return 'UNTRUSTED';
  if (computedHybridClassification === 'UNKNOWN') return 'UNKNOWN';
  if (computedHybridClassification === 'TRUSTED' && activationAuthorized) return 'TRUSTED';
  return 'UNKNOWN';
}

/**
 * Authoritative promotion-trust view for a persisted candidate (DB org/vehicle scope).
 * Re-applies scoped activation over stored hybrid provenance — never trusts row trust alone.
 */
export function resolveEffectivePromotionTrustForCandidate(
  candidate: Pick<
    RawRefuelCandidate,
    'organizationId' | 'vehicleId' | 'evidenceMeta' | 'absoluteSignalTrust'
  >,
  config?: HybridTrustActivationConfig,
): RawFuelAbsoluteSignalTrust {
  const hybrid = readHybridAbsoluteSignalTrustEvidence(candidate.evidenceMeta);
  const computed: RawFuelAbsoluteSignalTrust =
    hybrid?.computedHybridClassification ??
    (candidate.absoluteSignalTrust === 'TRUSTED' || candidate.absoluteSignalTrust === 'UNTRUSTED'
      ? candidate.absoluteSignalTrust
      : 'UNKNOWN');
  return resolveHybridTrustActivationDecision({
    organizationId: candidate.organizationId,
    vehicleId: candidate.vehicleId,
    computedHybridClassification: computed,
    config,
  }).effectiveAbsoluteSignalTrust;
}

export function resolveHybridTrustActivationDecision(input: {
  organizationId?: string | null;
  vehicleId?: string | null;
  computedHybridClassification: RawFuelAbsoluteSignalTrust;
  config?: HybridTrustActivationConfig;
}): HybridTrustActivationDecision {
  const partial = evaluateHybridTrustActivationAuthorization(input);
  const effectiveAbsoluteSignalTrust = deriveEffectiveAbsoluteSignalTrust(
    partial.computedHybridClassification,
    partial.activationAuthorized,
  );
  return { ...partial, effectiveAbsoluteSignalTrust };
}
