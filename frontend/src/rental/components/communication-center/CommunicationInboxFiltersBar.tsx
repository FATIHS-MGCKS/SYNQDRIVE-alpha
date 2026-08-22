import { Search, X } from 'lucide-react';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationApiStatus } from '../../../lib/communication/types';
import { CommunicationChannelFilters } from './CommunicationChannelFilters';
import type { CommunicationChannel } from './communication-center.types';
import type {
  CommunicationAssignmentFilter,
  CommunicationInboxFilters,
  CommunicationStatusFilter,
} from './communication-inbox-state';

const STATUS_OPTIONS: CommunicationApiStatus[] = [
  'HUMAN_REQUIRED',
  'AI_ACTIVE',
  'HUMAN_ACTIVE',
  'WAITING_CUSTOMER',
  'RESOLVED',
  'FAILED',
];

interface CommunicationInboxFiltersBarProps {
  activeChannel: CommunicationChannel;
  filters: CommunicationInboxFilters;
  searchDraft: string;
  onChannelChange: (channel: CommunicationChannel) => void;
  onSearchDraftChange: (value: string) => void;
  onFiltersChange: (partial: Partial<CommunicationInboxFilters>) => void;
  unreadBadgeCount?: number | null;
}

export function CommunicationInboxFiltersBar({
  activeChannel,
  filters,
  searchDraft,
  onChannelChange,
  onSearchDraftChange,
  onFiltersChange,
  unreadBadgeCount,
}: CommunicationInboxFiltersBarProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-2" data-testid="communication-inbox-filters">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={searchDraft}
          onChange={(event) => onSearchDraftChange(event.target.value)}
          placeholder={t('communication.inbox.searchPlaceholder')}
          aria-label={t('communication.inbox.searchLabel')}
          data-testid="communication-inbox-search"
          className="w-full rounded-lg border border-border/60 bg-muted/30 py-2 pl-8 pr-8 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/30"
        />
        {searchDraft && (
          <button
            type="button"
            onClick={() => onSearchDraftChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
            aria-label={t('communication.inbox.searchClear')}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      <CommunicationChannelFilters activeChannel={activeChannel} onChannelChange={onChannelChange} />

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          aria-pressed={filters.unreadOnly}
          data-testid="communication-filter-unread"
          onClick={() => onFiltersChange({ unreadOnly: !filters.unreadOnly })}
          className={cn(
            'sq-press inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40',
            filters.unreadOnly
              ? 'bg-[color:var(--brand)]/12 text-[color:var(--brand)] ring-1 ring-[color:var(--brand)]/25'
              : 'bg-muted/40 text-muted-foreground hover:text-foreground',
          )}
        >
          {t('communication.filters.unreadOnly')}
          {unreadBadgeCount != null && unreadBadgeCount > 0 && (
            <span className="inline-flex min-w-[1rem] items-center justify-center rounded bg-[color:var(--brand)] px-1 text-[9px] font-bold text-white">
              {unreadBadgeCount > 99 ? '99+' : unreadBadgeCount}
            </span>
          )}
        </button>

        <label className="sr-only" htmlFor="communication-status-filter">
          {t('communication.filters.statusLabel')}
        </label>
        <select
          id="communication-status-filter"
          value={filters.status}
          onChange={(event) =>
            onFiltersChange({ status: event.target.value as CommunicationStatusFilter })
          }
          data-testid="communication-filter-status"
          className="sq-press rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
        >
          <option value="all">{t('communication.filters.statusAll')}</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {t(`communication.status.${status}` as const)}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="communication-assignment-filter">
          {t('communication.filters.assignmentLabel')}
        </label>
        <select
          id="communication-assignment-filter"
          value={filters.assignment}
          onChange={(event) =>
            onFiltersChange({ assignment: event.target.value as CommunicationAssignmentFilter })
          }
          data-testid="communication-filter-assignment"
          className="sq-press rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
        >
          <option value="all">{t('communication.filters.assignmentAll')}</option>
          <option value="unassigned">{t('communication.filters.assignmentUnassigned')}</option>
        </select>
      </div>
    </div>
  );
}
