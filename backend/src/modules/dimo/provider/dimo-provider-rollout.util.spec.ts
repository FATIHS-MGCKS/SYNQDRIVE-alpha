import { resolveDimoProviderLimiterConfig } from '@config/dimo-provider-limiter.config';
import {
  isCanaryEnforcedRequest,
  resolveEffectiveLimiterMode,
  resolveRolloutState,
} from './dimo-provider-rollout.util';

function configFromEnv(env: Record<string, string>) {
  return resolveDimoProviderLimiterConfig(env as NodeJS.ProcessEnv);
}

describe('dimo-provider-rollout.util (S4)', () => {
  it('default production config resolves to shadow rollout', () => {
    const config = configFromEnv({});
    expect(config.mode).toBe('shadow');
    expect(resolveRolloutState(config)).toBe('shadow');
    expect(resolveEffectiveLimiterMode(config, 'org-a')).toBe('shadow');
  });

  it('mode=enforce resolves to global_enforce', () => {
    const config = configFromEnv({ DIMO_PROVIDER_LIMITER_MODE: 'enforce' });
    expect(resolveRolloutState(config)).toBe('global_enforce');
    expect(resolveEffectiveLimiterMode(config, 'org-a')).toBe('enforce');
  });

  it('canary org allowlist enforces only listed orgs when mode=shadow', () => {
    const config = configFromEnv({
      DIMO_PROVIDER_LIMITER_MODE: 'shadow',
      DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS: 'org-canary,org-beta',
    });
    expect(resolveRolloutState(config)).toBe('canary_enforce');
    expect(resolveEffectiveLimiterMode(config, 'org-canary')).toBe('enforce');
    expect(resolveEffectiveLimiterMode(config, 'org-other')).toBe('shadow');
    expect(isCanaryEnforcedRequest(config, 'org-canary')).toBe(true);
    expect(isCanaryEnforcedRequest(config, 'org-other')).toBe(false);
  });

  it('rollback to shadow clears canary enforce semantics', () => {
    const canary = configFromEnv({
      DIMO_PROVIDER_LIMITER_MODE: 'shadow',
      DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS: 'org-canary',
    });
    const rolledBack = configFromEnv({ DIMO_PROVIDER_LIMITER_MODE: 'shadow' });
    expect(resolveEffectiveLimiterMode(canary, 'org-canary')).toBe('enforce');
    expect(resolveEffectiveLimiterMode(rolledBack, 'org-canary')).toBe('shadow');
  });

  it('global enforce rollback to shadow without code deploy', () => {
    const global = configFromEnv({ DIMO_PROVIDER_LIMITER_MODE: 'enforce' });
    const shadow = configFromEnv({ DIMO_PROVIDER_LIMITER_MODE: 'shadow' });
    expect(resolveRolloutState(global)).toBe('global_enforce');
    expect(resolveRolloutState(shadow)).toBe('shadow');
  });
});
