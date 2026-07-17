import { Archive, Download, Eye, History, Link2, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  EMPTY_ARCHIVE_FILTERS,
  useDocumentArchiveList,
  type DocumentArchiveFilters,
} from '../../hooks/useDocumentArchiveList';
import type { PublicDocumentExtractionArchiveItem } from '../../lib/document-extraction.types';
import { readDocumentArchiveQuery } from '../../lib/document-intake-navigation';
import { replaceDocumentIntakeUrl } from '../../lib/document-intake-navigation';
import { buildDocumentArchiveAuditTrail } from '../../lib/document-archive-audit.util';

interface DocumentArchivePanelProps {
  orgId: string;
  isDarkMode: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  typeLabel: (labelKey: string, fallback?: string) => string;
  onOpenItem?: (item: PublicDocumentExtractionArchiveItem) => void;
  onDownload?: (item: PublicDocumentExtractionArchiveItem) => void;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function DocumentArchivePanel({
  orgId,
  isDarkMode,
  t,
  typeLabel,
  onOpenItem,
  onDownload,
}: DocumentArchivePanelProps) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<DocumentArchiveFilters>(() => ({
    ...EMPTY_ARCHIVE_FILTERS,
    q: typeof window !== 'undefined' ? readDocumentArchiveQuery(window.location.search) : '',
  }));
  const [searchDraft, setSearchDraft] = useState(filters.q);

  const archive = useDocumentArchiveList(orgId, filters, page);

  useEffect(() => {
    setSearchDraft(filters.q);
  }, [filters.q]);

  const glass = isDarkMode
    ? 'bg-neutral-900 border border-neutral-800'
    : 'bg-white border border-gray-200';

  const statusOptions = useMemo(
    () => ['', 'READY_FOR_REVIEW', 'APPLIED', 'PARTIALLY_APPLIED', 'FAILED', 'AWAITING_DOCUMENT_TYPE'],
    [],
  );

  const applySearch = () => {
    const next = { ...filters, q: searchDraft.trim() };
    setFilters(next);
    setPage(1);
    replaceDocumentIntakeUrl({ tab: 'archive', archiveQ: next.q || null });
  };

