import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LegalDocumentDto } from '../../lib/api';
import { LegalDocumentTypeVersionHistory } from '../components/legal-documents/LegalDocumentTypeVersionHistory';
import { LegalDocumentVersionHistoriesPanel } from '../components/legal-documents/LegalDocumentVersionHistoriesPanel';
import { LEGAL_DOCUMENT_TYPE_CONFIGS } from './legal-document-types';

import type { LegalDocumentVersionHistoryItem } from './legal-document-version-history.types';

const mockHistory: {
  items: LegalDocumentVersionHistoryItem[];
  documents: LegalDocumentDto[];
  meta: { total: number; page: number; limit: number; totalPages: number };
  loading: boolean;
  error: string | null;
  page: number;
  setPage: ReturnType<typeof vi.fn>;
  filters: { language: string; status: string; jurisdiction: string; from: string; to: string };
  applyFilters: ReturnType<typeof vi.fn>;
  sort: 'createdAt';
  order: 'desc';
  applySort: ReturnType<typeof vi.fn>;
  pageSize: number;
  reload: ReturnType<typeof vi.fn>;
} = {
  items: [],
  documents: [] as LegalDocumentDto[],
  meta: { total: 0, page: 1, limit: 15, totalPages: 1 },
  loading: false,
  error: null as string | null,
  page: 1,
  setPage: vi.fn(),
  filters: { language: '', status: '', jurisdiction: '', from: '', to: '' },
  applyFilters: vi.fn(),
  sort: 'createdAt' as const,
  order: 'desc' as const,
  applySort: vi.fn(),
  pageSize: 15,
  reload: vi.fn(),
};

vi.mock('../components/legal-documents/useLegalDocumentVersionHistory', () => ({
  useLegalDocumentVersionHistory: () => mockHistory,
}));

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
});

const baseDoc: LegalDocumentDto = {
  id: 'doc-1',
  documentType: 'TERMS_AND_CONDITIONS',
  title: 'AGB',
  versionLabel: '2026-07',
  language: 'de',
  jurisdiction: 'DE',
  status: 'ACTIVE',
  fileName: 'agb.pdf',
  sizeBytes: 1000,
  activeFrom: null,
  createdAt: '2026-07-01',
};

describe('LegalDocument version history components', () => {
  beforeEach(() => {
    mockHistory.items = [];
    mockHistory.documents = [];
    mockHistory.meta = { total: 0, page: 1, limit: 15, totalPages: 1 };
    mockHistory.loading = false;
    mockHistory.error = null;
  });

  it('renders per-type history sections with desktop and mobile containers', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentVersionHistoriesPanel
        orgId="org-1"
        permissions={{ canWrite: true, canManage: true }}
        settings={{ fourEyesEnabled: false }}
        onOpenDetail={() => {}}
        onOpenAction={() => {}}
      />,
    );
    expect(html).toContain('data-testid="legal-version-histories-panel"');
    for (const config of LEGAL_DOCUMENT_TYPE_CONFIGS) {
      expect(html).toContain(`data-testid="legal-version-history-${config.key}"`);
      expect(html).toContain(`data-testid="legal-version-mobile-list-${config.key}"`);
    }
  });

  it('shows empty state when no versions exist', () => {
    const html = renderToStaticMarkup(
      <LegalDocumentTypeVersionHistory
        orgId="org-1"
        config={LEGAL_DOCUMENT_TYPE_CONFIGS[0]}
        permissions={{ canWrite: false, canManage: false }}
        settings={{ fourEyesEnabled: false }}
        onOpenDetail={() => {}}
        onOpenAction={() => {}}
      />,
    );
    expect(html).toContain('Noch keine Versionen für diesen Rechtstexttyp');
  });

  it('renders pagination when total exceeds page size', () => {
    mockHistory.items = [
      {
        id: 'doc-1',
        documentType: 'TERMS_AND_CONDITIONS',
        categoryTitle: 'AGB',
        versionLabel: '2026-07',
        variantLabel: null,
        language: 'de',
        jurisdiction: 'DE',
        status: 'ACTIVE',
        validFrom: null,
        validUntil: null,
        approvedAt: null,
        activatedAt: null,
        checksumShort: 'abc…7890',
        checksum: 'abc',
        scanStatus: 'SCAN_PASSED',
        integrityStatus: 'VERIFIED',
        snapshotCount: 3,
        fileName: 'agb.pdf',
      },
    ];
    mockHistory.documents = [baseDoc];
    mockHistory.meta = { total: 42, page: 2, limit: 15, totalPages: 3 };

    const html = renderToStaticMarkup(
      <LegalDocumentTypeVersionHistory
        orgId="org-1"
        config={LEGAL_DOCUMENT_TYPE_CONFIGS[0]}
        permissions={{ canWrite: true, canManage: true }}
        settings={{ fourEyesEnabled: false }}
        onOpenDetail={() => {}}
        onOpenAction={() => {}}
      />,
    );
    expect(html).toContain('data-testid="legal-version-pagination-TERMS_AND_CONDITIONS"');
    expect(html).toContain('42 Versionen');
    expect(html).toContain('Seite 2 von 3');
  });

  it('renders mobile card markup for version rows', () => {
    mockHistory.items = [
      {
        id: 'doc-1',
        documentType: 'TERMS_AND_CONDITIONS',
        categoryTitle: 'AGB',
        versionLabel: '2026-07',
        variantLabel: null,
        language: 'de',
        jurisdiction: 'DE',
        status: 'ACTIVE',
        validFrom: null,
        validUntil: null,
        approvedAt: null,
        activatedAt: null,
        checksumShort: 'abc…7890',
        checksum: 'abc',
        scanStatus: 'SCAN_PASSED',
        integrityStatus: 'VERIFIED',
        snapshotCount: 3,
        fileName: 'agb.pdf',
      },
    ];
    mockHistory.documents = [baseDoc];

    const html = renderToStaticMarkup(
      <LegalDocumentTypeVersionHistory
        orgId="org-1"
        config={LEGAL_DOCUMENT_TYPE_CONFIGS[0]}
        permissions={{ canWrite: true, canManage: true }}
        settings={{ fourEyesEnabled: false }}
        onOpenDetail={() => {}}
        onOpenAction={() => {}}
      />,
    );
    expect(html).toContain('data-testid="legal-version-mobile-card-doc-1"');
    expect(html).toContain('md:hidden');
    expect(html).toContain('hidden md:block');
  });

  it('shows filter-specific empty state', () => {
    mockHistory.filters = { language: 'de', status: 'ACTIVE', jurisdiction: '', from: '', to: '' };

    const html = renderToStaticMarkup(
      <LegalDocumentTypeVersionHistory
        orgId="org-1"
        config={LEGAL_DOCUMENT_TYPE_CONFIGS[0]}
        permissions={{ canWrite: false, canManage: false }}
        settings={{ fourEyesEnabled: false }}
        onOpenDetail={() => {}}
        onOpenAction={() => {}}
      />,
    );
    expect(html).toContain('Keine Versionen für die gewählten Filter');
    expect(html).toContain('data-testid="legal-version-filters-TERMS_AND_CONDITIONS"');
  });
});
