import type { AuthorizationDecisionConfig } from './authorization-decision.config';

export interface AuthorizationDecisionConfigValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export function validateAuthorizationDecisionConfig(
  config: AuthorizationDecisionConfig,
  env: NodeJS.ProcessEnv = process.env,
): AuthorizationDecisionConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = (env.NODE_ENV ?? '').toLowerCase() === 'production';

  if (isProd) {
    if (config.devBypassEnabled) {
      errors.push(
        'DATA_AUTH_DECISION_DEV_BYPASS must be false in production (fail-closed)',
      );
    }
    if (!config.enforcementEnabled) {
      errors.push(
        'DATA_AUTH_DECISION_ENFORCEMENT_ENABLED must be true in production',
      );
    }
    if (config.globalDenySwitch) {
      warnings.push(
        'DATA_AUTH_DECISION_GLOBAL_DENY is active — all protected access will be denied',
      );
    }
  } else {
    if (config.devBypassEnabled) {
      warnings.push(
        'Development bypass active — protected access may be allowed without policy match',
      );
    }
    if (!config.enforcementEnabled) {
      warnings.push('Decision enforcement disabled — development only');
    }
  }

  if (config.cacheTtlMs < 1_000) {
    warnings.push('Cache TTL below 1s may increase resolver load on ingestion');
  }

  return { ok: errors.length === 0, errors, warnings };
}
