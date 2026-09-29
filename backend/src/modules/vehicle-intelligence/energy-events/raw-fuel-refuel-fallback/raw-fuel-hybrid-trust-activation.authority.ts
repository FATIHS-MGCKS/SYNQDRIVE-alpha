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

export interface ParsedHybridTrustUuidAllowlist {
  ids: ReadonlySet<string>;
  /** false when the raw string contained any malformed non-empty token */
  parseValid: boolean;
}

export interface HybridTrustActivationConfig {
  activationPolicyVersion: string;
  activationMode: HybridTrustActivationMode;
  allowedOrganizationIds: ReadonlySet<string>;
  allowedVehicleIds: ReadonlySet<string>;
  organizationAllowlistParseValid: boolean;
  vehicleAllowlistParseValid: boolean;
}

export interface HybridTrustActivationDecision {
  activationPolicyVersion: string;
  activationMode: HybridTrustActivationMode;
  activationAuthorized: boolean;
  activationScopeType: HybridTrustActivationScopeType;
  computedHybridClassification: RawFuelAbsoluteSignalTrust;
  effectiveAbsoluteSignalTrust: RawFuelAbsoluteSignalTrust;
}

export interface PromotionTimeHybridTrustDecision extends HybridTrustActivationDecision {
  tenantConsistent: boolean;
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

/**
 * Fail-closed: any malformed non-empty token invalidates the entire allowlist.
 */
export function parseHybridTrustActivationUuidAllowlist(
  raw: string | undefined,
): ParsedHybridTrustUuidAllowlist {
  if (raw == null || raw.trim() === '') {
    return { ids: new Set(), parseValid: true };
  }
  const ids = new Set<string>();
  let sawMalformed = false;
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (!UUID_RE.test(trimmed)) {
      sawMalformed = true;
      continue;
    }
    ids.add(trimmed.toLowerCase());
  }
  if (sawMalformed) {
    return { ids: new Set(), parseValid: false };
  }
  return { ids, parseValid: true };
}

export function loadHybridTrustActivationConfig(
  env: NodeJS.ProcessEnv = process.env,
): HybridTrustActivationConfig {
  const activationMode = parseHybridTrustActivationMode(env[RFRF_HYBRID_TRUST_ACTIVATION_MODE_ENV]);
  const orgAllowlist = parseHybridTrustActivationUuidAllowlist(
    env[RFRF_HYBRID_TRUST_ALLOWED_ORGANIZATION_IDS_ENV],
  );
  const vehicleAllowlist = parseHybridTrustActivationUuidAllowlist(
    env[RFRF_HYBRID_TRUST_ALLOWED_VEHICLE_IDS_ENV],
  );
  return {
    activationPolicyVersion: RFRF_HYBRID_TRUST_ACTIVATION_POLICY_VERSION,
    activationMode,
    allowedOrganizationIds: orgAllowlist.parseValid ? orgAllowlist.ids : new Set(),
    allowedVehicleIds: vehicleAllowlist.parseValid ? vehicleAllowlist.ids : new Set(),
    organizationAllowlistParseValid: orgAllowlist.parseValid,
    vehicleAllowlistParseValid: vehicleAllowlist.parseValid,
  };
}

