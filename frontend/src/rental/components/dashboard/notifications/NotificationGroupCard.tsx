import { memo, useState } from 'react';
import { Icon } from '../../ui/Icon';
import { cn } from '../../../../components/ui/utils';
import type { ActionQueueGroupItem, ActionQueueItem } from '../dashboardTypes';
import { childSeverityRank } from '../actionQueueGrouping';
import type { NotificationCardViewModel } from './notificationCardViewModel';
import { NotificationCard } from './NotificationCard';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { useLanguage } from '../../../i18n/LanguageContext';
import type { DashboardViewModel } from '../dashboardTypes';
import { notificationGroupIcon } from './notificationDomainIcon';

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
  cardsById: Map<string, NotificationCardViewModel>;
  t: ReturnType<typeof useLanguage>['t'];
  vm: DashboardViewModel;
  onItemCta: (item: ActionQueueItem) => void;
  snoozeDefaultUntil: () => string;
}

export const NotificationGroupCard = memo(function NotificationGroupCard({
  group,
  itemsById,
  cardsById,
  t,
  vm,
  onItemCta,
  snoozeDefaultUntil,
}: NotificationGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const contentId = `notification-group-${group.id}`;
  const severityRank = childSeverityRank(group.severity);
  const severityLabel =
    group.severity === 'critical' || group.severity === 'overdue'
      ? t('notification.severity.critical')
      : group.severity === 'warning' || group.severity === 'attention'
        ? t('notification.severity.warning')
        : t('notification.severity.info');

  return (
    <article
      className={cn(
        'overflow-hidden rounded-xl border transition-colors motion-reduce:transition-none',
        groupSeveritySurface(group.severity),
        expanded && 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_12%,transparent)]',
      )}
    >
      <button
        type="button"
        className={cn(
          'flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
        )}
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((value) => !value)}
      >
        <div
          className={cn(
            NOTIFICATION_PANEL_TYPO.iconWrap,
            severityRank >= childSeverityRank('critical')
              ? 'sq-tone-critical'
              : severityRank >= childSeverityRank('warning')
                ? 'sq-tone-watch'
                : 'bg-muted/50 text-muted-foreground',
          )}
          aria-hidden
        >
          <Icon
            name={notificationGroupIcon(group, itemsById)}
            className={NOTIFICATION_PANEL_TYPO.icon}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span
              className={cn(
                NOTIFICATION_PANEL_TYPO.metaBadge,
                group.severity === 'critical' || group.severity === 'overdue'
                  ? 'bg-[color:color-mix(in_srgb,var(--status-critical)_12%,transparent)] text-[color:var(--status-critical)]'
                  : group.severity === 'warning' || group.severity === 'attention'
                    ? 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]'
                    : 'bg-muted/60 text-muted-foreground',
              )}
            >
              {severityLabel}
            </span>
            <span className={NOTIFICATION_PANEL_TYPO.meta}>{group.subtitle}</span>
          </div>
          <p className={cn(NOTIFICATION_PANEL_TYPO.cardTitle, 'mt-1')}>{group.title}</p>
          {!expanded ? (
            <p className={cn(NOTIFICATION_PANEL_TYPO.description, 'mt-1 line-clamp-2')}>
              {group.children
                .slice(0, 2)
                .map((child) => child.title)
                .join(' · ')}
              {group.children.length > 2
                ? ` · +${group.children.length - 2}`
                : ''}
            </p>
          ) : null}
        </div>

        <span
          className={cn(
            'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden
        >
          <Icon name="chevron-down" className="h-4 w-4" />
        </span>
      </button>

      {expanded ? (
        <ul
          id={contentId}
          className="flex flex-col gap-2 border-t border-border/30 px-2 py-2 sm:px-2.5 animate-fade-up motion-reduce:animate-none"
          role="list"
        >
          {group.children.map((child) => {
            const item = itemsById.get(child.itemId);
            const card = cardsById.get(child.itemId);
            if (!item || !card) return null;
            return (
              <li key={child.id} className="list-none">
                <NotificationCard
                  card={card}
                  t={t}
                  compact
                  unread={card.readStatus === 'unread'}
                  onOpen={() => vm.openDrilldown({ type: 'action-item', itemId: child.itemId })}
                  onCta={() => onItemCta(item)}
                  onMarkRead={
                    vm.notificationMutations?.markRead
                      ? () => void vm.notificationMutations?.markRead(child.itemId)
                      : undefined
                  }
                  onAcknowledge={
                    vm.notificationMutations?.acknowledge
                      ? () => void vm.notificationMutations?.acknowledge(child.itemId)
                      : undefined
                  }
                  onSnooze={
                    vm.notificationMutations?.snooze
                      ? () => void vm.notificationMutations?.snooze(child.itemId, snoozeDefaultUntil())
                      : undefined
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
});
