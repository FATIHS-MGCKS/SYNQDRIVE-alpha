import { describe, expect, it, vi, beforeAll } from 'vitest';
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
      overallLabel: 'In review',
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

vi.mock('./useLegalDocumentVersionHistory', () => ({
  useLegalDocumentVersionHistory: () => ({
    items: [],
    documents: [],
    meta: { total: 0, page: 1, limit: 15, totalPages: 1 },
    loading: false,
    error: null,
    page: 1,
    setPage: vi.fn(),
    filters: { language: '', status: '', jurisdiction: '', from: '', to: '' },
    applyFilters: vi.fn(),
    sort: 'createdAt',
    order: 'desc',
    applySort: vi.fn(),
    pageSize: 15,
    reload: vi.fn(),
  }),
}));

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

describe('LegalDocumentsTab upload wizard entry', () => {
  it('shows new version button for users with upload permission', () => {
    const html = renderToStaticMarkup(<LegalDocumentsTab />);
    expect(html).toContain('data-testid="legal-documents-new-version"');
    expect(html).toContain('New version');
  });
});
