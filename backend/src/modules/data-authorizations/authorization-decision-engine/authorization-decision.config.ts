export interface AuthorizationDecisionConfig {
  enforcementEnabled: boolean;
  devBypassEnabled: boolean;
  globalDenySwitch: boolean;
  cacheEnabled: boolean;
  cacheTtlMs: number;
  cacheMaxEntries: number;
  auditEnabled: boolean;
}

export function readAuthorizationDecisionConfig(
  env: NodeJS.ProcessEnv = process.env,
): AuthorizationDecisionConfig {
  const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';

  return {
    enforcementEnabled: parseBool(env.DATA_AUTH_DECISION_ENFORCEMENT_ENABLED, isProd ? true : true),
    devBypassEnabled: parseBool(env.DATA_AUTH_DECISION_DEV_BYPASS, false),
    globalDenySwitch: parseBool(env.DATA_AUTH_DECISION_GLOBAL_DENY, false),
    cacheEnabled: parseBool(env.DATA_AUTH_DECISION_CACHE_ENABLED, true),
    cacheTtlMs: parsePositiveInt(
      env.DATA_AUTH_DECISION_CACHE_TTL_MS,
      30_000,
    ),
    cacheMaxEntries: parsePositiveInt(
      env.DATA_AUTH_DECISION_CACHE_MAX_ENTRIES,
      10_000,
    ),
    auditEnabled: parseBool(env.DATA_AUTH_DECISION_AUDIT_ENABLED, true),
  };
}

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value == null || value.trim() === '') return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parsePositiveInt(value: string | undefined, defaultValue: number): number {
  if (value == null || value.trim() === '') return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}