  return (
    <div className={`rounded-lg overflow-hidden min-w-0 ${glass}`}>
      <div className={`border-b px-3 py-3 space-y-3 ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
          <div className="min-w-0">
            <h2 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('docUpload.archive.title')}
            </h2>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
              {t('docUpload.archive.subtitle')}
            </p>
          </div>
          {archive.loading ? <Icon name="loader-2" className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2 min-w-0">
          <label className="md:col-span-2 min-w-0">
            <span className="sr-only">{t('docUpload.archive.search')}</span>
            <div className="flex gap-2 min-w-0">
              <input
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applySearch();
                }}
                placeholder={t('docUpload.archive.searchPlaceholder')}
                className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs ${
                  isDarkMode ? 'surface-premium border-neutral-700 text-white' : 'bg-white border-gray-200'
                }`}
              />
              <button
                type="button"
                onClick={applySearch}
                className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-foreground"
              >
                <Search className="w-3.5 h-3.5" />
                {t('docUpload.archive.search')}
              </button>
            </div>
          </label>

          <select
            value={filters.status}
            onChange={(e) => {
              setFilters((prev) => ({ ...prev, status: e.target.value }));
              setPage(1);
            }}
            className={`rounded-lg border px-3 py-2 text-xs ${
              isDarkMode ? 'surface-premium border-neutral-700 text-white' : 'bg-white border-gray-200'
            }`}
          >
            <option value="">{t('docUpload.archive.filter.statusAll')}</option>
            {statusOptions.filter(Boolean).map((status) => (
              <option key={status} value={status}>
                {typeLabel(`documentExtraction.status.${status}`, status)}
              </option>
            ))}
          </select>

          <select
            value={filters.followUpStatus}
            onChange={(e) => {
              setFilters((prev) => ({
                ...prev,
                followUpStatus: e.target.value as DocumentArchiveFilters['followUpStatus'],
              }));
              setPage(1);
            }}
            className={`rounded-lg border px-3 py-2 text-xs ${
              isDarkMode ? 'surface-premium border-neutral-700 text-white' : 'bg-white border-gray-200'
            }`}
          >
            <option value="">{t('docUpload.archive.filter.followUpAll')}</option>
            {['OPEN', 'ACCEPTED', 'DISMISSED', 'MIXED'].map((status) => (
              <option key={status} value={status}>
                {t(`docUpload.archive.followUp.${status}` as TranslationKey)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="p-3 min-w-0">
        {archive.error ? (
          <div className={`rounded-lg px-3 py-6 text-center text-xs ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
            {t('docUpload.archive.loadError')}
          </div>
        ) : null}

        {!archive.loading && archive.items.length === 0 ? (
          <div className="py-12 text-center min-w-0">
            <Archive className={`mx-auto mb-2 h-8 w-8 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('docUpload.archive.emptyTitle')}
            </p>
            <p className={`text-xs mt-1 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
              {t('docUpload.archive.emptyHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-2 min-w-0">
            {archive.items.map((item) => (
              <article
                key={item.id}
                className={`rounded-lg border p-3 min-w-0 ${
                  isDarkMode ? 'border-neutral-800 hover:bg-neutral-800/40' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between min-w-0">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold break-all ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      {item.sourceFileName || item.id}
                    </p>
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                      {typeLabel(
                        `documentExtraction.type.${item.effectiveDocumentType || 'OTHER'}`,
                        item.effectiveDocumentType || 'OTHER',
                      )}
                      {item.documentSubtype ? ` · ${item.documentSubtype}` : ''}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand">
                        {typeLabel(`documentExtraction.status.${item.status}`, item.status)}
                      </span>
                      {item.actionSummary.summary ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isDarkMode ? 'surface-premium text-gray-300' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {item.actionSummary.summary}
                        </span>
                      ) : null}
                      {item.followUpSummary.primaryTitle ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          isDarkMode ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'
                        }`}>
                          {item.followUpSummary.primaryTitle}
                        </span>
                      ) : null}
                    </div>
                    <div className={`mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] ${
                      isDarkMode ? 'text-gray-400' : 'text-gray-500'
                    }`}>
                      <span>{t('docUpload.archive.uploadedAt')}: {formatDate(item.uploadedAt)}</span>
                      <span>{t('docUpload.archive.appliedAt')}: {formatDate(item.appliedAt)}</span>
                      {item.invoiceNumber ? <span>{t('docUpload.archive.invoiceNumber')}: {item.invoiceNumber}</span> : null}
                      {item.caseReference ? <span>{t('docUpload.archive.caseReference')}: {item.caseReference}</span> : null}
                    </div>
                    {item.acceptedEntityLinks.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {item.acceptedEntityLinks.map((link) => (
                          <span
                            key={`${link.entityType}-${link.entityId}`}
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] ${
                              isDarkMode ? 'surface-premium text-gray-300' : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            <Link2 className="w-3 h-3" />
                            {link.label || `${link.entityType}`}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {item.uploader?.displayName ? (
                      <p className={`mt-2 text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
                        {t('docUpload.archive.uploader')}: {item.uploader.displayName}
                      </p>
                    ) : null}
                    <div className={`mt-3 rounded-lg border px-3 py-2 ${
                      isDarkMode ? 'border-neutral-800 bg-neutral-900/50' : 'border-gray-200 bg-gray-50/80'
                    }`}>
                      <div className="flex items-center gap-1.5 mb-2">
                        <History className={`w-3.5 h-3.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} />
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          {t('docUpload.archive.auditTrail')}
                        </span>
                      </div>
                      <ul className="space-y-1.5">
                        {buildDocumentArchiveAuditTrail(item).map((entry) => (
                          <li
                            key={`${entry.key}-${entry.at}`}
                            className={`flex flex-col gap-0.5 text-[11px] sm:flex-row sm:items-baseline sm:justify-between ${
                              isDarkMode ? 'text-gray-400' : 'text-gray-600'
                            }`}
                          >
                            <span className="font-medium">
                              {t(`docUpload.archive.audit.${entry.key}` as TranslationKey)}
                              {entry.detail ? (
                                <span className={`font-normal ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
                                  {' '}
                                  · {entry.detail}
                                </span>
                              ) : null}
                            </span>
                            <time className={`shrink-0 tabular-nums ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
                              {formatDate(entry.at)}
                            </time>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    {onOpenItem ? (
                      <button
                        type="button"
                        onClick={() => onOpenItem(item)}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-[11px] font-semibold text-brand-foreground"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {t('docUpload.archive.open')}
                      </button>
                    ) : null}
                    {item.canDownload && onDownload ? (
                      <button
                        type="button"
                        onClick={() => onDownload(item)}
                        className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[11px] font-semibold ${
                          isDarkMode ? 'surface-premium text-gray-200' : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        <Download className="w-3.5 h-3.5" />
                        {t('docUpload.archive.download')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        {archive.totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3 min-w-0">
            <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
              {t('docUpload.archive.pagination', {
                page,
                totalPages: archive.totalPages,
                total: archive.total,
              })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1 || archive.loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold bg-brand-soft text-brand disabled:opacity-50"
              >
                {t('docUpload.archive.prev')}
              </button>
              <button
                type="button"
                disabled={page >= archive.totalPages || archive.loading}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold bg-brand-soft text-brand disabled:opacity-50"
              >
                {t('docUpload.archive.next')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
