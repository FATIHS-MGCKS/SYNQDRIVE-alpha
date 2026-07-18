import { describe, expect, it } from '@jest/globals';
import {
  deriveOverallPlatformHealth,
  deriveProviderHealthState,
  healthStateLabel,
} from './voice-platform-health.util';

describe('voice-platform-health.util', () => {
  it('maps provider states', () => {
    expect(deriveProviderHealthState({ configured: false, healthy: false })).toBe('not_configured');
    expect(deriveProviderHealthState({ configured: true, healthy: true })).toBe('healthy');
    expect(deriveProviderHealthState({ configured: true, healthy: false, degraded: true })).toBe('degraded');
    expect(deriveProviderHealthState({ configured: true, healthy: false, explicitlyDisabled: true })).toBe('disabled');
  });

  it('derives overall incident from critical incidents', () => {
    expect(
      deriveOverallPlatformHealth({
        providerStates: ['healthy', 'degraded'],
        hasCriticalIncident: true,
        hasWarningIncident: false,
      }),
    ).toBe('incident');
  });

  it('labels health states', () => {
    expect(healthStateLabel('healthy')).toBe('Healthy');
    expect(healthStateLabel('not_configured')).toBe('Not configured');
  });
});
