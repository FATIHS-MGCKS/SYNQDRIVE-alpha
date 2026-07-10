import { describe, expect, it } from 'vitest';
import {
  formatBusinessMoney,
  formatDashboardMoney,
  formatDashboardMoneyParts,
  resolveDashboardNumberFormatLocale,
} from './dashboardKpiFormat';
import {
  getKpiCardSurfaceClass,
  getKpiCardTone,
  getKpiIconTileClass,
  getKpiValueGradientClass,
  getKpiValueTone,
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
  const normalizeMoney = (value: string) => value.replace(/\u00a0/g, ' ').trim();

  it('resolves German locale variants to de-DE', () => {
    expect(resolveDashboardNumberFormatLocale('de', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('de-DE', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('de_DE', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('de-DE-x-private', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('de_AT', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('de-AT', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('de_CH', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('de-CH', 'EUR')).toBe('de-DE');
  });

  it('falls back to de-DE for EUR when locale is empty or invalid', () => {
    expect(resolveDashboardNumberFormatLocale('', 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale(null, 'EUR')).toBe('de-DE');
    expect(resolveDashboardNumberFormatLocale('not-a-real-locale-tag', 'EUR')).toBe('de-DE');
  });

  it('formats EUR with European symbol position regardless of UI locale', () => {
    expect(normalizeMoney(formatBusinessMoney(0, 'EUR', 'en'))).toBe('0 €');
    expect(normalizeMoney(formatBusinessMoney(0, 'EUR', 'en-US'))).toBe('0 €');
    expect(normalizeMoney(formatBusinessMoney(125_000, 'EUR', 'en'))).toBe('1.250 €');
  });

  it('formats EUR for German locale with symbol after amount', () => {
    expect(normalizeMoney(formatBusinessMoney(0, 'EUR', 'de'))).toBe('0 €');
    expect(normalizeMoney(formatBusinessMoney(0, 'EUR', 'de-DE'))).toBe('0 €');
    expect(normalizeMoney(formatBusinessMoney(125_000, 'EUR', 'de-DE'))).toBe('1.250 €');
    expect(normalizeMoney(formatBusinessMoney(-25_000, 'EUR', 'de'))).toBe('-250 €');
    expect(normalizeMoney(formatBusinessMoney(0, 'EUR', 'de_AT'))).toBe('0 €');
    expect(normalizeMoney(formatBusinessMoney(0, 'EUR', 'de-CH'))).toBe('0 €');
  });

  it('splits money into amount and currency parts for KPI display', () => {
    expect(formatDashboardMoneyParts(0, 'EUR', 'de')).toEqual({ amount: '0', currency: '€' });
    expect(formatDashboardMoneyParts(125_000, 'EUR', 'de-DE')).toEqual({
      amount: '1.250',
      currency: '€',
    });
    expect(formatDashboardMoneyParts(-25_000, 'EUR', 'de')).toEqual({
      amount: '-250',
      currency: '€',
    });
  });

  it('does not throw for invalid locale', () => {
    expect(() => formatDashboardMoney(0, 'EUR', '!!!')).not.toThrow();
    expect(normalizeMoney(formatDashboardMoney(0, 'EUR', '!!!'))).toBe('0 €');
  });

  it('formats whole euros without fraction digits', () => {
    expect(normalizeMoney(formatBusinessMoney(100, 'EUR', 'de'))).toBe('1 €');
    expect(normalizeMoney(formatBusinessMoney(100, 'EUR', 'de'))).not.toContain(',00');
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

  describe('getKpiCardTone', () => {
    it('keeps ready-to-rent and active-rented cards neutral', () => {
      expect(getKpiCardTone(slice('ready-to-rent', 5, 'success'))).toBe('neutral');
      expect(getKpiCardTone(slice('active-rented', 12, 'info'))).toBe('neutral');
    });

    it('overdue and critical alerts are critical only when count > 0', () => {
      expect(getKpiCardTone(slice('overdue-returns', 0, 'success'))).toBe('neutral');
      expect(getKpiCardTone(slice('overdue-pickups', 0, 'success'))).toBe('neutral');
      expect(getKpiCardTone(slice('overdue-returns', 2, 'success'))).toBe('critical');
      expect(getKpiCardTone(slice('critical-alerts', 0, 'critical'))).toBe('neutral');
      expect(getKpiCardTone(slice('critical-alerts', 1, 'critical'))).toBe('critical');
    });

    it('blocked maintenance is warning when count > 0 and slice tone is watch', () => {
      expect(getKpiCardTone(slice('blocked-maintenance', 0, 'watch'))).toBe('neutral');
      expect(getKpiCardTone(slice('blocked-maintenance', 1, 'watch'))).toBe('warning');
      expect(getKpiCardTone(slice('blocked-maintenance', 2, 'critical'))).toBe('critical');
    });
  });

  describe('getKpiValueTone', () => {
    it('ready main value is positive; not-ready footer is critical only when count > 0', () => {
      const readySlice = slice('ready-to-rent', 5, 'success');
      expect(getKpiValueTone(readySlice, 'main')).toBe('positive');
      expect(getKpiValueTone(readySlice, 'footer-right', { notReadyCount: 0 })).toBe('neutral');
      expect(getKpiValueTone(readySlice, 'footer-right', { notReadyCount: 1 })).toBe('critical');
      expect(getKpiValueTone(readySlice, 'footer-left')).toBe('neutral');
    });

    it('active-rented values stay neutral', () => {
      const opsSlice = slice('active-rented', 8, 'info');
      expect(getKpiValueTone(opsSlice, 'main')).toBe('neutral');
      expect(getKpiValueTone(opsSlice, 'footer-left')).toBe('neutral');
      expect(getKpiValueTone(opsSlice, 'footer-right')).toBe('neutral');
    });

    it('compact values follow card tone', () => {
      expect(getKpiValueTone(slice('overdue-returns', 0, 'success'), 'compact')).toBe('neutral');
      expect(getKpiValueTone(slice('overdue-returns', 3, 'success'), 'compact')).toBe('critical');
      expect(getKpiValueTone(slice('blocked-maintenance', 1, 'watch'), 'compact')).toBe('warning');
    });
  });

  describe('getKpiValueGradientClass', () => {
    it('returns solid foreground for neutral and disabled', () => {
      expect(getKpiValueGradientClass('neutral')).toBe('text-foreground');
      expect(getKpiValueGradientClass('positive', true)).toBe('text-muted-foreground');
    });

    it('returns gradient classes for positive, warning, and critical', () => {
      expect(getKpiValueGradientClass('positive')).toContain('bg-clip-text');
      expect(getKpiValueGradientClass('positive')).toContain('var(--status-positive)');
      expect(getKpiValueGradientClass('warning')).toContain('var(--status-warning)');
      expect(getKpiValueGradientClass('critical')).toContain('var(--status-critical)');
    });
  });

  describe('getKpiCardSurfaceClass', () => {
    it('neutral cards rely on surface-elevated — no extra surface classes', () => {
      expect(getKpiCardSurfaceClass('neutral', false)).toBe('');
      expect(getKpiCardSurfaceClass('neutral', true)).toBe('');
      expect(getKpiCardSurfaceClass('neutral', false)).not.toContain('bg-');
    });

    it('critical and warning cards use subtle gradient surfaces', () => {
      expect(getKpiCardSurfaceClass('critical', false)).toContain('var(--status-critical)');
      expect(getKpiCardSurfaceClass('warning', false)).toContain('var(--status-warning)');
    });
  });

  describe('getKpiIconTileClass', () => {
    it('ready icon tile is subtly positive without tinting the card', () => {
      expect(getKpiIconTileClass(slice('ready-to-rent', 5, 'success'))).toContain('var(--status-positive)');
    });

    it('overdue at zero uses muted icon tile', () => {
      expect(getKpiIconTileClass(slice('overdue-returns', 0, 'success'))).toContain('bg-muted');
    });

    it('overdue above zero uses critical icon tile', () => {
      expect(getKpiIconTileClass(slice('overdue-returns', 1, 'success'))).toContain('var(--status-critical)');
    });
  });
});
