/**
 * Dedicated server-side secret for evaluations person pseudonymization (E5.1B).
 *
 * It is read from `EVALUATIONS_PSEUDONYM_SECRET` and is NEVER an unrelated
 * JWT/session secret and NEVER exposed via any API. Production MUST configure
 * this secret (see backend/.env.example). A fixed dev-only fallback keeps local
 * tests deterministic; it must not be used in production.
 */
const DEV_ONLY_FALLBACK =
  'evaluations-pseudonym-dev-only-secret-do-not-use-in-production';

export function getEvaluationsPseudonymSecret(): string {
  const secret = process.env.EVALUATIONS_PSEUDONYM_SECRET?.trim();
  return secret && secret.length > 0 ? secret : DEV_ONLY_FALLBACK;
}
