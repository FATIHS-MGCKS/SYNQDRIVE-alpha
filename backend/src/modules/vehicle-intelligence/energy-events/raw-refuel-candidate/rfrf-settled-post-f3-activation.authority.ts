/** Pure activation authority types/parser — not read from Production detector runtime in R1. */
export const RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1 =
  'rfrf-settled-post-f3-activation-v1' as const;

export type RfrfSettledPostF3ActivationMode =
  | 'OFF'
  | 'SHADOW'
  | 'ALPHA_ALLOWLIST'
  | 'GLOBAL';

export interface RfrfSettledPostF3AlphaAllowlistScope {
  organizationIds: readonly string[];
  vehicleIds: readonly string[];
}

export interface ParsedRfrfSettledPostF3Activation {
  authorityVersion: typeof RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1;
  mode: RfrfSettledPostF3ActivationMode;
  valid: boolean;
  invalidReason: string | null;
  alphaScope: RfrfSettledPostF3AlphaAllowlistScope | null;
}

export const RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV = 'RFRF_SETTLED_POST_F3_ACTIVATION_MODE';
export const RFRF_SETTLED_POST_F3_ALPHA_SCOPE_JSON_ENV =
  'RFRF_SETTLED_POST_F3_ALPHA_SCOPE_JSON';

const RECOGNIZED_MODES: ReadonlySet<string> = new Set([
  'OFF',
  'SHADOW',
  'ALPHA_ALLOWLIST',
  'GLOBAL',
]);

function parseAlphaScopeJson(raw: string | undefined): {
  ok: true;
  scope: RfrfSettledPostF3AlphaAllowlistScope;
} | { ok: false; reason: string } {
  if (raw == null || raw.trim().length === 0) {
    return { ok: false, reason: 'alpha_scope_missing' };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, reason: 'alpha_scope_not_object' };
    }
    const orgRaw = (parsed as { organizationIds?: unknown }).organizationIds;
    const vehRaw = (parsed as { vehicleIds?: unknown }).vehicleIds;
    if (!Array.isArray(orgRaw) || !Array.isArray(vehRaw)) {
      return { ok: false, reason: 'alpha_scope_shape_invalid' };
    }
    const organizationIds = orgRaw.filter((v): v is string => typeof v === 'string' && v.length > 0);
    const vehicleIds = vehRaw.filter((v): v is string => typeof v === 'string' && v.length > 0);
    if (organizationIds.length === 0 && vehicleIds.length === 0) {
      return { ok: false, reason: 'alpha_scope_empty' };
    }
    return { ok: true, scope: { organizationIds, vehicleIds } };
  } catch {
    return { ok: false, reason: 'alpha_scope_json_malformed' };
  }
}

/**
 * Fail-closed parser for tests and future wiring.
 * GLOBAL is recognized but not authorized in R1 — maps to OFF/invalid.
 */
export function parseRfrfSettledPostF3Activation(
  env: Record<string, string | undefined> = {},
): ParsedRfrfSettledPostF3Activation {
  const rawMode = env[RFRF_SETTLED_POST_F3_ACTIVATION_MODE_ENV];
  if (rawMode == null || rawMode.trim().length === 0) {
    return {
      authorityVersion: RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1,
      mode: 'OFF',
      valid: true,
      invalidReason: null,
      alphaScope: null,
    };
  }

  const normalized = rawMode.trim().toUpperCase();
  if (!RECOGNIZED_MODES.has(normalized)) {
    return {
      authorityVersion: RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1,
      mode: 'OFF',
      valid: false,
      invalidReason: 'unknown_activation_mode',
      alphaScope: null,
    };
  }

  if (normalized === 'OFF') {
    return {
      authorityVersion: RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1,
      mode: 'OFF',
      valid: true,
      invalidReason: null,
      alphaScope: null,
    };
  }

  if (normalized === 'SHADOW') {
    return {
      authorityVersion: RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1,
      mode: 'SHADOW',
      valid: true,
      invalidReason: null,
      alphaScope: null,
    };
  }

  if (normalized === 'GLOBAL') {
    return {
      authorityVersion: RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1,
      mode: 'OFF',
      valid: false,
      invalidReason: 'global_mode_not_authorized_in_r1',
      alphaScope: null,
    };
  }

  if (normalized === 'ALPHA_ALLOWLIST') {
    const scopeParse = parseAlphaScopeJson(env[RFRF_SETTLED_POST_F3_ALPHA_SCOPE_JSON_ENV]);
    if (!scopeParse.ok) {
      return {
        authorityVersion: RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1,
        mode: 'OFF',
        valid: false,
        invalidReason: scopeParse.reason,
        alphaScope: null,
      };
    }
    return {
      authorityVersion: RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1,
      mode: 'ALPHA_ALLOWLIST',
      valid: true,
      invalidReason: null,
      alphaScope: scopeParse.scope,
    };
  }

  return {
    authorityVersion: RFRF_SETTLED_POST_F3_ACTIVATION_AUTHORITY_V1,
    mode: 'OFF',
    valid: false,
    invalidReason: 'unreachable_mode',
    alphaScope: null,
  };
}

/** Hybrid Trust activation env must not affect settled-post F3 activation parsing (R1). */
export function parseRfrfSettledPostF3ActivationIgnoringHybridEnv(
  env: Record<string, string | undefined>,
): ParsedRfrfSettledPostF3Activation {
  const stripped = { ...env };
  delete stripped.RFRF_HYBRID_ABSOLUTE_TRUST_ACTIVATION_ENABLED;
  delete stripped.RFRF_HYBRID_TRUST_ACTIVATION_ENABLED;
  return parseRfrfSettledPostF3Activation(stripped);
}
