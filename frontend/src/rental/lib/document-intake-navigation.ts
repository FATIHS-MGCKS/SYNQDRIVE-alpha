export type DocumentIntakeTab = 'upload' | 'review' | 'archive';

export const DOCUMENT_INTAKE_TAB_PARAM = 'documentTab';
export const DOCUMENT_INTAKE_EXTRACTION_PARAM = 'extractionId';
export const DOCUMENT_INTAKE_ARCHIVE_Q_PARAM = 'archiveQ';

const ALLOWED_TABS = new Set<DocumentIntakeTab>(['upload', 'review', 'archive']);

export function parseDocumentIntakeTab(value: string | null | undefined): DocumentIntakeTab {
  if (value && ALLOWED_TABS.has(value as DocumentIntakeTab)) {
    return value as DocumentIntakeTab;
  }
  return 'upload';
}

export function readDocumentIntakeTab(search = ''): DocumentIntakeTab {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return parseDocumentIntakeTab(params.get(DOCUMENT_INTAKE_TAB_PARAM));
}

export function readDocumentIntakeExtractionId(search = ''): string | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const value = params.get(DOCUMENT_INTAKE_EXTRACTION_PARAM);
  return value?.trim() ? value.trim() : null;
}

export function readDocumentArchiveQuery(search = ''): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get(DOCUMENT_INTAKE_ARCHIVE_Q_PARAM)?.trim() ?? '';
}

export function buildDocumentIntakeSearch(input: {
  tab: DocumentIntakeTab;
  extractionId?: string | null;
  archiveQ?: string | null;
  baseSearch?: string;
}): string {
  const params = new URLSearchParams(
    input.baseSearch?.startsWith('?') ? input.baseSearch.slice(1) : input.baseSearch ?? '',
  );
  params.set(DOCUMENT_INTAKE_TAB_PARAM, input.tab);
  if (input.extractionId) {
    params.set(DOCUMENT_INTAKE_EXTRACTION_PARAM, input.extractionId);
  } else {
    params.delete(DOCUMENT_INTAKE_EXTRACTION_PARAM);
  }
  if (input.archiveQ?.trim()) {
    params.set(DOCUMENT_INTAKE_ARCHIVE_Q_PARAM, input.archiveQ.trim());
  } else {
    params.delete(DOCUMENT_INTAKE_ARCHIVE_Q_PARAM);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function replaceDocumentIntakeUrl(input: {
  tab: DocumentIntakeTab;
  extractionId?: string | null;
  archiveQ?: string | null;
}) {
  if (typeof window === 'undefined') return;
  const next = buildDocumentIntakeSearch({
    tab: input.tab,
    extractionId: input.extractionId,
    archiveQ: input.archiveQ,
    baseSearch: window.location.search,
  });
  const href = `${window.location.pathname}${next}${window.location.hash}`;
  window.history.replaceState(null, '', href);
}
