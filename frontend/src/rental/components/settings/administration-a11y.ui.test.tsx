import { describe, expect, it, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdministrationTabBar } from './AdministrationTabBar';
import { AdministrationTabPanel } from './AdministrationTabPanel';
import { ADMIN_TAB_ID, ADMIN_TAB_PANEL_ID } from './administration-a11y';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
  }),
}));

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

describe('Administration a11y UI', () => {
  it('renders tablist with aria-controls and roving tabindex', () => {
    const html = renderToStaticMarkup(
      <AdministrationTabBar activeTab="legal-documents" onTabChange={() => {}} />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain(`id="${ADMIN_TAB_ID['legal-documents']}"`);
    expect(html).toContain(`aria-controls="${ADMIN_TAB_PANEL_ID['legal-documents']}"`);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('min-h-11');
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('renders tabpanel with aria-labelledby', () => {
    const html = renderToStaticMarkup(
      <AdministrationTabPanel tab="legal-documents" activeTab="legal-documents">
        <p>Inhalt</p>
      </AdministrationTabPanel>,
    );
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain(`id="${ADMIN_TAB_PANEL_ID['legal-documents']}"`);
    expect(html).toContain(`aria-labelledby="${ADMIN_TAB_ID['legal-documents']}"`);
  });
});
