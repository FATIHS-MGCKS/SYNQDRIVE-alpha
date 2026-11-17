/** Runtime feature gate — default OFF in all environments for P3-PR1 foundation. */
export function isCoreAppM2mEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CORE_APP_M2M_ENABLED?.trim().toLowerCase() === 'true';
}

/** Explicit operator attestation — never implied by CORE_APP_M2M_ENABLED alone. */
export function isCoreAppM2mProductionReady(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isCoreAppM2mEnabled(env)) {
    return false;
  }
  return env.CORE_APP_M2M_PRODUCTION_READY?.trim().toLowerCase() === 'true';
}

export function isCoreAppM2mProductionNodeEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NODE_ENV ?? 'development').toLowerCase() === 'production';
}

/**
 * Token issuance gate: enabled flag always required; in production also requires PRODUCTION_READY.
 */
export function isCoreAppM2mTokenIssuanceAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!isCoreAppM2mEnabled(env)) {
    return false;
  }
  if (isCoreAppM2mProductionNodeEnv(env)) {
    return isCoreAppM2mProductionReady(env);
  }
  return true;
}

/** Resource route JWT verification — same production readiness gate as token issuance. */
export function isCoreAppM2mResourceJwtVerificationAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return isCoreAppM2mTokenIssuanceAllowed(env);
}