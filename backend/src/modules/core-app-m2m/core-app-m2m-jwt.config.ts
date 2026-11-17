import { isCoreAppM2mEnabled } from './core-app-m2m.config';

export const CORE_APP_M2M_JWT_ISSUER_DEFAULT = 'synqdrive:core-app-m2m' as const;
export const CORE_APP_M2M_JWT_AUDIENCE_DEFAULT = 'synqdrive:platform-api' as const;
export const CORE_APP_M2M_TOKEN_TTL_SECONDS_DEFAULT = 900;
export const CORE_APP_M2M_TOKEN_TYPE = 'core_app_service' as const;
export const CORE_APP_M2M_TOKEN_CONTRACT_VERSION = 'core.app.token.v1' as const;

export const CORE_APP_M2M_TOKEN_MAX_CLIENT_ID_LENGTH = 128;
export const CORE_APP_M2M_TOKEN_MAX_SECRET_LENGTH = 256;
export const CORE_APP_M2M_TOKEN_MAX_SCOPES = 16;

/** Fail-closed: when M2M runtime is enabled, signing requires an explicit non-empty secret (never user JWT secret). */
export function resolveCoreAppM2mJwtSigningSecret(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!isCoreAppM2mEnabled(env)) {
    return null;
  }
  const secret = env.CORE_APP_M2M_JWT_SECRET?.trim();
  if (!secret) {
    return null;
  }
  const userJwtSecret = env.JWT_SECRET?.trim();
  if (userJwtSecret && secret === userJwtSecret) {
    return null;
  }
  return secret;
}

export function resolveCoreAppM2mJwtIssuer(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CORE_APP_M2M_JWT_ISSUER?.trim();
  return raw || CORE_APP_M2M_JWT_ISSUER_DEFAULT;
}

export function resolveCoreAppM2mJwtAudience(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.CORE_APP_M2M_JWT_AUDIENCE?.trim();
  return raw || CORE_APP_M2M_JWT_AUDIENCE_DEFAULT;
}

export function resolveCoreAppM2mTokenTtlSeconds(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.CORE_APP_M2M_TOKEN_TTL_SECONDS?.trim();
  if (!raw) {
    return CORE_APP_M2M_TOKEN_TTL_SECONDS_DEFAULT;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 60 || n > 3600) {
    return CORE_APP_M2M_TOKEN_TTL_SECONDS_DEFAULT;
  }
  return n;
}