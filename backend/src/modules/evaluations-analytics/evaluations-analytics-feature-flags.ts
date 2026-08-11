/**
 * Feature-flag contract for the tenant-safe analytics foundation (E2).
 *
 * The foundation ships dark: `EVALUATIONS_ANALYTICS_V2_MODE` defaults to `off`,
 * which makes the analytics foundation routes invisible (fail-closed 404). This
 * mirrors the Stations-V2 multi-mode flag convention.
 */
export const EVALUATIONS_ANALYTICS_V2_MODE_ENV = 'EVALUATIONS_ANALYTICS_V2_MODE';

export const EVALUATIONS_ANALYTICS_V2_MODES = ['off', 'shadow', 'on'] as const;
export type EvaluationsAnalyticsV2Mode =
  (typeof EVALUATIONS_ANALYTICS_V2_MODES)[number];

export function resolveEvaluationsAnalyticsV2Mode(
  env: NodeJS.ProcessEnv = process.env,
): EvaluationsAnalyticsV2Mode {
  const raw = (env[EVALUATIONS_ANALYTICS_V2_MODE_ENV] ?? '').trim().toLowerCase();
  if ((EVALUATIONS_ANALYTICS_V2_MODES as readonly string[]).includes(raw)) {
    return raw as EvaluationsAnalyticsV2Mode;
  }
  return 'off';
}

/** The feature is reachable over HTTP only in `shadow` or `on`. */
export function isEvaluationsAnalyticsV2Enabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return resolveEvaluationsAnalyticsV2Mode(env) !== 'off';
}
