import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataProcessingSubNav } from './DataProcessingSubNav';
import { DP_SECTION_PANEL_ID, DP_SECTION_TAB_ID } from './data-processing-a11y';

vi.mock('../../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: string) => key,
  }),
}));

describe('DataProcessingSubNav accessibility', () => {
  it('renders tablist with aria-controls on each tab', () => {
    const html = renderToStaticMarkup(
      <DataProcessingSubNav
        active="activities"
        onChange={() => {}}
        visibleSections={['activities', 'enforcement', 'audit']}
      />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain(`id="${DP_SECTION_TAB_ID.activities}"`);
    expect(html).toContain(`aria-controls="${DP_SECTION_PANEL_ID.activities}"`);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('tabindex="-1"');
  });
});
