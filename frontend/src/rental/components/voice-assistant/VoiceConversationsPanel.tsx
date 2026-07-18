import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceAssistantData,
  VoiceConversationEntry,
  VoiceConversationListParams,
  VoiceConversationOutcome,
} from '../../../lib/api';
import { formatMoneyCents } from '../../../lib/money';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import { VoiceConversationDetailDrawer } from './VoiceConversationDetailDrawer';
import {
  conversationIntent,
  estimatedCallCostCents,
  formatDuration,
  isFinalizedConversation,
  isInbound,
  maskCallerNumber,
  OUTCOME_OPTIONS,
  outcomeBadgeTone,
  resolveFollowUpKind,
  resolvePrivacyStatus,
  shortEntityRef,
} from './voice-conversation.utils';

interface VoiceConversationsPanelProps {
  orgId: string;
  assistant: VoiceAssistantData | null;
  isDarkMode: boolean;
  cardClassName: string;
  initialEscalatedOnly?: boolean;
  preselectedConversationId?: string | null;
  onConversationsChange?: (items: VoiceConversationEntry[]) => void;
  onPreselectHandled?: () => void;
}

const DEFAULT_FILTERS: VoiceConversationListParams = {
  limit: 25,
  page: 1,
};

export function VoiceConversationsPanel({
  orgId,
  assistant,
  isDarkMode,
  cardClassName,
  initialEscalatedOnly = false,
  preselectedConversationId = null,
  onConversationsChange,
  onPreselectHandled,
}: VoiceConversationsPanelProps) {
  const { t, locale } = useLanguage();
  const moneyLocale = locale === 'de' ? 'de-DE' : 'en-US';
  const [items, setItems] = useState<VoiceConversationEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<VoiceConversationListParams>({
    ...DEFAULT_FILTERS,
    escalatedOnly: initialEscalatedOnly || undefined,
  });
  const [searchInput, setSearchInput] = useState('');
  const [intentFilter, setIntentFilter] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<VoiceConversationEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [centsPerMinute, setCentsPerMinute] = useState(0);

  useEffect(() => {
    if (!orgId) return;
    void api.voiceAssistant.billing.usage(orgId)
      .then(usage => {
        if (usage.consumedMinutes > 0 && usage.estimatedUsageRevenueCents > 0) {
          setCentsPerMinute(Math.round(usage.estimatedUsageRevenueCents / usage.consumedMinutes));
        }
      })
      .catch(() => undefined);
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.voiceAssistant.conversations(orgId, {
        ...filters,
        search: searchInput.trim() || undefined,
      });
      let nextItems = result.items;
      if (intentFilter.trim()) {
        const needle = intentFilter.trim().toLowerCase();
        nextItems = nextItems.filter(item => {
          const intent = conversationIntent(item)?.toLowerCase() ?? '';
          return intent.includes(needle);
        });
      }
      if (errorsOnly) {
        nextItems = nextItems.filter(item => Boolean(item.errorMessage));
      }
      setItems(nextItems);
      setTotal(errorsOnly || intentFilter.trim() ? nextItems.length : result.total);
      onConversationsChange?.(result.items);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orgId, filters, searchInput, intentFilter, errorsOnly, onConversationsChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!preselectedConversationId || items.length === 0) return;
    const match = items.find(item => item.id === preselectedConversationId);
    if (match) {
      setSelected(match);
      setDrawerOpen(true);
      onPreselectHandled?.();
    }
  }, [preselectedConversationId, items, onPreselectHandled]);

  const updateFilter = <K extends keyof VoiceConversationListParams>(
    key: K,
    value: VoiceConversationListParams[K] | undefined,
  ) => {
    setFilters(prev => ({
      ...prev,
      page: 1,
      [key]: value === '' || value === 'all' ? undefined : value,
    }));
  };

  const inputCls = cn(
    'w-full rounded-lg px-3 py-2 text-xs outline-none transition-colors',
    isDarkMode
      ? 'surface-premium border border-neutral-700 text-gray-200 focus:border-purple-500/50'
      : 'bg-gray-50 border border-gray-200 text-gray-800 focus:border-purple-400',
  );

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.escalatedOnly) parts.push(t('voice.conversations.filters.escalated'));
    if (filters.outcome) parts.push(t(`voice.conversations.outcome.${filters.outcome}` as 'voice.conversations.outcome.RESOLVED'));
    if (filters.direction) parts.push(t(`voice.conversations.direction.${String(filters.direction).toLowerCase()}` as 'voice.conversations.direction.inbound'));
    if (errorsOnly) parts.push(t('voice.conversations.filters.errors'));
    if (intentFilter.trim()) parts.push(intentFilter.trim());
    return parts.join(' · ');
  }, [filters, errorsOnly, intentFilter, t]);

  const openConversation = (conversation: VoiceConversationEntry) => {
    setSelected(conversation);
    setDrawerOpen(true);
  };

  return (
    <div className={cn(cardClassName, 'space-y-4 p-5')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={cn('text-sm font-bold', isDarkMode ? 'text-white' : 'text-gray-900')}>
            {t('voice.conversations.title')}
          </h3>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{t('voice.conversations.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="sq-press inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          <Icon name={loading ? 'loader-2' : 'refresh-cw'} className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          {t('voice.common.retry')}
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-[color:var(--status-critical)]/30 bg-[color:var(--status-critical)]/10 px-3 py-2 text-xs text-[color:var(--status-critical)]">
          {error}
        </div>
      )}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <input
          type="search"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') void load();
          }}
          placeholder={t('voice.conversations.searchPlaceholder')}
          className={inputCls}
          aria-label={t('voice.conversations.searchPlaceholder')}
        />
        <select
          value={filters.direction ?? 'all'}
          onChange={e => updateFilter('direction', e.target.value as VoiceConversationListParams['direction'])}
          className={inputCls}
          aria-label={t('voice.conversations.filters.direction')}
        >
          <option value="all">{t('voice.conversations.filters.allDirections')}</option>
          <option value="inbound">{t('voice.conversations.direction.inbound')}</option>
          <option value="outbound">{t('voice.conversations.direction.outbound')}</option>
        </select>
        <select
          value={filters.outcome ?? 'all'}
          onChange={e => updateFilter('outcome', e.target.value as VoiceConversationOutcome)}
          className={inputCls}
          aria-label={t('voice.conversations.filters.outcome')}
        >
          <option value="all">{t('voice.conversations.filters.allOutcomes')}</option>
          {OUTCOME_OPTIONS.map(o => (
            <option key={o} value={o}>
              {t(`voice.conversations.outcome.${o}` as 'voice.conversations.outcome.RESOLVED')}
            </option>
          ))}
        </select>
        <select
          value={filters.escalatedOnly ? 'escalated' : 'all'}
          onChange={e => updateFilter('escalatedOnly', e.target.value === 'escalated' ? true : undefined)}
          className={inputCls}
          aria-label={t('voice.conversations.filters.escalation')}
        >
          <option value="all">{t('voice.conversations.filters.allCalls')}</option>
          <option value="escalated">{t('voice.conversations.filters.escalated')}</option>
        </select>
      </div>

      <div className="grid gap-2 md:grid-cols-4">
        <input
          type="date"
          value={filters.dateFrom?.slice(0, 10) ?? ''}
          onChange={e =>
            updateFilter('dateFrom', e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined)
          }
          className={inputCls}
          aria-label={t('voice.conversations.filters.from')}
        />
        <input
          type="date"
          value={filters.dateTo?.slice(0, 10) ?? ''}
          onChange={e =>
            updateFilter('dateTo', e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined)
          }
          className={inputCls}
          aria-label={t('voice.conversations.filters.to')}
        />
        <input
          type="search"
          value={intentFilter}
          onChange={e => setIntentFilter(e.target.value)}
          placeholder={t('voice.conversations.filters.intent')}
          className={inputCls}
          aria-label={t('voice.conversations.filters.intent')}
        />
        <label className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={e => setErrorsOnly(e.target.checked)}
          />
          {t('voice.conversations.filters.errors')}
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg bg-[color:var(--brand-soft)] px-3 py-2 text-xs font-semibold text-[color:var(--brand-ink)] disabled:opacity-60"
        >
          {loading ? t('voice.common.loading') : t('voice.conversations.applyFilters')}
        </button>
        {filterSummary && (
          <p className="text-[10px] text-muted-foreground">
            {t('voice.conversations.activeFilters', { filters: filterSummary })}
          </p>
        )}
      </div>

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
          <Icon name="loader-2" className="mr-2 h-4 w-4 animate-spin" />
          {t('voice.common.loading')}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="file-text" className="h-5 w-5" />}
          title={t('voice.conversations.emptyTitle')}
          description={t('voice.conversations.emptyDesc')}
        />
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground">
            {t('voice.conversations.showing', { count: items.length, total })}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('voice.conversations.col.direction')}</TableHead>
                <TableHead>{t('voice.conversations.col.customer')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('voice.conversations.col.booking')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('voice.conversations.col.intent')}</TableHead>
                <TableHead>{t('voice.conversations.col.outcome')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('voice.conversations.col.duration')}</TableHead>
                <TableHead className="hidden xl:table-cell">{t('voice.conversations.col.time')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('voice.conversations.col.followUp')}</TableHead>
                <TableHead className="hidden xl:table-cell">{t('voice.conversations.col.cost')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('voice.conversations.col.privacy')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(conversation => {
                const privacy = resolvePrivacyStatus(conversation, assistant);
                const followUp = resolveFollowUpKind(conversation);
                const costCents = estimatedCallCostCents(conversation, centsPerMinute);
                const finalized = isFinalizedConversation(conversation);
                return (
                  <TableRow
                    key={conversation.id}
                    className="cursor-pointer"
                    onClick={() => openConversation(conversation)}
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openConversation(conversation);
                      }
                    }}
                    aria-label={t('voice.conversations.openDetail')}
                  >
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-[10px]">
                        <Icon
                          name={isInbound(conversation.direction) ? 'phone-incoming' : 'phone-outgoing'}
                          className="h-3 w-3"
                        />
                        {t(
                          isInbound(conversation.direction)
                            ? 'voice.conversations.direction.inbound'
                            : 'voice.conversations.direction.outbound',
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[120px] truncate text-[11px] font-medium">
                      {conversation.linkedCustomerId
                        ? shortEntityRef(conversation.linkedCustomerId)
                        : maskCallerNumber(conversation.callerNumber) ?? t('voice.ops.unknownCaller')}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[10px]">
                      {conversation.linkedBookingId ? shortEntityRef(conversation.linkedBookingId) : '—'}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell max-w-[160px] truncate text-[10px] text-muted-foreground">
                      {conversationIntent(conversation) ?? '—'}
                    </TableCell>
                    <TableCell>
                      <StatusChip tone={outcomeBadgeTone(conversation.outcome)} className="text-[9px]">
                        {!finalized
                          ? t('voice.conversations.pendingFinalization')
                          : t(`voice.conversations.outcome.${conversation.outcome}` as 'voice.conversations.outcome.RESOLVED')}
                      </StatusChip>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-[10px] tabular-nums">
                      {formatDuration(conversation.durationSeconds)}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-[10px] tabular-nums text-muted-foreground">
                      {new Date(conversation.startedAt).toLocaleString(moneyLocale)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-[10px]">
                      {t(`voice.conversations.followUp.${followUp}` as 'voice.conversations.followUp.none')}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-[10px] tabular-nums">
                      {costCents == null ? '—' : formatMoneyCents(costCents, 'EUR', moneyLocale)}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-[10px]">
                      {t(`voice.conversations.privacy.${privacy}` as 'voice.conversations.privacy.full')}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <nav className="flex items-center justify-between pt-2" aria-label={t('voice.conversations.pagination')}>
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, (prev.page ?? 1) - 1) }))}
                className="text-xs font-semibold text-muted-foreground disabled:opacity-40"
              >
                {t('voice.conversations.previous')}
              </button>
              <span className="text-[10px] text-muted-foreground">
                {t('voice.conversations.page', { page, total: totalPages })}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setFilters(prev => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
                className="text-xs font-semibold text-muted-foreground disabled:opacity-40"
              >
                {t('voice.conversations.next')}
              </button>
            </nav>
          )}
        </>
      )}

      <VoiceConversationDetailDrawer
        orgId={orgId}
        conversation={selected}
        assistant={assistant}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        centsPerMinute={centsPerMinute}
        onTaskCreated={() => void load()}
      />
    </div>
  );
}
