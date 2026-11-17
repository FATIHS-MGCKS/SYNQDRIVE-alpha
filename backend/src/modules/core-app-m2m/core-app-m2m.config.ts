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