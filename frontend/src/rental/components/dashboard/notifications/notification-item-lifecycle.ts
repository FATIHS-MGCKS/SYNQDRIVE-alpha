/** Per-notification lifecycle handlers resolved by canonical notification id. */
export interface NotificationItemLifecycleHandlers {
  onMarkRead?: () => void;
  onAcknowledge?: () => void;
  onSnooze?: () => void;
}

export type ResolveNotificationItemLifecycleHandlers = (
  itemId: string,
) => NotificationItemLifecycleHandlers;