function normalizeId(value: string | null | undefined): string | null {
  if (!isNonEmptyString(value)) return null;
  const trimmed = value.trim();
  if (!UUID_RE.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function readComputedHybridClassificationForPromotion(
  evidenceMeta: unknown,
): RawFuelAbsoluteSignalTrust {
  const hybrid = readHybridAbsoluteSignalTrustEvidence(evidenceMeta);
  if (!hybrid) return 'UNKNOWN';
  return hybrid.computedHybridClassification;
}

/**
 * Scoped production activation — separate from observation-local hybrid semantics.
 * Fail-closed: absent/malformed mode => OFF; empty allowlists => nobody authorized.
 */
export function evaluateHybridTrustActivationAuthorization(input: {
  organizationId?: string | null;
  /** DB-authoritative vehicle organization for org allowlist matching */
  authoritativeOrganizationId?: string | null;
  vehicleId?: string | null;
  computedHybridClassification: RawFuelAbsoluteSignalTrust;
  config?: HybridTrustActivationConfig;
}): Omit<HybridTrustActivationDecision, 'effectiveAbsoluteSignalTrust'> {
  const config = input.config ?? loadHybridTrustActivationConfig();
  const computed = input.computedHybridClassification;

  let activationAuthorized = false;
  let activationScopeType: HybridTrustActivationScopeType = 'NONE';

  const scopeOrgId = normalizeId(
    input.authoritativeOrganizationId ?? input.organizationId,
  );
  const vehicleId = normalizeId(input.vehicleId);

  if (config.activationMode === 'ALPHA_ALLOWLIST') {
    if (
      config.organizationAllowlistParseValid &&
      scopeOrgId &&
      config.allowedOrganizationIds.size > 0 &&
      config.allowedOrganizationIds.has(scopeOrgId)
    ) {
      activationAuthorized = true;
      activationScopeType = 'ORGANIZATION';
    } else if (
      config.vehicleAllowlistParseValid &&
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

export function resolveHybridTrustActivationDecision(input: {
  organizationId?: string | null;
  authoritativeOrganizationId?: string | null;
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

/**
 * Promotion-time activation decision from persisted hybrid provenance + DB vehicle ownership.
 * Never uses candidate.absoluteSignalTrust. Tenant mismatch => fail closed (UNKNOWN).
 */
export function resolvePromotionTimeHybridTrustDecision(input: {
  candidate: Pick<
    RawRefuelCandidate,
    'organizationId' | 'vehicleId' | 'evidenceMeta'
  >;
  authoritativeVehicleOrganizationId: string | null;
  config?: HybridTrustActivationConfig;
}): PromotionTimeHybridTrustDecision {
  const config = input.config ?? loadHybridTrustActivationConfig();
  const computed = readComputedHybridClassificationForPromotion(input.candidate.evidenceMeta);
  const tenantConsistent =
    input.authoritativeVehicleOrganizationId != null &&
    input.candidate.organizationId === input.authoritativeVehicleOrganizationId;

  if (!tenantConsistent) {
    return {
      activationPolicyVersion: config.activationPolicyVersion,
      activationMode: config.activationMode,
      activationAuthorized: false,
      activationScopeType: 'NONE',
      computedHybridClassification: computed,
      effectiveAbsoluteSignalTrust: 'UNKNOWN',
      tenantConsistent: false,
    };
  }

  const decision = resolveHybridTrustActivationDecision({
    authoritativeOrganizationId: input.authoritativeVehicleOrganizationId,
    vehicleId: input.candidate.vehicleId,
    computedHybridClassification: computed,
    config,
  });

  return { ...decision, tenantConsistent: true };
}

/**
 * Monotonic combine: caller context may only restrict, never elevate promotion authority.
 */
export function combineAuthoritativeAndContextPromotionTrust(
  authoritative: RawFuelAbsoluteSignalTrust,
  contextTrust?: RawFuelAbsoluteSignalTrust | null,
): RawFuelAbsoluteSignalTrust {
  if (contextTrust == null) return authoritative;
  const rank = (trust: RawFuelAbsoluteSignalTrust): number =>
    trust === 'UNTRUSTED' ? 0 : trust === 'UNKNOWN' ? 1 : 2;
  return rank(contextTrust) < rank(authoritative) ? contextTrust : authoritative;
}

/**
 * @deprecated Prefer resolvePromotionTimeHybridTrustDecision with DB vehicle ownership at promotion.
 */
export function resolveEffectivePromotionTrustForCandidate(
  candidate: Pick<
    RawRefuelCandidate,
    'organizationId' | 'vehicleId' | 'evidenceMeta' | 'absoluteSignalTrust'
  >,
  config?: HybridTrustActivationConfig,
): RawFuelAbsoluteSignalTrust {
  return resolvePromotionTimeHybridTrustDecision({
    candidate,
    authoritativeVehicleOrganizationId: candidate.organizationId,
    config,
  }).effectiveAbsoluteSignalTrust;
}
