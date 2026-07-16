// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { BatteryLvSummaryCard } from './BatteryLvSummaryCard';
import { buildBatteryLvSummaryVm } from '../../lib/battery-lv-view-model';
import { iceLvLiveStable, iceLvUnsupported } from '../../lib/battery-test-fixtures';

vi.mock('../ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey) => de[key] ?? key,
  }),
}));

const cardProps = {
  quickCardClass: 'card',
  quickCardHeaderClass: 'header',
  quickCardTitleClass: 'title',
  quickCardBodyClass: 'body',
  quickCardFooterClass: 'footer',
};

describe('BatteryLvSummaryCard', () => {
  it('renders 12V estimated health without SOH in primary label', () => {
    const html = renderToStaticMarkup(
      <BatteryLvSummaryCard vm={buildBatteryLvSummaryVm(iceLvLiveStable())} {...cardProps} />,
    );
    expect(html).toContain('12V-Batterie');
    expect(html).toContain('Geschätzter 12V-Batteriezustand');
    expect(html).not.toMatch(/12V-Batteriezustand[^<]*SOH/i);
  });

  it('shows qualified resting voltage with VERIFIED badge', () => {
    const html = renderToStaticMarkup(
      <BatteryLvSummaryCard vm={buildBatteryLvSummaryVm(iceLvLiveStable())} {...cardProps} />,
    );
    expect(html).toContain('12.62 V');
    expect(html).toContain('Verifiziert');
  });

  it('renders unsupported state without fabricated percentages', () => {
    const html = renderToStaticMarkup(
      <BatteryLvSummaryCard vm={buildBatteryLvSummaryVm(iceLvUnsupported())} {...cardProps} />,
    );
    expect(html).toContain('Keine LV-Batterie erkannt');
    expect(html).not.toMatch(/>\s*\d+%/);
  });
});
