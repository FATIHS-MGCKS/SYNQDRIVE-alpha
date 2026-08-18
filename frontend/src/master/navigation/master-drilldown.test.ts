import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { applyMasterDrilldownUrl, resolveMasterDrilldownView } from './master-drilldown';

describe('resolveMasterDrilldownView', () => {
  it('maps legacy slugs to canonical views', () => {
    expect(resolveMasterDrilldownView('fleet-connection')).toBe('vehicles');
    expect(resolveMasterDrilldownView('activity-log')).toBe('security-access');
    expect(resolveMasterDrilldownView('platform-health')).toBe('platform-ops');
    expect(resolveMasterDrilldownView('settings')).toBe('platform-integrations');
  });

  it('passes through canonical views', () => {
    expect(resolveMasterDrilldownView('billing')).toBe('billing');
    expect(resolveMasterDrilldownView('vehicles')).toBe('vehicles');
  });
});

describe('applyMasterDrilldownUrl', () => {
  const pushState = vi.fn();
  const replaceState = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { pathname: '/master', search: '?view=dashboard' },
      history: { pushState, replaceState },
    });
    pushState.mockReset();
    replaceState.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses pushState by default for billing drilldowns', () => {
    const view = applyMasterDrilldownUrl('billing', { masterBilling: 'subscriptions' });
    expect(view).toBe('billing');
    expect(pushState).toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('uses replaceState when requested', () => {
    applyMasterDrilldownUrl('vehicles', { cvSection: 'overview' }, { replace: true });
    expect(replaceState).toHaveBeenCalled();
    expect(pushState).not.toHaveBeenCalled();
  });

  it('resolves fleet-connection to vehicles URL', () => {
    applyMasterDrilldownUrl('fleet-connection', { cvSection: 'overview' });
    const url = pushState.mock.calls[0]?.[2] as string;
    expect(url).toContain('view=vehicles');
    expect(url).toContain('cvSection=overview');
  });

  it('routes activity-log to security audit tab', () => {
    applyMasterDrilldownUrl('activity-log');
    const url = pushState.mock.calls[0]?.[2] as string;
    expect(url).toContain('view=security-access');
    expect(url).toContain('securityAccess=audit');
  });
});
