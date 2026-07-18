import { AlertTriangle, ChevronLeft, Eye, Inbox } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Icon } from '../ui/Icon';
import type { TranslationKey } from '../../i18n/translations/en';
import { useDocumentReviewInbox } from '../../hooks/useDocumentReviewInbox';
import {
  archiveItemToSummary,
  deriveReviewReasonsFromArchiveItem,
  type DocumentReviewReason,
  type DocumentReviewReasonFilter,
} from '../../lib/document-review-inbox.util';
import type { PublicDocumentExtractionArchiveItem } from '../../lib/document-extraction.types';

interface DocumentReviewInboxPanelProps {
  orgId: string;
  isDarkMode: boolean;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  typeLabel: (labelKey: string, fallback?: string) => string;
  onOpenItem: (item: PublicDocumentExtractionArchiveItem) => void;
  activeExtractionId?: string | null;
  onBackToList?: () => void;
  children?: React.ReactNode;
}

const REASON_FILTERS: Array<{ id: DocumentReviewReasonFilter; labelKey: TranslationKey }> = [
  { id: 'all', labelKey: 'docUpload.review.filter.all' },
  { id: 'unclear_type', labelKey: 'docUpload.review.reason.unclearType' },
  { id: 'entity_assignment_open', labelKey: 'docUpload.review.reason.entityOpen' },
  { id: 'required_fields_missing', labelKey: 'docUpload.review.reason.missingFields' },
  { id: 'plausibility_conflict', labelKey: 'docUpload.review.reason.plausibility' },
  { id: 'action_preview_open', labelKey: 'docUpload.review.reason.actionPreview' },
  { id: 'apply_failed', labelKey: 'docUpload.review.reason.applyFailed' },
  { id: 'follow_up_open', labelKey: 'docUpload.review.reason.followUpOpen' },
];

function reasonBadgeClass(reason: DocumentReviewReason, isDarkMode: boolean): string {
  const base = 'rounded-full px-2 py-0.5 text-[10px] font-semibold';
  if (reason === 'apply_failed' || reason === 'plausibility_conflict') {
    return `${base} ${isDarkMode ? 'bg-red-500/10 text-red-300' : 'bg-red-50 text-red-700'}`;
  }
  if (reason === 'follow_up_open') {
    return `${base} ${isDarkMode ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-800'}`;
  }
  return `${base} ${isDarkMode ? 'bg-brand-soft text-brand' : 'bg-status-info-soft text-status-info'}`;
}

function reasonLabelKey(reason: DocumentReviewReason): TranslationKey {
  const map: Record<DocumentReviewReason, TranslationKey> = {
    unclear_type: 'docUpload.review.reason.unclearType',
    entity_assignment_open: 'docUpload.review.reason.entityOpen',
    required_fields_missing: 'docUpload.review.reason.missingFields',
    plausibility_conflict: 'docUpload.review.reason.plausibility',
    action_preview_open: 'docUpload.review.reason.actionPreview',
    apply_failed: 'docUpload.review.reason.applyFailed',
    follow_up_open: 'docUpload.review.reason.followUpOpen',
  };
  return map[reason];
}

export function DocumentReviewInboxPanel({
  orgId,
  isDarkMode,
  t,
  typeLabel,
  onOpenItem,
  activeExtractionId,
  onBackToList,
  children,
}: DocumentReviewInboxPanelProps) {
  const [reasonFilter, setReasonFilter] = useState<DocumentReviewReasonFilter>('all');
  const inbox = useDocumentReviewInbox(orgId, reasonFilter);

  const glass = isDarkMode
    ? 'bg-neutral-900 border border-neutral-800'
    : 'bg-white border border-gray-200';

  const showDetail = Boolean(activeExtractionId && children);

  const filterChips = useMemo(() => REASON_FILTERS, []);

  if (showDetail) {
    return (
      <div className="space-y-3 min-w-0">
        <button
          type="button"
          onClick={onBackToList}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
            isDarkMode ? 'surface-premium text-gray-200' : 'bg-gray-100 text-gray-700'
          }`}
        >
          <ChevronLeft className="w-4 h-4" />
          {t('docUpload.review.backToInbox')}
        </button>
        {children}
      </div>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden min-w-0 ${glass}`}>
      <div className={`border-b px-3 py-3 space-y-3 ${isDarkMode ? 'border-neutral-800' : 'border-gray-200/60'}`}>
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <h2 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('docUpload.review.title')}
            </h2>
            <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
              {t('docUpload.review.subtitle')}
            </p>
          </div>
          {inbox.loading ? <Icon name="loader-2" className="w-4 h-4 animate-spin text-muted-foreground" /> : null}
        </div>

        <div className="flex flex-wrap gap-1.5 min-w-0">
          {filterChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                setReasonFilter(chip.id);
                inbox.setPage(1);
              }}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${
                reasonFilter === chip.id
                  ? 'bg-brand text-brand-foreground'
                  : isDarkMode
                    ? 'surface-premium text-gray-300 hover:text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {t(chip.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 min-w-0">
        {inbox.error ? (
          <div className={`rounded-lg px-3 py-6 text-center text-xs ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
            {t('docUpload.review.loadError')}
          </div>
        ) : null}

        {!inbox.loading && inbox.items.length === 0 ? (
          <div className="py-12 text-center min-w-0">
            <Inbox className={`mx-auto mb-2 h-8 w-8 ${isDarkMode ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {t('docUpload.review.emptyTitle')}
            </p>
            <p className={`text-xs mt-1 max-w-md mx-auto ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
              {t('docUpload.review.emptyHint')}
            </p>
          </div>
        ) : (
          <div className="space-y-2 min-w-0">
            {inbox.items.map((item) => {
              const reasons = deriveReviewReasonsFromArchiveItem(item);
              const summary = archiveItemToSummary(item);
              return (
                <article
                  key={item.id}
                  className={`rounded-lg border p-3 min-w-0 ${
                    isDarkMode ? 'border-neutral-800 hover:bg-neutral-800/40' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold break-all ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {item.sourceFileName || item.id}
                      </p>
                      <p className={`text-xs mt-1 ${isDarkMode ? 'text-muted-foreground' : 'text-gray-500'}`}>
                        {typeLabel(
                          `documentExtraction.type.${summary.effectiveDocumentType || 'OTHER'}`,
                          summary.effectiveDocumentType || 'OTHER',
                        )}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reasons.map((reason) => (
                          <span key={reason} className={reasonBadgeClass(reason, isDarkMode)}>
                            {t(reasonLabelKey(reason))}
                          </span>
                        ))}
                      </div>
                      {item.actionSummary.summary ? (
                        <p className={`mt-2 text-[11px] flex items-start gap-1.5 ${
                          isDarkMode ? 'text-gray-400' : 'text-gray-500'
                        }`}>
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          {item.actionSummary.summary}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenItem(item)}
                      className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-[11px] font-semibold text-brand-foreground shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {t('docUpload.openReview')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {inbox.totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-3 min-w-0">
            <p className={`text-[11px] ${isDarkMode ? 'text-gray-500' : 'text-muted-foreground'}`}>
              {t('docUpload.review.pagination', { page: inbox.page, totalPages: inbox.totalPages })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={inbox.page <= 1 || inbox.loading}
                onClick={() => inbox.setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold bg-brand-soft text-brand disabled:opacity-50"
              >
                {t('docUpload.archive.prev')}
              </button>
              <button
                type="button"
                disabled={inbox.page >= inbox.totalPages || inbox.loading}
                onClick={() => inbox.setPage((p) => p + 1)}
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
