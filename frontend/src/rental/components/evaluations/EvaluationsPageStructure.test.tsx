// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { de } from '../../i18n/translations/de';
import type { TranslationKey } from '../../i18n/translations/en';
import { EvaluationsSection } from './EvaluationsSection';
import { EvaluationsSectionNav } from './EvaluationsSectionNav';
import {
  EVALUATIONS_SECTION_IDS,
  EVALUATIONS_SECTION_ORDER,
} from './evaluations-page.constants';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'de',
    t: (key: TranslationKey) => de[key] ?? key,
  }),
}));

describe('evaluations-page.constants', () => {
  it('defines nine sections in canonical order', () => {
    expect(EVALUATIONS_SECTION_ORDER).toHaveLength(9);
    expect(EVALUATIONS_SECTION_ORDER[0]).toBe(EVALUATIONS_SECTION_IDS.filters);
    expect(EVALUATIONS_SECTION_ORDER[1]).toBe(EVALUATIONS_SECTION_IDS.executive);
    expect(EVALUATIONS_SECTION_ORDER.at(-1)).toBe(EVALUATIONS_SECTION_IDS.dataQuality);
  });
});

describe('EvaluationsSection', () => {
  it('renders loading skeleton', () => {
    const html = renderToStaticMarkup(
      <EvaluationsSection id="test" title="Test" surfaceState="loading">
        <p>content</p>
      </EvaluationsSection>,
    );
    expect(html).toContain('test');
    expect(html).not.toContain('content');
  });

  it('renders empty state', () => {
    const html = renderToStaticMarkup(
      <EvaluationsSection
        id="test-empty"
        title="Leer"
        surfaceState="empty"
        emptyTitle="Keine Daten"
        emptyDescription="Beschreibung"
      >
        <p>content</p>
      </EvaluationsSection>,
    );
    expect(html).toContain('Keine Daten');
  });

  it('shows partial status badge via i18n', () => {
    const html = renderToStaticMarkup(
      <EvaluationsSection id="test-partial" title="Teil" sectionStatus="PARTIAL" surfaceState="ready">
        <p>ok</p>
      </EvaluationsSection>,
    );
    expect(html).toContain('Teilweise');
  });
});

describe('EvaluationsSectionNav', () => {
  it('renders anchor links for all sections', () => {
    const html = renderToStaticMarkup(<EvaluationsSectionNav />);
    for (const sectionId of EVALUATIONS_SECTION_ORDER) {
      expect(html).toContain(`#${sectionId}`);
    }
    expect(html).toContain('Filter');
    expect(html).toContain('Datenqualität');
  });
});
