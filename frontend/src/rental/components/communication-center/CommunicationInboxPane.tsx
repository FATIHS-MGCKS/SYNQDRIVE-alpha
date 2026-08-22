import { useEffect, useMemo, useState } from 'react';
import { useCommunicationInbox } from '../../../lib/communication/hooks/useCommunicationInbox';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { CommunicationInboxFiltersBar } from './CommunicationInboxFiltersBar';
import { CommunicationInboxList } from './CommunicationInboxList';
import {
  buildCommunicationInboxApiQuery,
  DEFAULT_COMMUNICATION_INBOX_FILTERS,
  type CommunicationInboxFilters,
} from './communication-inbox-state';
import type { CommunicationChannel } from './communication-center.types';

interface CommunicationInboxPaneProps {
  activeChannel: CommunicationChannel;
  inboxFilters: CommunicationInboxFilters;
  selectedConversationId: string | null;
  onChannelChange: (channel: CommunicationChannel) => void;
  onInboxFiltersChange: (partial: Partial<CommunicationInboxFilters>) => void;
  onSelectConversation: (conversationId: string) => void;
  onClearInboxFilters: () => void;
}

export function CommunicationInboxPane({
  activeChannel,
  inboxFilters,
  selectedConversationId,
  onChannelChange,
  onInboxFiltersChange,
  onSelectConversation,
  onClearInboxFilters,
}: CommunicationInboxPaneProps) {
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();
  const [searchDraft, setSearchDraft] = useState(inboxFilters.search);
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  useEffect(() => {
    setSearchDraft(inboxFilters.search);
  }, [inboxFilters.search]);

  useEffect(() => {
    if (debouncedSearch === inboxFilters.search) return;
    onInboxFiltersChange({ search: debouncedSearch });
  }, [debouncedSearch, inboxFilters.search, onInboxFiltersChange]);

  const apiQuery = useMemo(
    () => buildCommunicationInboxApiQuery(activeChannel, inboxFilters),
    [activeChannel, inboxFilters],
  );

  const inbox = useCommunicationInbox({
    orgId,
    filters: apiQuery,
    enabled: Boolean(orgId),
  });

  return (
    <div
      data-testid="communication-inbox-pane"
      className="flex h-full min-h-0 flex-col border-border/40 bg-background"
    >
      <header className="shrink-0 space-y-2 border-b border-border/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-foreground">{t('communication.inbox.title')}</h2>
          {inbox.summary && inbox.summary.unreadConversations > 0 && (
            <span
              className="rounded-md bg-[color:var(--brand)]/12 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[color:var(--brand)]"
              data-testid="communication-inbox-unread-summary"
            >
              {inbox.summary.unreadConversations}
            </span>
          )}
        </div>
        <CommunicationInboxFiltersBar
          activeChannel={activeChannel}
          filters={inboxFilters}
          searchDraft={searchDraft}
          onChannelChange={onChannelChange}
          onSearchDraftChange={setSearchDraft}
          onFiltersChange={onInboxFiltersChange}
          unreadBadgeCount={inbox.summary?.unreadConversations ?? null}
        />
      </header>

      <CommunicationInboxList
        conversations={inbox.conversations}
        selectedConversationId={selectedConversationId}
        filters={inboxFilters}
        locale={locale}
        loading={inbox.loading}
        loadingMore={inbox.loadingMore}
        hasMore={inbox.hasMore}
        error={inbox.error}
        paginationError={inbox.paginationError}
        onSelect={onSelectConversation}
        onRetry={() => void inbox.reload()}
        onLoadMore={() => void inbox.loadMore()}
        onRetryLoadMore={() => void inbox.retryLoadMore()}
        onClearFilters={onClearInboxFilters}
      />
    </div>
  );
}

export { DEFAULT_COMMUNICATION_INBOX_FILTERS };
