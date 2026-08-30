import { resolveDimoProviderLimiterConfig } from '@config/dimo-provider-limiter.config';
import {
  isCanaryEnforcedRequest,
  isCanaryRolloutConfigured,
  resolveCanaryEnforcement,
  resolveEffectiveLimiterMode,
  resolveRolloutState,
} from './dimo-provider-rollout.util';
import { isInCanaryPercentBucket } from './dimo-provider-canary-hash.util';

function configFromEnv(env: Record<string, string>) {
  return resolveDimoProviderLimiterConfig(env as NodeJS.ProcessEnv);
}

describe('dimo-provider-rollout.util (S4)', () => {
  it('default production config resolves to shadow rollout', () => {
    const config = configFromEnv({});
    expect(config.mode).toBe('shadow');
    expect(config.enforceCanaryEnabled).toBe(false);
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
    expect(isCanaryEnforcedRequest(config, { organizationId: 'org-canary' })).toBe(true);
    expect(isCanaryEnforcedRequest(config, { organizationId: 'org-other' })).toBe(false);
  });

  it('new enforce canary org env merges with legacy org env', () => {
    const config = configFromEnv({
      DIMO_PROVIDER_ENFORCE_CANARY_ORG_IDS: 'org-new',
      DIMO_PROVIDER_CANARY_ENFORCE_ORG_IDS: 'org-legacy',
    });
    expect(config.canaryEnforceOrgIds.has('org-new')).toBe(true);
    expect(config.canaryEnforceOrgIds.has('org-legacy')).toBe(true);
    expect(resolveEffectiveLimiterMode(config, 'org-new')).toBe('enforce');
    expect(resolveEffectiveLimiterMode(config, 'org-legacy')).toBe('enforce');
  });

  it('vehicle allowlist enforces when enforceCanaryEnabled=true', () => {
    const config = configFromEnv({
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_VEHICLE_IDS: 'veh-1,veh-2',
    });
    expect(isCanaryRolloutConfigured(config)).toBe(true);
    const resolution = resolveCanaryEnforcement(config, { vehicleId: 'veh-1' });
    expect(resolution.effectiveMode).toBe('enforce');
    expect(resolution.canaryReason).toBe('vehicle_allowlist');
    expect(resolveCanaryEnforcement(config, { vehicleId: 'veh-other' }).effectiveMode).toBe('shadow');
  });

  it('percent canary requires enforceCanaryEnabled=true', () => {
    const config = configFromEnv({
      DIMO_PROVIDER_ENFORCE_CANARY_PERCENT: '25',
    });
    expect(isCanaryRolloutConfigured(config)).toBe(false);
    expect(resolveCanaryEnforcement(config, { vehicleId: 'veh-x' }).effectiveMode).toBe('shadow');

    const enabled = configFromEnv({
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_PERCENT: '25',
    });
    expect(isCanaryRolloutConfigured(enabled)).toBe(true);
    const vehicleIn = 'vehicle-in-canary';
    const vehicleOut = 'vehicle-out-canary';
    expect(isInCanaryPercentBucket(vehicleIn, 25)).toBe(
      resolveCanaryEnforcement(enabled, { vehicleId: vehicleIn }).canaryMatch,
    );
    if (!isInCanaryPercentBucket(vehicleOut, 25)) {
      expect(resolveCanaryEnforcement(enabled, { vehicleId: vehicleOut }).canaryMatch).toBe(false);
    }
  });

  it('percent canary uses vehicleId before organizationId', () => {
    const config = configFromEnv({
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_PERCENT: '50',
    });
    const vehicleId = 'veh-priority-test';
    const orgId = 'org-fallback';
    const resolution = resolveCanaryEnforcement(config, { vehicleId, organizationId: orgId });
    const vehicleOnly = resolveCanaryEnforcement(config, { vehicleId });
    expect(resolution.canaryMatch).toBe(vehicleOnly.canaryMatch);
    expect(resolution.canaryHashBucket).toBe(vehicleOnly.canaryHashBucket);
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

  it('canary 0% and 100% boundaries', () => {
    const zero = configFromEnv({
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_PERCENT: '0',
    });
    expect(isCanaryRolloutConfigured(zero)).toBe(false);

    const hundred = configFromEnv({
      DIMO_PROVIDER_ENFORCE_CANARY_ENABLED: 'true',
      DIMO_PROVIDER_ENFORCE_CANARY_PERCENT: '100',
    });
    expect(resolveCanaryEnforcement(hundred, { vehicleId: 'any-vehicle' }).canaryMatch).toBe(true);
  });
});
