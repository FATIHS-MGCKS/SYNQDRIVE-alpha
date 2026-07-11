import { NotificationEventKind } from '../notification.enums';
import type {
  NotificationDeliveryPolicy,
  NotificationExpiryPolicy,
  NotificationReopenPolicy,
  NotificationResolutionPolicy,
} from '../notification.types';
import {
  DEFAULT_EVENT_RESOLUTION_POLICY,
  DEFAULT_STATE_REOPEN_POLICY,
} from '../notification-reopen.policy';

export const DEFAULT_IN_APP_DELIVERY: NotificationDeliveryPolicy = {
  channels: ['IN_APP'],
  respectUserPreferences: true,
  criticalOverridesPreferences: true,
};

export const DEFAULT_CRITICAL_DELIVERY: NotificationDeliveryPolicy = {
  channels: ['IN_APP', 'EMAIL', 'PUSH'],
  respectUserPreferences: true,
  criticalOverridesPreferences: true,
};

export const STATE_RESOLUTION: NotificationResolutionPolicy = {
  eventKind: NotificationEventKind.STATE,
  autoResolveWhenConditionClears: true,
  reopenPolicy: DEFAULT_STATE_REOPEN_POLICY,
};

export const EVENT_RESOLUTION: NotificationResolutionPolicy = DEFAULT_EVENT_RESOLUTION_POLICY;

export const SHORT_EVENT_EXPIRY: NotificationExpiryPolicy = {
  ttlMs: 7 * 24 * 60 * 60 * 1000,
  allowProducerExpiresAt: true,
};

export const OPERATIONS_REOPEN: NotificationReopenPolicy = {
  cooldownMs: 30 * 60_000,
  maxReopensBeforeNewGeneration: 5,
};
