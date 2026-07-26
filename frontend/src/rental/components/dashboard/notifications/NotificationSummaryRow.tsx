import { memo } from 'react';
import { Icon } from '../../ui/Icon';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { NotificationSummaryViewModel } from './notification-summary-view-model';
import { createNotificationTranslator } from '../notificationQueueEnricher';
import type { useLanguage } from '../../../i18n/LanguageContext';
import { severityBadgeTone, severityIconTone } from './notification-severity-styles';

export interface NotificationSummaryRowProps {
  summary: NotificationSummaryViewModel;
  t: ReturnType<typeof useLanguage>['t'];
  locale: string;
  expanded?: boolean;
  showChevron?: boolean;
  unread?: boolean;
  onToggle?: () => void;
  as?: 'button' | 'div';
}

export const NotificationSummaryRow = memo(function NotificationSummaryRow({
  summary,
  t,
  locale,
  expanded = false,
  showChevron = false,
  unread = false,
  onToggle,
  as = 'div',
}: NotificationSummaryRowProps) {
  const tr = createNotificationTranslator(locale);
  const severityLabel = tr(summary.severityLabelKey);
  const statusLabel = summary.statusLabelKey ? tr(summary.statusLabelKey) : null;
  const Tag = as === 'button' ? 'button' : 'div';

  return (
    <Tag
      type={as === 'button' ? 'button' : undefined}
      className={cn(
        'flex w-full items-start gap-2.5 text-left',
        as === 'button' &&
          'transition-colors hover:bg-muted/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
      )}
      aria-expanded={as === 'button' ? expanded : undefined}
      onClick={as === 'button' ? onToggle : undefined}
    >
      <div className="relative shrink-0" aria-hidden>
        <div className={cn(NOTIFICATION_PANEL_TYPO.iconWrap, severityIconTone(summary.severity, summary.resolved))}>
          <Icon name={summary.iconName} className={NOTIFICATION_PANEL_TYPO.icon} />
        </div>
        {summary.showIconCount && summary.iconCount >= 1 ? (
          <span
            className={cn(
              NOTIFICATION_PANEL_TYPO.iconCount,
              'absolute -right-1 -top-1 min-w-[1.125rem] rounded-full bg-foreground px-1 text-center text-background',
            )}
          >
            {summary.iconCount}
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span
              className={cn(
                NOTIFICATION_PANEL_TYPO.metaBadge,
                severityBadgeTone(summary.severity, summary.resolved),
              )}
            >
              {severityLabel}
            </span>
            {statusLabel ? (
              <span className={cn(NOTIFICATION_PANEL_TYPO.metaBadge, 'bg-muted/50 text-muted-foreground')}>
                {statusLabel}
              </span>
            ) : null}
            {summary.eyebrowLabel ? (
              <span className={cn(NOTIFICATION_PANEL_TYPO.eyebrow, 'truncate')}>
                {summary.eyebrowLabel}
              </span>
            ) : null}
          </div>
          {summary.lastSeenLabel ? (
            <span className={cn(NOTIFICATION_PANEL_TYPO.lastSeen, 'shrink-0 tabular-nums')}>
              {summary.lastSeenLabel}
            </span>
          ) : null}
        </div>
        <p
          className={cn(
            NOTIFICATION_PANEL_TYPO.cardTitle,
            'mt-0.5 break-words [overflow-wrap:anywhere]',
            unread && 'text-foreground',
          )}
        >
          {summary.headlineTitle}
        </p>
        {summary.subtitle ? (
          <p className={cn(NOTIFICATION_PANEL_TYPO.description, 'mt-1 line-clamp-2')}>
            {summary.subtitle}
          </p>
        ) : null}
      </div>

      {showChevron ? (
        <span
          className={cn(
            'mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform',
            expanded && 'rotate-180',
          )}
          aria-hidden
        >
          <Icon name="chevron-down" className="h-4 w-4" />
        </span>
      ) : null}
    </Tag>
  );
});
