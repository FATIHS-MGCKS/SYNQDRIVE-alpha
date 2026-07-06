import { describe, expect, it } from 'vitest';
import { formatDashboardMoney, resolveDashboardNumberFormatLocale } from './dashboardKpiFormat';
import {
  getOperationalKpiVisualState,
  isOverdueSlice,
  isReadySlice,
} from './dashboardKpiVisual';
import type { DashboardSlice } from './runtime';

function slice(id: DashboardSlice['id'], count: number | null, tone: DashboardSlice['tone']): DashboardSlice {
  return {
    id,
    title: id,
    count,
    tone,
    hint: undefined,
    rows: [],
  };
}

describe('dashboardKpiFormat', () => {
  it('resolves German locale variants to de-DE', () => {
    expect(resolveDashboardNumberFormatLocale('de', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('de-DE', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('de_DE', 'EUR')).toBe('de-DE');
  });

  it('formats EUR for German locale with symbol after amount', () => {
    expect(formatDashboardMoney(0, 'EUR', 'de')).toMatch(/^0\s?€$/);
    expect(formatDashboardMoney(125_000, 'EUR', 'de-DE')).toMatch(/1\.250\s?€/);
    expect(formatDashboardMoney(-25_000, 'EUR', 'de')).toMatch(/-250\s?€/);
  });

  it('keeps en-US currency layout for English locale', () => {
    const formatted = formatDashboardMoney(0, 'EUR', 'en');
    expect(formatted).toMatch(/€0|0\s?€/);
  });
});

describe('dashboardKpiVisual', () => {
  it('identifies overdue and ready slices', () => {
    expect(isOverdueSlice('overdue-returns')).toBe(true);
    expect(isOverdueSlice('overdue-pickups')).toBe(true);
    expect(isOverdueSlice('ready-to-rent')).toBe(false);
    expect(isReadySlice('ready-to-rent')).toBe(true);
  });

  it('overdue slices are neutral at zero and critical above zero', () => {
    const zero = getOperationalKpiVisualState(slice('overdue-returns', 0, 'success'));
    const one = getOperationalKpiVisualState(slice('overdue-pickups', 1, 'success'));

    expect(zero).toEqual({ isCritical: false, isWatch: false, isCardSuccess: false });
    expect(one).toEqual({ isCritical: true, isWatch: false, isCardSuccess: false });
  });

  it('ready-to-rent keeps the card neutral regardless of slice tone', () => {
    const visual = getOperationalKpiVisualState(slice('ready-to-rent', 4, 'success'));
    expect(visual.isCardSuccess).toBe(false);
    expect(visual.isCritical).toBe(false);
  });

  it('critical alerts are neutral at zero and critical above zero', () => {
    expect(getOperationalKpiVisualState(slice('critical-alerts', 0, 'critical'))).toEqual({
      isCritical: false,
      isWatch: false,
      isCardSuccess: false,
    });
    expect(getOperationalKpiVisualState(slice('critical-alerts', 2, 'critical')).isCritical).toBe(true);
  });

  it('blocked maintenance follows watch/critical tone only when count > 0', () => {
    expect(getOperationalKpiVisualState(slice('blocked-maintenance', 0, 'watch'))).toEqual({
      isCritical: false,
      isWatch: false,
      isCardSuccess: false,
    });
    expect(getOperationalKpiVisualState(slice('blocked-maintenance', 3, 'watch')).isWatch).toBe(true);
  });
});
