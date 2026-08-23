import { useMemo, useState } from 'react';
import { AlertCircle, Bot, Loader2, Wrench } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  useCommunicationAiActivity,
  type CommunicationAiActivityFilterCategory,
} from '../../../lib/communication/hooks/useCommunicationAiActivity';
import type { CommunicationAiActivityItem } from '../../../lib/communication/types';
import { EmptyState } from '../../../components/patterns';

interface CommunicationAiActivityPaneProps {
  orgId: string | null | undefined;
  enabled: boolean;
  conversationId?: string | null;
  onOpenConversation: (conversationId: string) => void;
}

const FILTERS: CommunicationAiActivityFilterCategory[] = [
  'all',
  'handoffs',
  'tools',
  'errors',
];

function channelLabel(
  channel: string,
  t: ReturnType<typeof useLanguage>['t'],
): string {
  switch (channel) {
    case 'WHATSAPP':
      return t('communication.aiActivity.channel.whatsapp');
    case 'VOICE':
      return t('communication.aiActivity.channel.voice');
    case 'SMS':
      return 'SMS';
    default:
      return channel;
  }
}

function ActivityBadge({ item }: { item: CommunicationAiActivityItem }) {
  const { t } = useLanguage();
  if (item.activityType === 'HANDOFF_REQUESTED' && item.handoff && !item.handoff.resolved) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
        {t('communication.aiActivity.badge.needsHuman')}
      </span>
    );
  }
  if (item.activityType === 'AI_FAILURE' || item.tool?.outcome === 'FAILED') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:text-red-300">
        {t('communication.aiActivity.badge.failed')}
      </span>
    );
  }
  if (item.activityType === 'HANDOFF_ACCEPTED') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
        {t('communication.aiActivity.badge.resolved')}
      </span>
    );
  }
  return null;
}

function ActivityRow({
  item,
  onOpenConversation,
}: {
  item: CommunicationAiActivityItem;
  onOpenConversation: (conversationId: string) => void;
}) {
  const { t } = useLanguage();
  const isPriority =
    item.activityType === 'HANDOFF_REQUESTED'
    || item.activityType === 'AI_FAILURE';

  return (
    <div
      data-testid={`communication-ai-activity-row-${item.id}`}
      className={cn(
        'flex flex-col gap-2 border-b border-border/30 px-3 py-3 lg:grid lg:grid-cols-[88px_88px_minmax(0,1fr)_minmax(0,1.2fr)_auto] lg:items-center lg:gap-3',
        isPriority && 'bg-amber-500/[0.04]',
      )}
    >
      <time className="text-[11px] text-muted-foreground" dateTime={item.occurredAt}>
        {new Date(item.occurredAt).toLocaleString()}
      </time>
      <div className="text-[11px] font-medium text-foreground">
        {channelLabel(item.channel, t)}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[12px] font-medium text-foreground">{item.contactDisplay}</div>
        <div className="truncate text-[11px] text-muted-foreground">{item.agent.displayName}</div>
      </div>
      <div className="min-w-0">
        <div className="text-[12px] text-foreground">{item.summary}</div>
        {item.handoff?.reason ? (
          <div className="truncate text-[11px] text-muted-foreground">
            {item.handoff.reason}
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ActivityBadge item={item} />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[11px]"
          onClick={() => onOpenConversation(item.conversationId)}
        >
          {t('communication.aiActivity.openConversation')}
        </Button>
      </div>
    </div>
  );
}

export function CommunicationAiActivityPane({
  orgId,
  enabled,
  conversationId = null,
  onOpenConversation,
}: CommunicationAiActivityPaneProps) {
  const { t } = useLanguage();
  const [category, setCategory] = useState<CommunicationAiActivityFilterCategory>('all');
  const activity = useCommunicationAiActivity({
    orgId,
    category,
    conversationId: conversationId ?? undefined,
    enabled,
  });

  const filterLabels = useMemo(
    () => ({
      all: t('communication.aiActivity.filter.all'),
      handoffs: t('communication.aiActivity.filter.handoffs'),
      tools: t('communication.aiActivity.filter.tools'),
      errors: t('communication.aiActivity.filter.errors'),
    }),
    [t],
  );

  return (
    <div
      data-testid="communication-ai-activity-pane"
      className="flex min-h-0 flex-1 flex-col"
      role="region"
      aria-label={t('communication.aiActivity.title')}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border/30 px-3 py-3">
        <Bot className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">{t('communication.aiActivity.title')}</h2>
        <div className="ml-auto flex flex-wrap gap-1" role="tablist" aria-label={t('communication.aiActivity.filtersLabel')}>
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              role="tab"
              aria-selected={category === filter}
              data-testid={`communication-ai-activity-filter-${filter}`}
              className={cn(
                'rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                category === filter
                  ? 'bg-[color:var(--brand)]/15 text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              onClick={() => setCategory(filter)}
            >
              {filterLabels[filter]}
            </button>
          ))}
        </div>
      </div>

      {activity.loading ? (
        <div className="flex flex-1 items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          <span>{t('communication.aiActivity.loading')}</span>
        </div>
      ) : activity.error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertCircle className="h-5 w-5 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('communication.aiActivity.error')}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void activity.reload()}>
            {t('common.retry')}
          </Button>
        </div>
      ) : activity.items.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-5 w-5" aria-hidden />}
          title={t('communication.aiActivity.emptyTitle')}
          description={t('communication.aiActivity.emptyDescription')}
          className="h-full"
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto" role="list" aria-label={t('communication.aiActivity.listLabel')}>
          {activity.items.map((item) => (
            <ActivityRow key={item.id} item={item} onOpenConversation={onOpenConversation} />
          ))}
          {activity.hasMore ? (
            <div className="flex justify-center p-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={activity.loadingMore}
                onClick={() => void activity.loadMore()}
              >
                {activity.loadingMore ? t('communication.aiActivity.loadingMore') : t('communication.inbox.loadMore')}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
