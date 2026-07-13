import { memo } from 'react';
import { Icon } from '../../ui/Icon';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { NotificationCardViewModel } from './notificationCardViewModel';
import { getNotificationCardSeverityLabel } from './notificationCardViewModel';
import { notificationDomainIcon } from './notificationDomainIcon';
import type { useLanguage } from '../../../i18n/LanguageContext';
import { NotificationActionsMenu } from './NotificationActionsMenu';

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
  compact?: boolean;
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
  compact = false,
  onOpen,
  onCta,
  onMarkRead,
  onAcknowledge,
  onSnooze,
}: NotificationCardProps) {
  const severityLabel = getNotificationCardSeverityLabel(card, t);

  return (
    <article
      className={cn(
        'group relative rounded-xl border transition-colors motion-reduce:transition-none',
        compact ? 'border-border/25 bg-muted/[0.04] px-2.5 py-2' : 'px-3 py-2.5',
        !compact && severitySurface(card.severity, card.resolved),
        compact && severitySurface(card.severity, card.resolved),
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

          {card.entityLine && !compact ? (
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

            <NotificationActionsMenu
              t={t}
              readStatus={card.readStatus}
              availableActions={card.availableActions}
              onMarkRead={onMarkRead}
              onAcknowledge={onAcknowledge}
              onSnooze={onSnooze}
              triggerClassName="min-h-11 px-2.5"
              itemClassName="min-h-11"
            />
          </div>
        </div>
      </div>
    </article>
  );
});
