import { memo } from 'react';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { NotificationDetailViewModel } from './notification-detail-view-model';
import type { useLanguage } from '../../../i18n/LanguageContext';
import { NotificationActionsMenu } from './NotificationActionsMenu';

const detailCtaClass = cn(
  NOTIFICATION_PANEL_TYPO.cta,
  'sq-press inline-flex min-h-11 items-center rounded-md border px-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
);

export interface NotificationChildRowProps {
  detail: NotificationDetailViewModel;
  t: ReturnType<typeof useLanguage>['t'];
  readStatus?: 'read' | 'unread';
  onPrimaryCta: () => void;
  onSecondaryCta?: () => void;
  onCreateTask?: () => void;
  onMarkRead?: () => void;
  onAcknowledge?: () => void;
  onSnooze?: () => void;
}

export const NotificationChildRow = memo(function NotificationChildRow({
  detail,
  t,
  readStatus = 'read',
  onPrimaryCta,
  onSecondaryCta,
  onCreateTask,
  onMarkRead,
  onAcknowledge,
  onSnooze,
}: NotificationChildRowProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/20 bg-muted/[0.03] px-2.5 py-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className={cn(NOTIFICATION_PANEL_TYPO.childTitle, 'break-words [overflow-wrap:anywhere]')}>
          {detail.issueTitle}
        </p>
        {detail.issueDescription ? (
          <p className={cn(NOTIFICATION_PANEL_TYPO.childDescription, 'mt-0.5 line-clamp-2 break-words')}>
            {detail.issueDescription}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onPrimaryCta}
          className={cn(
            detailCtaClass,
            'max-w-full border-[color:color-mix(in_srgb,var(--brand)_20%,var(--border))] bg-[color:color-mix(in_srgb,var(--brand)_6%,transparent)] text-[color:var(--brand)] hover:bg-muted/40',
          )}
        >
          <span className="truncate">{detail.ctaPrimaryLabel}</span>
        </button>
        {detail.showContactCustomer && onSecondaryCta && detail.ctaSecondaryLabel ? (
          <button
            type="button"
            onClick={onSecondaryCta}
            className={cn(detailCtaClass, 'border-border/50 bg-muted/20 text-foreground hover:bg-muted/40')}
          >
            <span className="truncate">{detail.ctaSecondaryLabel}</span>
          </button>
        ) : null}
        {detail.showCreateTask && onCreateTask ? (
          <button
            type="button"
            onClick={onCreateTask}
            className={cn(detailCtaClass, 'border-border/50 text-muted-foreground hover:bg-muted/40 hover:text-foreground')}
          >
            <span className="truncate">{detail.createTaskLabel}</span>
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
