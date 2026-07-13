import { memo } from 'react';
import { Icon } from '../../ui/Icon';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { NotificationDetailViewModel } from './notification-detail-view-model';
import type { useLanguage } from '../../../i18n/LanguageContext';
import { NotificationActionsMenu } from './NotificationActionsMenu';

export interface NotificationDetailPanelProps {
  detail: NotificationDetailViewModel;
  t: ReturnType<typeof useLanguage>['t'];
  onPrimaryCta: () => void;
  onSecondaryCta?: () => void;
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
  onSecondaryCta,
  onCreateTask,
  onMarkRead,
  onAcknowledge,
  onSnooze,
  readStatus = 'read',
}: NotificationDetailPanelProps) {
  const affectedVehicles = detail.affectedVehicles ?? [];
  const detailFields = detail.detailFields ?? [];

  return (
    <div className="border-t border-border/25 px-3 py-3 sm:px-3.5">
      <div className="space-y-2">
        {detail.issueTitle ? (
          <p className={NOTIFICATION_PANEL_TYPO.childTitle}>{detail.issueTitle}</p>
        ) : null}
        {detail.issueDescription ? (
          <p className={NOTIFICATION_PANEL_TYPO.childDescription}>{detail.issueDescription}</p>
        ) : null}

        {detailFields.length > 0 ? (
          <dl className="space-y-1.5">
            {detailFields.map((field) => (
              <div key={field.label} className="grid grid-cols-[minmax(5.5rem,auto)_1fr] gap-x-2 gap-y-0.5">
                <dt className={cn(NOTIFICATION_PANEL_TYPO.meta, 'text-muted-foreground')}>{field.label}:</dt>
                <dd className={cn(NOTIFICATION_PANEL_TYPO.childDescription, 'text-foreground/90')}>{field.value}</dd>
              </div>
            ))}
          </dl>
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

        {detail.showContactCustomer && onSecondaryCta && detail.ctaSecondaryLabel ? (
          <button
            type="button"
            onClick={onSecondaryCta}
            className={cn(
              NOTIFICATION_PANEL_TYPO.cta,
              'sq-press inline-flex min-h-9 items-center rounded-md border border-border/50 bg-muted/20 px-2.5 text-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
            )}
          >
            {detail.ctaSecondaryLabel}
          </button>
        ) : null}

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

        <NotificationActionsMenu
          t={t}
          readStatus={readStatus}
          availableActions={detail.availableActions}
          onMarkRead={onMarkRead}
          onAcknowledge={onAcknowledge}
          onSnooze={onSnooze}
        />
      </div>
    </div>
  );
});
