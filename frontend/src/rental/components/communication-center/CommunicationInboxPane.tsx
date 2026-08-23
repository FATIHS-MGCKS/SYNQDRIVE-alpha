import { useEffect, useMemo, useState } from 'react';
import { getStoredUser } from '../../../lib/auth';
import { useCommunicationInbox } from '../../../lib/communication/hooks/useCommunicationInbox';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useLanguage } from '../../i18n/LanguageContext';
import { useRentalOrg } from '../../RentalContext';
import { CommunicationInboxFiltersBar } from './CommunicationInboxFiltersBar';
import { CommunicationInboxList } from './CommunicationInboxList';
import {
  buildCommunicationInboxApiQuery,
  clampCommunicationSearchDraft,
  COMMUNICATION_SEARCH_MAX_LENGTH,
  DEFAULT_COMMUNICATION_INBOX_FILTERS,
  type CommunicationInboxFilters,
} from './communication-inbox-state';
import type { CommunicationChannel } from './communication-center.types';

interface CommunicationInboxPaneProps {
  enabled?: boolean;
  activeChannel: CommunicationChannel;
  inboxFilters: CommunicationInboxFilters;
  selectedConversationId: string | null;
  refreshNonce?: number;
  onChannelChange: (channel: CommunicationChannel) => void;
  onInboxFiltersChange: (partial: Partial<CommunicationInboxFilters>) => void;
  onSelectConversation: (conversationId: string) => void;
  onClearInboxFilters: () => void;
}

export function CommunicationInboxPane({
  enabled = true,
  activeChannel,
  inboxFilters,
  selectedConversationId,
  refreshNonce = 0,
  onChannelChange,
  onInboxFiltersChange,
  onSelectConversation,
  onClearInboxFilters,
}: CommunicationInboxPaneProps) {
  const { t, locale } = useLanguage();
  const { orgId } = useRentalOrg();
  const currentUserId = getStoredUser()?.id ?? null;
  const [searchDraft, setSearchDraft] = useState(() =>
    clampCommunicationSearchDraft(inboxFilters.search),
  );
  const debouncedSearch = useDebouncedValue(searchDraft, 350);

  useEffect(() => {
    setSearchDraft(clampCommunicationSearchDraft(inboxFilters.search));
  }, [inboxFilters.search]);

  useEffect(() => {
    const normalized = clampCommunicationSearchDraft(debouncedSearch);
    if (normalized === inboxFilters.search) return;
    onInboxFiltersChange({ search: normalized });
  }, [debouncedSearch, inboxFilters.search, onInboxFiltersChange]);

  const apiQuery = useMemo(
    () => buildCommunicationInboxApiQuery(activeChannel, inboxFilters),
    [activeChannel, inboxFilters],
  );

  const inbox = useCommunicationInbox({
    orgId,
    filters: apiQuery,
    enabled: Boolean(orgId && enabled),
  });

  const { reload } = inbox;

  useEffect(() => {
    if (!refreshNonce) return;
    void reload();
  }, [refreshNonce, reload]);

  return (
    <div
      data-testid="communication-inbox-pane"
      className="flex h-full min-h-0 flex-col border-border/40 bg-background"
    >
      <header className="shrink-0 space-y-2 border-b border-border/40 p-3">
        <h2 className="text-[13px] font-semibold text-foreground">{t('communication.inbox.title')}</h2>
        <CommunicationInboxFiltersBar
          activeChannel={activeChannel}
          filters={inboxFilters}
          searchDraft={searchDraft}
          onChannelChange={onChannelChange}
          onSearchDraftChange={(value) => setSearchDraft(clampCommunicationSearchDraft(value))}
          onFiltersChange={onInboxFiltersChange}
          unreadBadgeCount={inbox.summary?.unreadConversations ?? null}
          unreadBadgeLoading={inbox.loadingSummary}
        />
      </header>

      <CommunicationInboxList
        conversations={inbox.conversations}
        selectedConversationId={selectedConversationId}
        filters={inboxFilters}
        activeChannel={activeChannel}
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
        currentUserId={currentUserId}
      />
    </div>
  );
}

export { DEFAULT_COMMUNICATION_INBOX_FILTERS, COMMUNICATION_SEARCH_MAX_LENGTH };
