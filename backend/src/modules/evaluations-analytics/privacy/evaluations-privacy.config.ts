/**
 * Dedicated server-side secret for evaluations person pseudonymization (E5.1B),
 * with environment-aware fail-closed resolution (E5.2).
 *
 * Convention: mirrors the platform's per-feature config pattern (`registerAs`
 * factories reading `process.env.NODE_ENV`, e.g. `stripe.config.ts`). There is no
 * global startup secret-validation schema on `ConfigModule.forRoot`, so config is
 * validated lazily per capability. Accordingly this uses the "capability
 * fail-closed" model: in production a missing/empty/placeholder/insufficient
 * secret makes secure pseudonymization UNAVAILABLE (the pseudonymous disclosure
 * path fails closed); it never silently falls back to the development key.
 *
 * The secret is NEVER an unrelated JWT/session secret, is NEVER logged, exposed in
 * errors, or included in audit metadata, and there is no reverse-lookup API.
 */

/**
 * Fixed development/test fallback. It is deterministic so local tests are stable,
 * and is explicitly rejected in production at runtime (not merely by comment).
 */
export const EVALUATIONS_PSEUDONYM_DEV_FALLBACK_SECRET =
  'evaluations-pseudonym-dev-only-secret-do-not-use-in-production';

/**
 * Minimum length required for a configured PRODUCTION secret. This is a floor to
 * reject obviously trivial keys — it is NOT a claim that length proves entropy.
 * Operators must supply a high-entropy random key (see backend/.env.example).
 */
export const EVALUATIONS_PSEUDONYM_MIN_PRODUCTION_SECRET_LENGTH = 32;

export type EvaluationsPseudonymSecretUnavailableReason =
  | 'MISSING'
  | 'EMPTY'
  | 'DEV_FALLBACK_IN_PRODUCTION'
  | 'INSUFFICIENT';

export type EvaluationsPseudonymSecretResolution =
  | { readonly ok: true; readonly secret: string; readonly source: 'configured' | 'development-fallback' }
  | { readonly ok: false; readonly reason: EvaluationsPseudonymSecretUnavailableReason };

function looksLikePlaceholder(secret: string): boolean {
  if (secret === EVALUATIONS_PSEUDONYM_DEV_FALLBACK_SECRET) return true;
  const lowered = secret.toLowerCase();
  return (
    lowered.includes('dev-only') ||
    lowered.includes('do-not-use') ||
    lowered.includes('changeme') ||
    lowered.includes('change-me') ||
    lowered.includes('placeholder') ||
    lowered.includes('example') ||
    lowered.includes('your-secret') ||
    lowered.includes('replace-me')
  );
}

function isProductionEnv(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV || 'development') === 'production';
}

/**
 * Resolve the pseudonym secret without ever exposing its value in the failure
 * path. In non-production, a deterministic dev fallback is permitted. In
 * production, the dev fallback and placeholder/insufficient secrets are rejected
 * (fail closed) — the secret value never appears in the returned reason.
 */
export function resolveEvaluationsPseudonymSecret(
  env: NodeJS.ProcessEnv = process.env,
): EvaluationsPseudonymSecretResolution {
  const raw = env.EVALUATIONS_PSEUDONYM_SECRET?.trim() ?? '';

  if (!isProductionEnv(env)) {
    // Development/test: use a configured secret when present, else the explicit
    // deterministic dev fallback. Never used when NODE_ENV === 'production'.
    if (raw.length > 0) return { ok: true, secret: raw, source: 'configured' };
    return {
      ok: true,
      secret: EVALUATIONS_PSEUDONYM_DEV_FALLBACK_SECRET,
      source: 'development-fallback',
    };
  }

  // Production: fail closed — never fall back to the development key.
  if (raw.length === 0) {
    return {
      ok: false,
      reason: env.EVALUATIONS_PSEUDONYM_SECRET === undefined ? 'MISSING' : 'EMPTY',
    };
  }
  if (looksLikePlaceholder(raw)) return { ok: false, reason: 'DEV_FALLBACK_IN_PRODUCTION' };
  if (raw.length < EVALUATIONS_PSEUDONYM_MIN_PRODUCTION_SECRET_LENGTH) {
    return { ok: false, reason: 'INSUFFICIENT' };
  }
  return { ok: true, secret: raw, source: 'configured' };
}

/**
 * True when a securely-usable pseudonym secret is available for the current
 * environment. Callers on the pseudonymous disclosure path must fail closed when
 * this is false.
 */
export function isEvaluationsPseudonymSecretAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveEvaluationsPseudonymSecret(env).ok;
}
