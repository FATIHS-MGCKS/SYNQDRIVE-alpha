import { memo, useState } from 'react';
import { cn } from '../../../../components/ui/utils';
import type { ActionQueueGroupItem, ActionQueueItem } from '../dashboardTypes';
import { NotificationChildRow } from './NotificationChildRow';
import { NotificationSummaryRow } from './NotificationSummaryRow';
import { buildNotificationDetailViewModel } from './notification-task-bridge';
import { buildNotificationSummaryFromGroup } from './notification-summary-view-model';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { useLanguage } from '../../../i18n/LanguageContext';
import { severityEntrySurface } from './notification-severity-styles';

export interface NotificationGroupCardProps {
  group: ActionQueueGroupItem;
  itemsById: Map<string, ActionQueueItem>;
  locale: string;
  referenceNowMs: number;
  t: ReturnType<typeof useLanguage>['t'];
  onItemCta: (item: ActionQueueItem) => void;
  onCreateTask?: (item: ActionQueueItem) => void;
  onSecondaryCta?: (item: ActionQueueItem) => void;
  mutationHandlers?: (itemId: string) => {
    onMarkRead?: () => void;
    onAcknowledge?: () => void;
    onSnooze?: () => void;
  };
}

export const NotificationGroupCard = memo(function NotificationGroupCard({
  group,
  itemsById,
  locale,
  referenceNowMs,
  t,
  onItemCta,
  onCreateTask,
  onSecondaryCta,
  mutationHandlers,
}: NotificationGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `notification-group-${group.id}`;
  const summary = buildNotificationSummaryFromGroup(group, itemsById, locale, referenceNowMs);
  if (!summary) return null;

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border transition-colors motion-reduce:transition-none',
        severityEntrySurface(group.severity, summary.resolved),
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
            const mutations = mutationHandlers?.(item.id);
            return (
              <li key={child.id} className="list-none">
                <NotificationChildRow
                  detail={detail}
                  t={t}
                  readStatus={item.queue?.readStatus}
                  onPrimaryCta={() => onItemCta(item)}
                  onSecondaryCta={onSecondaryCta ? () => onSecondaryCta(item) : undefined}
                  onCreateTask={onCreateTask ? () => onCreateTask(item) : undefined}
                  {...mutations}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
});
