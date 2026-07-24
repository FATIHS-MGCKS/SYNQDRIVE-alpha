// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { EvaluationsAnalyticsFilterBar } from '../insights/EvaluationsAnalyticsFilterBar';
import { EvaluationsSection } from './EvaluationsSection';
import {
  EVAL_DIM_TAB_STATION_ID,
  EVAL_SW_COCKPIT_PANEL_ID,
  EVAL_SW_COCKPIT_TAB_ALL_ID,
} from './evaluations-a11y';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey, vars?: Record<string, string | number>) => {
      let text = de[key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v));
        });
      }
      return text;
    },
  }),
}));

vi.mock('./EvaluationsSwFindingDetailDrawer', () => ({
  EvaluationsSwFindingDetailDrawer: () => null,
}));

const defaultFilters = {
  period: 'mtd' as const,
  comparisonPeriod: null,
  stationId: null,
  vehicleId: null,
  vehicleClassId: null,
  vehicleStatus: null,
  bookingStatus: null,
  customerSegment: null,
  currency: 'EUR',
  riskCategory: null,
  insightStatus: null,
  dataQualityStatus: null,
};

describe('evaluations a11y UI', () => {
  it('renders filter bar as labeled fieldset with accessible selects', () => {
    const html = renderToStaticMarkup(
      <EvaluationsAnalyticsFilterBar
        filters={defaultFilters}
        onPatch={() => undefined}
        stationOptions={[{ id: 'st-1', label: 'Berlin' }]}
      />,
    );
    expect(html).toContain('<fieldset');
    expect(html).toContain('sr-only');
    expect(html).toContain('aria-label="Zeitraum"');
    expect(html).toContain('aria-label="Station"');
    expect(html).toContain('aria-label="Risikokategorie"');
    expect(html).toContain('aria-label="Insight-Status"');
    expect(html).toContain('data-testid="evaluations-filter-bar"');
  });

  it('renders section collapse control with aria-expanded and aria-controls', () => {
    const html = renderToStaticMarkup(
      <EvaluationsSection id="auswertungen-test" title="Risiken" defaultOpen>
        <p>content</p>
      </EvaluationsSection>,
    );
    expect(html).toContain('aria-labelledby="auswertungen-test-title"');
    expect(html).toContain('<h2 id="auswertungen-test-title"');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-controls="auswertungen-test-body"');
    expect(html).toContain('aria-label="Bereich einklappen: Risiken"');
    expect(html).toContain('focus-visible:ring-2');
  });

  it('exports stable a11y ids for SW cockpit and dimension tabs', () => {
    expect(EVAL_DIM_TAB_STATION_ID).toBe('eval-dim-tab-station');
    expect(EVAL_SW_COCKPIT_PANEL_ID).toBe('eval-sw-cockpit-panel');
    expect(EVAL_SW_COCKPIT_TAB_ALL_ID).toBe('eval-sw-tab-all');
  });
});
