import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LegalDocumentsTab } from '../LegalDocumentsTab';

vi.mock('../../RentalContext', () => ({
  useRentalOrg: () => ({
    orgId: 'org-1',
    hasPermission: (module: string, level: string) =>
      module === 'legal-documents' && (level === 'write' || level === 'manage'),
  }),
}));

vi.mock('./useLegalDocumentsOverview', () => ({
  useLegalDocumentsOverview: () => ({
    docs: [],
    summary: {
      overallTone: 'neutral',
      overallLabel: 'In Prüfung',
      configAlerts: [],
      categories: [],
      allVersions: [],
    },
    events: [],
    loading: false,
    eventsLoading: false,
    error: null,
    eventsError: null,
    refresh: async () => {},
  }),
}));

describe('LegalDocumentsTab upload wizard entry', () => {
  it('shows Neue Version button for users with upload permission', () => {
    const html = renderToStaticMarkup(<LegalDocumentsTab />);
    expect(html).toContain('data-testid="legal-documents-new-version"');
    expect(html).toContain('Neue Version');
  });
});
