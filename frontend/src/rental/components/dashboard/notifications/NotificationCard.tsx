import { memo } from 'react';
import { Icon } from '../../ui/Icon';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { NotificationCardViewModel } from './notificationCardViewModel';
import { getNotificationCardSeverityLabel } from './notificationCardViewModel';
import { notificationDomainIcon } from './notificationDomainIcon';
import type { useLanguage } from '../../../i18n/LanguageContext';

function severitySurface(severity: NotificationCardViewModel['severity'], resolved: boolean): string {
  if (resolved || severity === 'success') {
    return 'border-border/30 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-success)_6%,transparent),transparent)]';
  }
  if (severity === 'critical') {
    return 'border-[color:color-mix(in_srgb,var(--status-critical)_22%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-critical)_7%,transparent),transparent)]';
  }
  if (severity === 'warning') {
    return 'border-[color:color-mix(in_srgb,var(--status-watch)_20%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--status-watch)_6%,transparent),transparent)]';
  }
  return 'border-border/30 bg-card/40';
}

function severityBadgeTone(severity: NotificationCardViewModel['severity'], resolved: boolean): string {
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

function iconTone(severity: NotificationCardViewModel['severity'], resolved: boolean): string {
  if (resolved || severity === 'success') return 'sq-tone-success';
  if (severity === 'critical') return 'sq-tone-critical';
  if (severity === 'warning') return 'sq-tone-watch';
  return 'bg-muted/50 text-muted-foreground';
}

export interface NotificationCardProps {
  card: NotificationCardViewModel;
  t: ReturnType<typeof useLanguage>['t'];
  unread?: boolean;
  onOpen: () => void;
  onCta: () => void;
  onMarkRead?: () => void;
  onAcknowledge?: () => void;
  onSnooze?: () => void;
  menuOpen?: boolean;
  onMenuToggle?: () => void;
}

export const NotificationCard = memo(function NotificationCard({
  card,
  t,
  unread = false,
  onOpen,
  onCta,
  onMarkRead,
  onAcknowledge,
  onSnooze,
}: NotificationCardProps) {
  const severityLabel = getNotificationCardSeverityLabel(card, t);
  const hasMenu = Boolean(onMarkRead || onAcknowledge || onSnooze);

  return (
    <article
      className={cn(
        'group relative rounded-xl border px-3 py-2.5 transition-colors motion-reduce:transition-none',
        severitySurface(card.severity, card.resolved),
        unread && 'ring-1 ring-[color:color-mix(in_srgb,var(--brand)_18%,transparent)]',
        'hover:bg-muted/15 focus-within:ring-2 focus-within:ring-[color:var(--brand)]',
      )}
    >
      <div className="flex gap-2.5">
        <div
          className={cn(NOTIFICATION_PANEL_TYPO.iconWrap, iconTone(card.severity, card.resolved))}
          aria-hidden
        >
          <Icon
            name={notificationDomainIcon(card.domain, card.eventType)}
            className={NOTIFICATION_PANEL_TYPO.icon}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span
              className={cn(NOTIFICATION_PANEL_TYPO.metaBadge, severityBadgeTone(card.severity, card.resolved))}
            >
              {severityLabel}
            </span>
            <span className={NOTIFICATION_PANEL_TYPO.meta}>{card.domainLabel}</span>
            {card.timeLabel ? (
              <span className={cn(NOTIFICATION_PANEL_TYPO.meta, 'tabular-nums')}>{card.timeLabel}</span>
            ) : null}
            {card.occurrenceLabel ? (
              <span className={cn(NOTIFICATION_PANEL_TYPO.meta, 'tabular-nums')}>{card.occurrenceLabel}</span>
            ) : null}
            {card.acknowledged ? (
              <span className={cn(NOTIFICATION_PANEL_TYPO.meta, 'text-muted-foreground/80')}>
                · {t('notification.status.acknowledged')}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onOpen}
            className={cn(
              NOTIFICATION_PANEL_TYPO.cardTitle,
              'mt-1 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] rounded-sm',
            )}
          >
            {card.title}
          </button>

          {card.entityLine ? (
            <p className={cn(NOTIFICATION_PANEL_TYPO.entity, 'mt-0.5')}>{card.entityLine}</p>
          ) : null}

          {card.description ? (
            <p className={cn(NOTIFICATION_PANEL_TYPO.description, 'mt-1')}>{card.description}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCta();
              }}
              className={cn(
                NOTIFICATION_PANEL_TYPO.cta,
                'sq-press inline-flex min-h-11 items-center rounded-md px-2.5 text-[color:var(--brand)] transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
              )}
            >
              {card.ctaLabel}
            </button>

            {hasMenu ? (
              <div className="relative">
                <details className="group/menu">
                  <summary
                    className={cn(
                      NOTIFICATION_PANEL_TYPO.cta,
                      'sq-press inline-flex min-h-11 cursor-pointer list-none items-center rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] [&::-webkit-details-marker]:hidden',
                    )}
                    aria-label={t('notification.action.more')}
                  >
                    <Icon name="more-horizontal" className="h-4 w-4" aria-hidden />
                  </summary>
                  <div className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-lg border border-border/50 bg-popover p-1 shadow-[var(--shadow-md)]">
                    {onMarkRead && card.readStatus === 'unread' ? (
                      <button
                        type="button"
                        className="flex w-full min-h-11 items-center rounded-md px-2.5 text-left text-xs leading-4 hover:bg-muted/50"
                        onClick={onMarkRead}
                      >
                        {t('notification.action.markRead')}
                      </button>
                    ) : null}
                    {onAcknowledge && card.availableActions.includes('acknowledge') ? (
                      <button
                        type="button"
                        className="flex w-full min-h-11 items-center rounded-md px-2.5 text-left text-xs leading-4 hover:bg-muted/50"
                        onClick={onAcknowledge}
                      >
                        {t('notification.action.acknowledge')}
                      </button>
                    ) : null}
                    {onSnooze && card.availableActions.includes('snooze') ? (
                      <button
                        type="button"
                        className="flex w-full min-h-11 items-center rounded-md px-2.5 text-left text-xs leading-4 hover:bg-muted/50"
                        onClick={onSnooze}
                      >
                        {t('notification.action.snooze')}
                      </button>
                    ) : null}
                  </div>
                </details>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
});
