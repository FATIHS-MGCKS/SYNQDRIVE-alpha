import { readAuthorizationDecisionConfig } from './authorization-decision.config';
import { validateAuthorizationDecisionConfig } from './authorization-decision.config-validator';

describe('validateAuthorizationDecisionConfig', () => {
  it('rejects dev bypass in production', () => {
    const config = readAuthorizationDecisionConfig({
      NODE_ENV: 'production',
      DATA_AUTH_DECISION_DEV_BYPASS: 'true',
      DATA_AUTH_DECISION_ENFORCEMENT_ENABLED: 'true',
    });
    const result = validateAuthorizationDecisionConfig(config, { NODE_ENV: 'production' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('DEV_BYPASS'))).toBe(true);
  });

  it('rejects disabled enforcement in production', () => {
    const config = readAuthorizationDecisionConfig({
      NODE_ENV: 'production',
      DATA_AUTH_DECISION_ENFORCEMENT_ENABLED: 'false',
    });
    const result = validateAuthorizationDecisionConfig(config, { NODE_ENV: 'production' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ENFORCEMENT_ENABLED'))).toBe(true);
  });

  it('allows dev bypass warning in development', () => {
    const config = readAuthorizationDecisionConfig({
      NODE_ENV: 'development',
      DATA_AUTH_DECISION_DEV_BYPASS: 'true',
    });
    const result = validateAuthorizationDecisionConfig(config, { NODE_ENV: 'development' });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('Development bypass'))).toBe(true);
  });
});
