import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentArchivePanel } from './DocumentArchivePanel';
import { makeArchiveItem } from '../../lib/document-intake-test-fixtures';

const t = (key: string) => key;
const typeLabel = (_key: string, fallback?: string) => fallback ?? _key;

vi.mock('../../hooks/useDocumentArchiveList', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../hooks/useDocumentArchiveList')>();
  return {
    ...actual,
    useDocumentArchiveList: () => ({
      items: [makeArchiveItem()],
      loading: false,
      total: 1,
      totalPages: 1,
      error: null,
      reload: vi.fn(),
    }),
  };
});

describe('DocumentArchivePanel', () => {
  it('renders archive items with filters, audit trail, and actions', () => {
    const html = renderToStaticMarkup(
      <DocumentArchivePanel
        orgId="org-test-001"
        isDarkMode={false}
        t={t}
        typeLabel={typeLabel}
        onOpenItem={() => undefined}
        onDownload={() => undefined}
      />,
    );

    expect(html).toContain('docUpload.archive.title');
    expect(html).toContain('service.pdf');
    expect(html).toContain('docUpload.archive.auditTrail');
    expect(html).toContain('docUpload.archive.open');
    expect(html).toContain('docUpload.archive.download');
    expect(html).toContain('docUpload.archive.filter.statusAll');
    expect(html).toContain('docUpload.archive.filter.followUpAll');
  });

  it('exposes accessible search input', () => {
    const html = renderToStaticMarkup(
      <DocumentArchivePanel orgId="org-test-001" isDarkMode t={t} typeLabel={typeLabel} />,
    );

    expect(html).toContain('docUpload.archive.search');
    expect(html).toContain('docUpload.archive.searchPlaceholder');
    expect(html).toContain('sr-only');
  });
});
