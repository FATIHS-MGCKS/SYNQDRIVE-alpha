// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../i18n/translations/de';
import type { TranslationKey } from '../i18n/translations/en';
import { BatteryDataQualityBadge } from './BatteryDataQualityBadge';

vi.mock('../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey) => de[key] ?? key,
  }),
}));

describe('BatteryDataQualityBadge', () => {
  it('renders MISSED, PROXY, EXPERIMENTAL, STALE, LEGACY_UNVERIFIED distinctly', () => {
    for (const status of ['MISSED', 'PROXY', 'EXPERIMENTAL', 'STALE', 'LEGACY_UNVERIFIED'] as const) {
      const html = renderToStaticMarkup(<BatteryDataQualityBadge status={status} short />);
      expect(html.length).toBeGreaterThan(10);
      expect(html).toContain(de[`health.battery.dataQuality.short.${status}`]);
    }
  });

  it('renders full German label when short=false', () => {
    const html = renderToStaticMarkup(<BatteryDataQualityBadge status="LEGACY_UNVERIFIED" short={false} />);
    expect(html).toContain('Legacy / unverifiziert');
  });
});
