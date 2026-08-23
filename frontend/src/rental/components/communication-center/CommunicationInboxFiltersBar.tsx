import { Search, X } from 'lucide-react';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { CommunicationApiStatus } from '../../../lib/communication/types';
import { CommunicationChannelFilters } from './CommunicationChannelFilters';
import type { CommunicationChannel } from './communication-center.types';
import {
  COMMUNICATION_SEARCH_MAX_LENGTH,
  type CommunicationAssignmentFilter,
  type CommunicationInboxFilters,
  type CommunicationIntentFilter,
  type CommunicationStatusFilter,
  type CommunicationVoiceCallFilter,
  type CommunicationVoiceDirectionFilter,
  type CommunicationVoiceOutcomeFilter,
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
  unreadBadgeLoading?: boolean;
}

export function CommunicationInboxFiltersBar({
  activeChannel,
  filters,
  searchDraft,
  onChannelChange,
  onSearchDraftChange,
  onFiltersChange,
  unreadBadgeCount,
  unreadBadgeLoading,
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
          maxLength={COMMUNICATION_SEARCH_MAX_LENGTH}
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
          aria-label={
            unreadBadgeCount != null && unreadBadgeCount > 0 && !unreadBadgeLoading
              ? t('communication.filters.unreadOnlyFilteredCount', { count: unreadBadgeCount })
              : t('communication.filters.unreadOnly')
          }
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
          {unreadBadgeCount != null && unreadBadgeCount > 0 && !unreadBadgeLoading && (
            <span
              className="inline-flex min-w-[1rem] items-center justify-center rounded bg-[color:var(--brand)] px-1 text-[9px] font-bold text-white"
              aria-hidden
            >
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

        <label className="sr-only" htmlFor="communication-intent-filter">
          {t('communication.filters.intentLabel')}
        </label>
        {activeChannel !== 'voice' ? (
          <select
            id="communication-intent-filter"
            value={filters.intent}
            onChange={(event) =>
              onFiltersChange({ intent: event.target.value as CommunicationIntentFilter })
            }
            data-testid="communication-filter-intent"
            className="sq-press rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
          >
            <option value="all">{t('communication.filters.intentAll')}</option>
            <option value="ai_suggested">{t('communication.filters.intentAiSuggested')}</option>
            <option value="unknown_customer">{t('communication.filters.intentUnknownCustomer')}</option>
            <option value="booking">{t('communication.filters.intentBooking')}</option>
            <option value="documents">{t('communication.filters.intentDocuments')}</option>
            <option value="payment">{t('communication.filters.intentPayment')}</option>
            <option value="damage">{t('communication.filters.intentDamage')}</option>
          </select>
        ) : (
          <>
            <select
              aria-label={t('communication.voice.filters.direction')}
              value={filters.voiceDirection}
              onChange={(event) =>
                onFiltersChange({
                  voiceDirection: event.target.value as CommunicationVoiceDirectionFilter,
                })
              }
              data-testid="communication-filter-voice-direction"
              className="sq-press rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
            >
              <option value="all">{t('communication.voice.filters.directionAll')}</option>
              <option value="INBOUND">{t('communication.voice.direction.inbound')}</option>
              <option value="OUTBOUND">{t('communication.voice.direction.outbound')}</option>
            </select>
            <select
              aria-label={t('communication.voice.filters.outcome')}
              value={filters.voiceOutcome}
              onChange={(event) =>
                onFiltersChange({
                  voiceOutcome: event.target.value as CommunicationVoiceOutcomeFilter,
                })
              }
              data-testid="communication-filter-voice-outcome"
              className="sq-press rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
            >
              <option value="all">{t('communication.voice.filters.outcomeAll')}</option>
              <option value="PENDING">{t('communication.voice.outcome.PENDING')}</option>
              <option value="RESOLVED">{t('communication.voice.outcome.RESOLVED')}</option>
              <option value="ESCALATED">{t('communication.voice.outcome.ESCALATED')}</option>
              <option value="FAILED">{t('communication.voice.outcome.FAILED')}</option>
              <option value="ABANDONED">{t('communication.voice.outcome.ABANDONED')}</option>
            </select>
            <select
              aria-label={t('communication.voice.filters.callFilter')}
              value={filters.voiceCallFilter}
              onChange={(event) =>
                onFiltersChange({
                  voiceCallFilter: event.target.value as CommunicationVoiceCallFilter,
                })
              }
              data-testid="communication-filter-voice-call"
              className="sq-press rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
            >
              <option value="all">{t('communication.voice.filters.callAll')}</option>
              <option value="escalated">{t('communication.voice.filters.escalatedOnly')}</option>
              <option value="hasTranscript">{t('communication.voice.filters.hasTranscript')}</option>
            </select>
            <input
              type="date"
              aria-label={t('communication.voice.filters.dateFrom')}
              value={filters.voiceDateFrom}
              onChange={(event) => onFiltersChange({ voiceDateFrom: event.target.value })}
              data-testid="communication-filter-voice-date-from"
              className="sq-press rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
            />
            <input
              type="date"
              aria-label={t('communication.voice.filters.dateTo')}
              value={filters.voiceDateTo}
              onChange={(event) => onFiltersChange({ voiceDateTo: event.target.value })}
              data-testid="communication-filter-voice-date-to"
              className="sq-press rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-[10px] font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
            />
          </>
        )}
      </div>
    </div>
  );
}
