/**
 * @deprecated Import from `./lifecycle/notification-lifecycle.state-machine` instead.
 * Re-exports preserved for backward compatibility.
 */
export {
  NotificationLifecycleTransitionError as NotificationStatusTransitionError,
  allowedNotificationStatusTargets,
  assertNotificationStatusTransition,
  canTransitionNotificationStatus,
  isActiveNotificationStatus,
  isTerminalNotificationStatus,
} from './lifecycle/notification-lifecycle.state-machine';

export type { NotificationLifecycleTransitionContext as NotificationStatusTransitionContext } from './lifecycle/notification-lifecycle.types';
