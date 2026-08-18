import { describe, expect, it } from 'vitest';
import {
  migratePlatformIntegrationsParams,
  readPlatformIntegrationsLocation,
  syncPlatformIntegrationsUrl,
} from './platform-integrations-url';

describe('platform-integrations-url', () => {
  it('migrates view=settings to platform-integrations hub', () => {
    const next = migratePlatformIntegrationsParams('?view=settings');
    expect(next).toContain('view=platform-integrations');
    expect(next).toContain('platformIntegrations=settings');
    expect(next).not.toContain('settingsTab');
  });

  it('migrates settings email tab to communication category', () => {
    const next = migratePlatformIntegrationsParams('?view=settings&settingsTab=email');
    expect(next).toContain('view=platform-integrations');
    expect(next).toContain('platformIntegrations=settings');
    expect(next).toContain('settingsCategory=communication');
  });

  it('migrates settings integrations tab to integrations section', () => {
    const next = migratePlatformIntegrationsParams('?view=settings&settingsTab=integrations');
    expect(next).toContain('platformIntegrations=integrations');
  });

  it('reads platform integrations location from search', () => {
    const loc = readPlatformIntegrationsLocation(
      '?view=platform-integrations&platformIntegrations=integrations&integrationId=stripe&attentionOnly=1',
    );
    expect(loc.section).toBe('integrations');
    expect(loc.integrationId).toBe('stripe');
    expect(loc.attentionOnly).toBe(true);
  });

  it('defaults invalid section to overview', () => {
    const loc = readPlatformIntegrationsLocation('?view=platform-integrations&platformIntegrations=invalid');
    expect(loc.section).toBe('overview');
  });
});

describe('syncPlatformIntegrationsUrl', () => {
  it('is a function', () => {
    expect(typeof syncPlatformIntegrationsUrl).toBe('function');
  });
});
