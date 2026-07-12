import { memo } from 'react';
import { Icon } from '../../ui/Icon';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { NotificationSummaryViewModel } from './notification-summary-view-model';
import type { NotificationSeverity } from '../notificationQueueModel';
import { createNotificationTranslator } from '../notificationQueueEnricher';
import type { useLanguage } from '../../../i18n/LanguageContext';

function severityBadgeTone(severity: NotificationSeverity, resolved: boolean): string {
  if (resolved || severity === 'success') {
    return 'bg-[color:color-mix(in_srgb,var(--status-success)_12%,transparent)] text-[color:var(--status-success)]';
  }
  if (severity === 'critical') {
    return 'bg-[color:color-mix(in_srgb,var(--status-critical)_12%,transparent)] text-[color:var(--status-critical)]';
  }
  if (severity === 'warning') {
    return 'bg-[color:color-mix(in_srgb,var(--status-watch)_12%,transparent)] text-[color:var(--status-watch)]';
  }
  return 'bg-muted/60 text-muted-foreground';
}

function iconTone(severity: NotificationSeverity, resolved: boolean): string {
  if (resolved || severity === 'success') return 'sq-tone-success';
  if (severity === 'critical') return 'sq-tone-critical';
  if (severity === 'warning') return 'sq-tone-watch';
  return 'bg-muted/50 text-muted-foreground';
}

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
        <div className={cn(NOTIFICATION_PANEL_TYPO.iconWrap, iconTone(summary.severity, summary.resolved))}>
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
            'mt-0.5',
            unread && 'text-foreground',
          )}
        >
          {summary.headlineTitle}
        </p>
        {summary.subtitle && !expanded ? (
          <p className={cn(NOTIFICATION_PANEL_TYPO.description, 'mt-1 line-clamp-2')}>
            {summary.subtitle}
          </p>
        ) : null}
      </div>

      {showChevron ? (
        <span
          className={cn(
            'mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-transform',
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
