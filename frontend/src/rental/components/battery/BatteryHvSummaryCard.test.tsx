// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { BatteryHvSummaryCard } from './BatteryHvSummaryCard';
import { buildBatteryHvSummaryVm } from '../../lib/battery-hv-view-model';
import { evHvLegacyUnverified, evHvMissingSoh, evHvProviderSoh } from '../../lib/battery-test-fixtures';

vi.mock('../ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey) => de[key] ?? key,
  }),
}));

describe('BatteryHvSummaryCard', () => {
  it('shows provider SOH with correct German label', () => {
    const html = renderToStaticMarkup(
      <BatteryHvSummaryCard vm={buildBatteryHvSummaryVm(evHvProviderSoh())} cardClass="card" />,
    );
    expect(html).toContain('91');
    expect(html).toContain('Provider-SOH');
    expect(html).not.toContain('Geschätzter 12V');
  });

  it('hides SOH percent for legacy unverified data', () => {
    const html = renderToStaticMarkup(
      <BatteryHvSummaryCard vm={buildBatteryHvSummaryVm(evHvLegacyUnverified())} cardClass="card" />,
    );
    expect(html).toContain('Kein belastbarer SOH');
    expect(html).not.toMatch(/>\s*78\s*%/);
  });

  it('does not render primary HV SOH percent when missing', () => {
    const html = renderToStaticMarkup(
      <BatteryHvSummaryCard vm={buildBatteryHvSummaryVm(evHvMissingSoh())} cardClass="card" />,
    );
    expect(html).toContain('Kein belastbarer SOH');
    expect(html).not.toContain('~');
    expect(html).not.toMatch(/font-bold tracking-tight[^>]*>\s*\d+%/);
  });
});
