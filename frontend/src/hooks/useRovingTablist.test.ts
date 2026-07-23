import { describe, expect, it } from 'vitest';
import { ADMIN_TAB_ID, ADMIN_TAB_PANEL_ID } from '../rental/components/settings/administration-a11y';

describe('useRovingTablist / administration tab wiring', () => {
  it('maps legal-documents tab to stable panel id for aria-controls', () => {
    expect(ADMIN_TAB_ID['legal-documents']).toBe('admin-tab-legal-documents');
    expect(ADMIN_TAB_PANEL_ID['legal-documents']).toBe('admin-panel-legal-documents');
  });

  it('defines ids for all administration tabs', () => {
    const tabs = Object.keys(ADMIN_TAB_ID);
    expect(tabs.length).toBeGreaterThan(5);
    for (const tab of tabs) {
      expect(ADMIN_TAB_PANEL_ID[tab as keyof typeof ADMIN_TAB_PANEL_ID]).toMatch(/^admin-panel-/);
    }
  });
});
