import { memo } from 'react';
import { Icon } from '../../ui/Icon';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { NotificationDetailViewModel } from './notification-detail-view-model';
import type { useLanguage } from '../../../i18n/LanguageContext';
import type { ApiNotificationAvailableAction } from '../../../lib/notifications/notification-api.types';

export interface NotificationDetailPanelProps {
  detail: NotificationDetailViewModel;
  t: ReturnType<typeof useLanguage>['t'];
  onPrimaryCta: () => void;
  onCreateTask?: () => void;
  onMarkRead?: () => void;
  onAcknowledge?: () => void;
  onSnooze?: () => void;
  readStatus?: 'read' | 'unread';
}

export const NotificationDetailPanel = memo(function NotificationDetailPanel({
  detail,
  t,
  onPrimaryCta,
  onCreateTask,
  onMarkRead,
  onAcknowledge,
  onSnooze,
  readStatus = 'read',
}: NotificationDetailPanelProps) {
  const actions = detail.availableActions ?? [];
  const hasMenu = Boolean(onMarkRead || onAcknowledge || onSnooze);
  const affectedVehicles = detail.affectedVehicles ?? [];

  return (
    <div className="border-t border-border/25 px-3 py-3 sm:px-3.5">
      <div className="space-y-2">
        <p className={NOTIFICATION_PANEL_TYPO.childTitle}>{detail.issueTitle}</p>
        {detail.issueDescription ? (
          <p className={NOTIFICATION_PANEL_TYPO.childDescription}>{detail.issueDescription}</p>
        ) : null}

        {affectedVehicles.length > 0 ? (
          <div className="rounded-lg border border-border/35 bg-muted/15 p-2.5">
            {detail.affectedVehiclesLabel ? (
              <p className={cn(NOTIFICATION_PANEL_TYPO.meta, 'mb-2 font-medium text-foreground/80')}>
                {detail.affectedVehiclesLabel}
              </p>
            ) : null}
            <ul className="grid gap-1.5 sm:grid-cols-2" role="list">
              {affectedVehicles.map((vehicle) => (
                <li
                  key={vehicle.id}
                  className="flex min-h-9 items-center gap-2 rounded-md border border-border/30 bg-background/70 px-2.5 py-1.5"
                >
                  <Icon name="car" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className={cn(NOTIFICATION_PANEL_TYPO.entity, 'min-w-0 text-foreground/90')}>
                    {vehicle.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-start gap-2">
        <button
          type="button"
          onClick={onPrimaryCta}
          className={cn(
            NOTIFICATION_PANEL_TYPO.cta,
            'sq-press inline-flex min-h-9 items-center rounded-md border border-[color:color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[color:color-mix(in_srgb,var(--brand)_6%,transparent)] px-2.5 text-[color:var(--brand)] transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
          )}
        >
          {detail.ctaPrimaryLabel}
        </button>

        {detail.showCreateTask && onCreateTask ? (
          <button
            type="button"
            onClick={onCreateTask}
            className={cn(
              NOTIFICATION_PANEL_TYPO.cta,
              'sq-press inline-flex min-h-9 items-center rounded-md border border-border/50 px-2.5 text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
            )}
          >
            {detail.createTaskLabel}
          </button>
        ) : null}

        {hasMenu ? (
          <details className="group/menu relative">
            <summary
              className={cn(
                NOTIFICATION_PANEL_TYPO.cta,
                'sq-press inline-flex min-h-9 cursor-pointer list-none items-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] [&::-webkit-details-marker]:hidden',
              )}
              aria-label={t('notification.action.more')}
            >
              <Icon name="more-horizontal" className="h-4 w-4" aria-hidden />
            </summary>
            <div className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-border/50 bg-popover p-1 shadow-[var(--shadow-md)]">
              {onMarkRead && readStatus === 'unread' ? (
                <MenuAction onClick={onMarkRead} label={t('notification.action.markRead')} />
              ) : null}
              {onAcknowledge && actions.includes('acknowledge' as ApiNotificationAvailableAction) ? (
                <MenuAction onClick={onAcknowledge} label={t('notification.action.acknowledge')} />
              ) : null}
              {onSnooze && actions.includes('snooze' as ApiNotificationAvailableAction) ? (
                <MenuAction onClick={onSnooze} label={t('notification.action.snooze')} />
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
});

function MenuAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex w-full min-h-9 items-center rounded-md px-2.5 text-left text-xs leading-4 hover:bg-muted/50"
      onClick={onClick}
    >
      {label}
    </button>
  );
}
