import { Loader2 } from 'lucide-react';
import { EmptyState, ErrorState } from '../../../components/patterns/states';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationConversationListItem } from '../../../lib/communication/types';
import { CommunicationConversationRow } from './CommunicationConversationRow';
import { CommunicationInboxSkeleton } from './skeletons/CommunicationInboxSkeleton';
import { hasActiveCommunicationInboxFilters } from './communication-inbox-state';
import type { CommunicationInboxFilters } from './communication-inbox-state';

interface CommunicationInboxListProps {
  conversations: CommunicationConversationListItem[];
  selectedConversationId: string | null;
  filters: CommunicationInboxFilters;
  locale: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  paginationError: string | null;
  onSelect: (conversationId: string) => void;
  onRetry: () => void;
  onLoadMore: () => void;
  onRetryLoadMore: () => void;
  onClearFilters: () => void;
}

export function CommunicationInboxList({
  conversations,
  selectedConversationId,
  filters,
  locale,
  loading,
  loadingMore,
  hasMore,
  error,
  paginationError,
  onSelect,
  onRetry,
  onLoadMore,
  onRetryLoadMore,
  onClearFilters,
}: CommunicationInboxListProps) {
  const { t } = useLanguage();

  if (loading && conversations.length === 0) {
    return <CommunicationInboxSkeleton />;
  }

  if (error && conversations.length === 0) {
    return (
      <div className="p-3" data-testid="communication-inbox-error">
        <ErrorState compact title={t('communication.inbox.errorTitle')} description={error} onRetry={onRetry} />
      </div>
    );
  }

  if (!loading && conversations.length === 0) {
    const hasFilters = hasActiveCommunicationInboxFilters(filters);
    const hasSearch = Boolean(filters.search.trim());
    return (
      <div className="p-3" data-testid="communication-inbox-empty">
        <EmptyState
          compact
          title={
            hasSearch
              ? t('communication.inbox.searchEmptyTitle')
              : hasFilters
                ? t('communication.inbox.filteredEmptyTitle')
                : t('communication.inbox.emptyTitle')
          }
          description={
            hasSearch
              ? t('communication.inbox.searchEmptyDescription')
              : hasFilters
                ? t('communication.inbox.filteredEmptyDescription')
                : t('communication.inbox.emptyDescription')
          }
          action={
            hasFilters ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="sq-press rounded-lg border border-border/60 px-3 py-1.5 text-[11px] font-semibold"
              >
                {t('communication.inbox.clearFilters')}
              </button>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2"
        data-testid="communication-inbox-list"
        role="list"
        aria-label={t('communication.inbox.listLabel')}
      >
        {conversations.map((conversation) => (
          <CommunicationConversationRow
            key={conversation.id}
            conversation={conversation}
            selected={conversation.id === selectedConversationId}
            locale={locale}
            onSelect={onSelect}
          />
        ))}
      </div>

      <div className="shrink-0 border-t border-border/30 p-2">
        {paginationError && (
          <div className="mb-2 text-center">
            <p className="text-[11px] text-muted-foreground">{paginationError}</p>
            <button
              type="button"
              onClick={onRetryLoadMore}
              className="mt-1 text-[11px] font-semibold text-[color:var(--brand)]"
            >
              {t('communication.inbox.retryLoadMore')}
            </button>
          </div>
        )}
        {hasMore && !paginationError && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            data-testid="communication-inbox-load-more"
            className="sq-press flex w-full items-center justify-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-[11px] font-semibold text-foreground disabled:opacity-60"
          >
            {loadingMore ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t('communication.inbox.loadingMore')}
              </>
            ) : (
              t('communication.inbox.loadMore')
            )}
          </button>
        )}
      </div>
    </div>
  );
}
