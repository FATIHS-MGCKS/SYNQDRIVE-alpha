import { memo, useState } from 'react';
import { cn } from '../../../../components/ui/utils';
import type { ActionQueueGroupItem, ActionQueueItem } from '../dashboardTypes';
import { NotificationChildRow } from './NotificationChildRow';
import { NotificationSummaryRow } from './NotificationSummaryRow';
import { buildNotificationDetailViewModel } from './notification-task-bridge';
import { buildNotificationSummaryFromGroup } from './notification-summary-view-model';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { useLanguage } from '../../../i18n/LanguageContext';
import type { ResolveNotificationItemLifecycleHandlers } from './notification-item-lifecycle';

function groupSeveritySurface(severity: ActionQueueGroupItem['severity']): string {
  if (severity === 'critical' || severity === 'overdue') {
    return 'border-[color:color-mix(in_srgb,var(--status-critical)_22%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,transparent),transparent)]';
  }
  if (severity === 'warning' || severity === 'attention') {
    return 'border-[color:color-mix(in_srgb,var(--status-watch)_20%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-watch)_6%,transparent),transparent)]';
  }
  return 'border-border/30 bg-card/40';
}

export interface NotificationGroupCardProps {
  group: ActionQueueGroupItem;
  itemsById: Map<string, ActionQueueItem>;
  locale: string;
  referenceNowMs: number;
  t: ReturnType<typeof useLanguage>['t'];
  onItemCta: (item: ActionQueueItem) => void;
  onCreateTask?: (item: ActionQueueItem) => void;
  resolveItemLifecycleHandlers?: ResolveNotificationItemLifecycleHandlers;
}

export const NotificationGroupCard = memo(function NotificationGroupCard({
  group,
  itemsById,
  locale,
  referenceNowMs,
  t,
  onItemCta,
  onCreateTask,
  resolveItemLifecycleHandlers,
}: NotificationGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `notification-group-${group.id}`;
  const summary = buildNotificationSummaryFromGroup(group, itemsById, locale, referenceNowMs);
  if (!summary) return null;

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border transition-colors motion-reduce:transition-none',
        groupSeveritySurface(group.severity),
        summary.unread && 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_18%,transparent)]',
        expanded && 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]',
      )}
    >
      <div className="px-3 py-2.5">
        <NotificationSummaryRow
          summary={summary}
          t={t}
          locale={locale}
          expanded={expanded}
          showChevron
          unread={summary.unread}
          as="button"
          onToggle={() => setExpanded((value) => !value)}
        />
        {group.fleetCausesMayBeIncomplete ? (
          <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mt-1 text-muted-foreground')}>
            {t('dashboardAttention.fleetReadiness.moreCausesPossible')}
          </p>
        ) : null}
      </div>

      {expanded ? (
        <ul
          id={contentId}
          className={cn(
            NOTIFICATION_PANEL_TYPO.childList,
            'flex flex-col gap-1.5 border-t border-border/30 px-2.5 py-2 sm:px-3 animate-fade-up motion-reduce:animate-none',
          )}
          role="list"
        >
          {group.children.map((child) => {
            const item = itemsById.get(child.itemId);
            if (!item) return null;
            const detail = buildNotificationDetailViewModel(item, locale, referenceNowMs);
            const lifecycle = resolveItemLifecycleHandlers?.(child.itemId) ?? {};
            return (
              <li key={child.id} className="list-none">
                <NotificationChildRow
                  detail={detail}
                  t={t}
                  readStatus={item.queue?.readStatus}
                  availableActions={item.availableActions}
                  onPrimaryCta={() => onItemCta(item)}
                  onCreateTask={onCreateTask ? () => onCreateTask(item) : undefined}
                  onMarkRead={lifecycle.onMarkRead}
                  onAcknowledge={lifecycle.onAcknowledge}
                  onSnooze={lifecycle.onSnooze}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
});
