import { memo } from 'react';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { NotificationDetailViewModel } from './notification-detail-view-model';
import type { useLanguage } from '../../../i18n/LanguageContext';

export interface NotificationChildRowProps {
  detail: NotificationDetailViewModel;
  t: ReturnType<typeof useLanguage>['t'];
  onPrimaryCta: () => void;
  onCreateTask?: () => void;
}

export const NotificationChildRow = memo(function NotificationChildRow({
  detail,
  onPrimaryCta,
  onCreateTask,
}: NotificationChildRowProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-2 rounded-lg border border-border/20 bg-muted/[0.03] px-2.5 py-2',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={NOTIFICATION_PANEL_TYPO.childTitle}>{detail.issueTitle}</p>
        {detail.issueDescription ? (
          <p className={cn(NOTIFICATION_PANEL_TYPO.childDescription, 'mt-0.5 line-clamp-1')}>
            {detail.issueDescription}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onPrimaryCta}
          className={cn(
            NOTIFICATION_PANEL_TYPO.cta,
            'sq-press whitespace-nowrap rounded-md px-2 py-1 text-[color:var(--brand)] hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
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
              'sq-press whitespace-nowrap rounded-md px-2 py-1 text-muted-foreground hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
            )}
          >
            {detail.createTaskLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
});
