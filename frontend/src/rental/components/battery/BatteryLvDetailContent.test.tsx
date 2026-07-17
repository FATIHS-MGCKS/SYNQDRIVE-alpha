// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { BatteryLvDetailContent } from './BatteryLvDetailContent';
import { buildBatteryLvDetailVm } from '../../lib/battery-lv-view-model';
import {
  iceLvLiveStable,
  iceLvObservationStale,
  iceLvStartProxyProxy,
} from '../../lib/battery-test-fixtures';

vi.mock('../ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey) => de[key] ?? key,
  }),
}));

describe('BatteryLvDetailContent', () => {
  it('shows stale live voltage banner when observation is not fresh', () => {
    const html = renderToStaticMarkup(
      <BatteryLvDetailContent vm={buildBatteryLvDetailVm(null, iceLvObservationStale())} />,
    );
    expect(html).toContain('Live-Spannung ist älter als 15 Minuten');
  });

  it('does not show stale banner for fresh observation', () => {
    const html = renderToStaticMarkup(
      <BatteryLvDetailContent vm={buildBatteryLvDetailVm(null, iceLvLiveStable())} />,
    );
    expect(html).not.toContain('Live-Spannung ist älter als 15 Minuten');
  });

  it('renders start-proxy section with PROXY data-quality chip', () => {
    const html = renderToStaticMarkup(
      <BatteryLvDetailContent vm={buildBatteryLvDetailVm(null, iceLvStartProxyProxy())} />,
    );
    expect(html).toContain('Startverhalten');
    expect(html).toContain('Proxy');
  });

  it('wraps long German workshop text without truncating labels', () => {
    const longReason =
      'Werkstattbefund mit ausführlicher Beschreibung der 12V-Batterie und Ladezustand über mehrere Zeilen für Mobile-Ansicht';
    const vm = buildBatteryLvDetailVm(null, iceLvLiveStable());
    vm.startBehavior = {
      available: false,
      label: 'Startverhalten',
      classification: null,
      dataQualityStatus: null,
      valueText: null,
      ageLabel: null,
      unsupportedReason: longReason,
    };
    const html = renderToStaticMarkup(<BatteryLvDetailContent vm={vm} />);
    expect(html).toContain(longReason);
  });
});
