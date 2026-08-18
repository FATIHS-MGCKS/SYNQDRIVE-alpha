import { describe, expect, it } from 'vitest';
import {
  attentionReasonLabel,
  attentionDrilldownTab,
  billingHealthLabel,
  formatRelativeDe,
} from './org.utils';

describe('master organizations utils', () => {
  it('maps attention codes to DE labels', () => {
    expect(attentionReasonLabel('PAST_DUE')).toBe('Überfällig');
    expect(attentionReasonLabel('RECONCILIATION_DRIFT')).toBe('Abgleichsabweichung');
  });

  it('routes attention drilldowns to tabs', () => {
    expect(attentionDrilldownTab('INTEGRATION_ERROR')).toBe('integrations');
    expect(attentionDrilldownTab('CONNECTIVITY_CRITICAL')).toBe('vehicles');
    expect(attentionDrilldownTab('PAST_DUE')).toBe('billing');
  });

  it('formats billing health labels', () => {
    expect(billingHealthLabel('ok')).toBe('OK');
    expect(billingHealthLabel('critical')).toBe('Kritisch');
  });

  it('formats relative time in DE', () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeDe(recent)).toMatch(/Min\./);
  });
});
