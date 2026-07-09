import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StatusChip } from '../../../components/patterns';
import { EmptyState } from '../../../components/patterns/states';
import { cn } from '../../../components/ui/utils';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  VoiceConversationEntry,
  VoiceConversationListParams,
  VoiceConversationOutcome,
} from '../../../lib/api';
import { Icon } from '../ui/Icon';
import {
  directionLabel,
  formatDuration,
  isInbound,
  maskCallerNumber,
  OUTCOME_OPTIONS,
  outcomeBadgeTone,
} from './voice-conversation.utils';

interface VoiceConversationsPanelProps {
  orgId: string;
  isDarkMode: boolean;
  cardClassName: string;
  onConversationsChange?: (items: VoiceConversationEntry[]) => void;
}

const DEFAULT_FILTERS: VoiceConversationListParams = {
  limit: 50,
  page: 1,
};

export function VoiceConversationsPanel({
  orgId,
  isDarkMode,
  cardClassName,
  onConversationsChange,
}: VoiceConversationsPanelProps) {
  const [items, setItems] = useState<VoiceConversationEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<VoiceConversationListParams>(DEFAULT_FILTERS);
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [trainingExamples, setTrainingExamples] = useState<Set<string>>(new Set());
  const [creatingTaskId, setCreatingTaskId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.voiceAssistant.conversations(orgId, {
        ...filters,
        search: searchInput.trim() || undefined,
      });
      setItems(result.items);
      setTotal(result.total);
      onConversationsChange?.(result.items);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [orgId, filters, searchInput, onConversationsChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const sync = async () => {
    if (!orgId || syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await api.voiceAssistant.syncConversations(orgId);
      await load();
      return result;
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      throw err;
    } finally {
      setSyncing(false);
    }
  };

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

  const toggleTrainingExample = (id: string) => {
    setTrainingExamples(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createTaskFromCall = async (conversation: VoiceConversationEntry) => {
    if (!orgId) return;
    setCreatingTaskId(conversation.id);
    try {
      const title = `Follow-up: voice call ${new Date(conversation.startedAt).toLocaleDateString()}`;
      const description = [
        conversation.summary ? `Summary: ${conversation.summary}` : null,
        conversation.escalationReason ? `Escalation: ${conversation.escalationReason}` : null,
        `Conversation ID: ${conversation.id}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      await api.tasks.create(orgId, {
        title,
        description,
        type: 'CUSTOMER_FOLLOWUP',
        source: 'MANUAL',
        priority: conversation.escalated ? 'HIGH' : 'NORMAL',
        bookingId: conversation.linkedBookingId ?? undefined,
        customerId: conversation.linkedCustomerId ?? undefined,
        vehicleId: conversation.linkedVehicleId ?? undefined,
        metadata: {
          voiceConversationId: conversation.id,
          outcome: conversation.outcome,
        },
        sourceKey: 'VOICE_ASSISTANT',
      });
      toast.success('Task created from call');
    } catch (err) {
      toast.error('Could not create task', { description: getErrorMessage(err) });
    } finally {
      setCreatingTaskId(null);
    }
  };

  const inputCls = cn(
    'w-full rounded-lg px-3 py-2 text-xs outline-none transition-colors',
    isDarkMode
      ? 'surface-premium border border-neutral-700 text-gray-200 focus:border-purple-500/50'
      : 'bg-gray-50 border border-gray-200 text-gray-800 focus:border-purple-400',
  );

  const selectCls = inputCls;

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.escalatedOnly) parts.push('Escalated');
    if (filters.hasTranscript) parts.push('With transcript');
    if (filters.outcome) parts.push(filters.outcome);
    return parts.join(' · ');
  }, [filters]);

  return (
    <div className={cn(cardClassName, 'p-5 space-y-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className={cn('text-sm font-bold', isDarkMode ? 'text-white' : 'text-gray-900')}>
            Conversation Logs
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Filter, review, and prepare follow-ups from synced calls.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void sync().catch(() => undefined)}
          disabled={syncing || loading}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60',
            isDarkMode
              ? 'surface-premium text-gray-300 hover:bg-neutral-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
          )}
        >
          {syncing ? (
            <Icon name="loader-2" className="w-3 h-3 animate-spin" />
          ) : (
            <Icon name="refresh-cw" className="w-3 h-3" />
          )}
          {syncing ? 'Syncing…' : 'Sync from ElevenLabs'}
        </button>
      </div>

      {error && (
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            isDarkMode
              ? 'border-red-500/30 bg-red-500/10 text-red-300'
              : 'border-red-200 bg-red-50 text-red-700',
          )}
        >
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
          placeholder="Search summary, transcript, number…"
          className={inputCls}
        />
        <select
          value={filters.direction ?? 'all'}
          onChange={e => updateFilter('direction', e.target.value as VoiceConversationListParams['direction'])}
          className={selectCls}
        >
          <option value="all">All directions</option>
          <option value="inbound">Inbound</option>
          <option value="outbound">Outbound</option>
        </select>
        <select
          value={filters.outcome ?? 'all'}
          onChange={e => updateFilter('outcome', e.target.value as VoiceConversationOutcome)}
          className={selectCls}
        >
          <option value="all">All outcomes</option>
          {OUTCOME_OPTIONS.map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          value={
            filters.escalatedOnly
              ? 'escalated'
              : filters.hasTranscript
                ? 'transcript'
                : 'all'
          }
          onChange={e => {
            const value = e.target.value;
            setFilters(prev => ({
              ...prev,
              page: 1,
              escalatedOnly: value === 'escalated' ? true : undefined,
              hasTranscript: value === 'transcript' ? true : undefined,
            }));
          }}
          className={selectCls}
        >
          <option value="all">All calls</option>
          <option value="escalated">Escalated only</option>
          <option value="transcript">Has transcript</option>
        </select>
      </div>

      <div className="grid gap-2 md:grid-cols-3">
        <input
          type="date"
          value={filters.dateFrom?.slice(0, 10) ?? ''}
          onChange={e => updateFilter('dateFrom', e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined)}
          className={inputCls}
          aria-label="From date"
        />
        <input
          type="date"
          value={filters.dateTo?.slice(0, 10) ?? ''}
          onChange={e => updateFilter('dateTo', e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined)}
          className={inputCls}
          aria-label="To date"
        />
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className={cn(
            'rounded-lg px-3 py-2 text-xs font-semibold',
            isDarkMode ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-50 text-purple-700',
          )}
        >
          {loading ? 'Loading…' : 'Apply filters'}
        </button>
      </div>

      {filterSummary && (
        <p className="text-[10px] text-muted-foreground">Active filters: {filterSummary}</p>
      )}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
          <Icon name="loader-2" className="w-4 h-4 animate-spin mr-2" />
          Loading conversations…
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          compact
          icon={<Icon name="file-text" className="h-5 w-5" />}
          title="No conversations match"
          description="Sync from ElevenLabs or adjust filters to see call history, transcripts, and escalation patterns."
          action={
            <button
              type="button"
              onClick={() => void sync().catch(() => undefined)}
              disabled={syncing}
              className="sq-press rounded-lg border border-border/60 surface-premium px-4 py-2 text-xs font-semibold disabled:opacity-60"
            >
              {syncing ? 'Syncing…' : 'Sync from ElevenLabs'}
            </button>
          }
        />
      ) : (
        <>
          <p className="text-[10px] text-muted-foreground">
            Showing {items.length} of {total} conversation{total === 1 ? '' : 's'}
          </p>
          <div className="space-y-2">
            {items.map(conversation => {
              const expanded = expandedId === conversation.id;
              const isTraining = trainingExamples.has(conversation.id);
              return (
                <div
                  key={conversation.id}
                  className={cn(
                    'p-3 rounded-lg transition-colors',
                    isDarkMode
                      ? 'bg-neutral-900/50 hover:surface-premium'
                      : 'bg-gray-50/80 hover:bg-gray-100/80',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon
                        name={isInbound(conversation.direction) ? 'phone-incoming' : 'phone-outgoing'}
                        className={cn(
                          'w-3 h-3',
                          isInbound(conversation.direction) ? 'text-emerald-500' : 'text-status-info',
                        )}
                      />
                      <span
                        className={cn(
                          'text-xs font-semibold',
                          isDarkMode ? 'text-gray-200' : 'text-gray-700',
                        )}
                      >
                        {maskCallerNumber(conversation.callerNumber)}
                      </span>
                      <StatusChip tone="neutral">{directionLabel(conversation.direction)}</StatusChip>
                      <StatusChip tone={outcomeBadgeTone(conversation.outcome)}>
                        {conversation.outcome}
                      </StatusChip>
                      {conversation.escalated && (
                        <StatusChip tone="warning">Escalated</StatusChip>
                      )}
                      {isTraining && (
                        <StatusChip tone="ai">Training example</StatusChip>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {new Date(conversation.startedAt).toLocaleString()} ·{' '}
                      {formatDuration(conversation.durationSeconds)}
                    </span>
                  </div>

                  {conversation.summary && (
                    <p className="text-[11px] text-muted-foreground mb-2">{conversation.summary}</p>
                  )}
                  {conversation.escalationReason && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mb-2">
                      Escalation: {conversation.escalationReason}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1.5 mb-2">
                    <button
                      type="button"
                      disabled={creatingTaskId === conversation.id}
                      onClick={() => void createTaskFromCall(conversation).catch(() => undefined)}
                      className={cn(
                        'px-2 py-1 rounded text-[10px] font-semibold disabled:opacity-60',
                        isDarkMode
                          ? 'surface-premium text-gray-300 hover:bg-neutral-700'
                          : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
                      )}
                    >
                      {creatingTaskId === conversation.id ? 'Creating…' : 'Create task from call'}
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Booking link API coming soon"
                      className="px-2 py-1 rounded text-[10px] font-semibold opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
                    >
                      Link to booking
                    </button>
                    <button
                      type="button"
                      disabled
                      title="Customer link API coming soon"
                      className="px-2 py-1 rounded text-[10px] font-semibold opacity-50 cursor-not-allowed bg-muted text-muted-foreground"
                    >
                      Link to customer
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleTrainingExample(conversation.id)}
                      className={cn(
                        'px-2 py-1 rounded text-[10px] font-semibold',
                        isTraining
                          ? isDarkMode
                            ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-purple-50 text-purple-700'
                          : isDarkMode
                            ? 'surface-premium text-gray-300 hover:bg-neutral-700'
                            : 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
                      )}
                    >
                      {isTraining ? 'Unmark training' : 'Mark as training example'}
                    </button>
                  </div>

                  {conversation.hasTranscript ? (
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedId(expanded ? null : conversation.id)
                        }
                        className="text-[10px] font-semibold text-purple-500 hover:underline"
                      >
                        {expanded ? 'Hide transcript' : 'View transcript'}
                      </button>
                      {expanded && conversation.transcript && (
                        <pre
                          className={cn(
                            'mt-2 text-[10px] p-2 rounded whitespace-pre-wrap max-h-48 overflow-y-auto',
                            isDarkMode
                              ? 'surface-premium text-gray-300'
                              : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {conversation.transcript}
                        </pre>
                      )}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">No transcript available</p>
                  )}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setFilters(prev => ({ ...prev, page: Math.max(1, (prev.page ?? 1) - 1) }))}
                className="text-xs font-semibold text-muted-foreground disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-[10px] text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setFilters(prev => ({ ...prev, page: (prev.page ?? 1) + 1 }))}
                className="text-xs font-semibold text-muted-foreground disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
