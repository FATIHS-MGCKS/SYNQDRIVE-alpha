import { describe, expect, it, vi } from 'vitest';
import { navigateToDataQualityRemediation } from './evaluations-data-quality-navigation';

describe('navigateToDataQualityRemediation', () => {
  it('routes invoices to invoices view', () => {
    const nav = vi.fn();
    navigateToDataQualityRemediation('invoices', nav);
    expect(nav).toHaveBeenCalledWith('invoices', undefined);
  });

  it('routes telemetry to data authorization settings', () => {
    const nav = vi.fn();
    navigateToDataQualityRemediation('data-authorization', nav);
    expect(nav).toHaveBeenCalledWith('settings', { settingsTab: 'data-authorization' });
  });

  it('routes fleet to connectivity tab', () => {
    const nav = vi.fn();
    navigateToDataQualityRemediation('fleet', nav);
    expect(nav).toHaveBeenCalledWith('fleet', { fleetTab: 'connectivity' });
  });
});
