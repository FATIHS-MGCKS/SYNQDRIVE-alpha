import { useState } from 'react';
import { Icon } from '../../ui/Icon';
import { Popover, PopoverContent, PopoverTrigger } from '../../../../components/ui/popover';
import { cn } from '../../../../components/ui/utils';
import { NOTIFICATION_PANEL_TYPO } from './notificationPanelTypography';
import type { useLanguage } from '../../../i18n/LanguageContext';
import type { ApiNotificationAvailableAction } from '../../../lib/notifications/notification-api.types';

export interface NotificationActionsMenuProps {
  t: ReturnType<typeof useLanguage>['t'];
  readStatus?: 'read' | 'unread';
  availableActions?: ApiNotificationAvailableAction[];
  onMarkRead?: () => void;
  onAcknowledge?: () => void;
  onSnooze?: () => void;
  triggerClassName?: string;
  itemClassName?: string;
}

export function NotificationActionsMenu({
  t,
  readStatus = 'read',
  availableActions = [],
  onMarkRead,
  onAcknowledge,
  onSnooze,
  triggerClassName,
  itemClassName,
}: NotificationActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const hasMenu = Boolean(onMarkRead || onAcknowledge || onSnooze);
  if (!hasMenu) return null;

  const showMarkRead = Boolean(onMarkRead && readStatus === 'unread');
  const showAcknowledge = Boolean(
    onAcknowledge && availableActions.includes('acknowledge' as ApiNotificationAvailableAction),
  );
  const showSnooze = Boolean(
    onSnooze && availableActions.includes('snooze' as ApiNotificationAvailableAction),
  );

  if (!showMarkRead && !showAcknowledge && !showSnooze) return null;

  const closeAndRun = (action?: () => void) => {
    action?.();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            NOTIFICATION_PANEL_TYPO.cta,
            'sq-press inline-flex min-h-9 cursor-pointer items-center rounded-md px-2 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
            triggerClassName,
          )}
          aria-label={t('notification.action.more')}
        >
          <Icon name="more-horizontal" className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" side="top" className="w-auto min-w-[11rem] p-1">
        {showMarkRead ? (
          <MenuAction
            label={t('notification.action.markRead')}
            className={itemClassName}
            onClick={() => closeAndRun(onMarkRead)}
          />
        ) : null}
        {showAcknowledge ? (
          <MenuAction
            label={t('notification.action.acknowledge')}
            className={itemClassName}
            onClick={() => closeAndRun(onAcknowledge)}
          />
        ) : null}
        {showSnooze ? (
          <MenuAction
            label={t('notification.action.snooze')}
            className={itemClassName}
            onClick={() => closeAndRun(onSnooze)}
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function MenuAction({
  label,
  onClick,
  className,
}: {
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full min-h-9 items-center rounded-md px-2.5 text-left text-xs leading-4 hover:bg-muted/50',
        className,
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
