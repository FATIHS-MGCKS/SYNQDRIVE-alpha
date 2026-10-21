import { registerAs } from '@nestjs/config';
import { normalizeConnectivityProvider } from '../modules/dimo/device-connection-physical-state/device-connection-physical-state.binding';
import type {
  ShadowPilotScopeConfigEntry,
  ShadowPilotScopeConfigParseResult,
} from '../modules/dimo/device-connection-physical-state/physical-state-shadow-pilot-scope.types';

export const CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON_ENV =
  'CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON';

export const CONNECTIVITY_PHYSICAL_STATE_SHADOW_OBSERVATION_RETENTION_DAYS_ENV =
  'CONNECTIVITY_PHYSICAL_STATE_SHADOW_OBSERVATION_RETENTION_DAYS';

const DEFAULT_SHADOW_OBSERVATION_RETENTION_DAYS = 90;
const PILOT_SCOPE_CANONICAL_KEYS = new Set(['organizationId', 'vehicleId', 'provider']);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasOnlyCanonicalPilotScopeKeys(record: Record<string, unknown>): boolean {
  return Object.keys(record).every((key) => PILOT_SCOPE_CANONICAL_KEYS.has(key));
}

function scopeIdentityKey(scope: ShadowPilotScopeConfigEntry): string {
  return `${scope.organizationId}\u0000${scope.vehicleId}\u0000${scope.provider}`;
}

export function parseShadowPilotScopesJson(
  raw: string | undefined,
): ShadowPilotScopeConfigParseResult {
  if (raw == null || raw.trim().length === 0) {
    return { ok: true, scopes: [], configInvalid: false };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, scopes: [], configInvalid: true, reason: 'MALFORMED_JSON' };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, scopes: [], configInvalid: true, reason: 'MALFORMED_JSON' };
  }

  const scopes: ShadowPilotScopeConfigEntry[] = [];
  const seen = new Set<string>();

  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return { ok: false, scopes: [], configInvalid: true, reason: 'INVALID_ENTRY' };
    }

    const record = entry as Record<string, unknown>;
    if (!hasOnlyCanonicalPilotScopeKeys(record)) {
      return { ok: false, scopes: [], configInvalid: true, reason: 'INVALID_ENTRY' };
    }

    if (
      !isNonEmptyString(record.organizationId) ||
      !isNonEmptyString(record.vehicleId) ||
      !isNonEmptyString(record.provider)
    ) {
      return { ok: false, scopes: [], configInvalid: true, reason: 'EMPTY_IDENTIFIERS' };
    }

    const normalized: ShadowPilotScopeConfigEntry = {
      organizationId: record.organizationId.trim(),
      vehicleId: record.vehicleId.trim(),
      provider: normalizeConnectivityProvider(record.provider),
    };

    if (
      normalized.organizationId === '*' ||
      normalized.vehicleId === '*' ||
      normalized.provider === '*'
    ) {
      return { ok: false, scopes: [], configInvalid: true, reason: 'INVALID_ENTRY' };
    }

    const key = scopeIdentityKey(normalized);
    if (!seen.has(key)) {
      seen.add(key);
      scopes.push(normalized);
    }
  }

  return { ok: true, scopes, configInvalid: false };
}

export function loadShadowPilotScopesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ShadowPilotScopeConfigParseResult {
  return parseShadowPilotScopesJson(env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_PILOT_SCOPES_JSON_ENV]);
}

export function parseShadowObservationRetentionDays(
  raw: string | undefined,
): number {
  if (!raw?.trim()) return DEFAULT_SHADOW_OBSERVATION_RETENTION_DAYS;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return DEFAULT_SHADOW_OBSERVATION_RETENTION_DAYS;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 7) {
    return DEFAULT_SHADOW_OBSERVATION_RETENTION_DAYS;
  }
  return parsed;
}

export function loadShadowObservationRetentionDaysFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): number {
  return parseShadowObservationRetentionDays(
    env[CONNECTIVITY_PHYSICAL_STATE_SHADOW_OBSERVATION_RETENTION_DAYS_ENV],
  );
}

export default registerAs('connectivityPhysicalStateShadowPilotScope', () => ({
  pilotScopes: loadShadowPilotScopesFromEnv(),
  observationRetentionDays: loadShadowObservationRetentionDaysFromEnv(),
}));
