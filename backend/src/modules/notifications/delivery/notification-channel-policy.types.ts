import type {
  MembershipRole,
  NotificationDeliveryChannel,
  NotificationSeverity,
} from '@prisma/client';
import type { NotificationDeliveryPolicy } from '../notification.types';
import type { PreferenceDeliveryDecision } from '../access/notification-access.types';
import type { QuietHoursConfig } from './notification-delivery-quiet-hours.util';

export type ChannelPolicySkipReason =
  | 'CHANNEL_DISABLED'
  | 'CHANNEL_STUB'
  | 'NOT_IN_EVENT_POLICY'
  | 'USER_OPT_OUT'
  | 'CRITICAL_ONLY_FILTER'
  | 'MISSING_RECIPIENT_EMAIL'
  | 'UNVERIFIED_CHANNEL'
  | 'ROLE_NOT_SUPPORTED'
  | 'PREFERENCES_DISABLED';

export interface ChannelPolicyEvaluationInput {
  channel: NotificationDeliveryChannel;
  eventType: string;
  severity: NotificationSeverity;
  deliveryPolicy: NotificationDeliveryPolicy;
  preferenceDecision: PreferenceDeliveryDecision;
  membershipRole: MembershipRole;
  supportedRoles: readonly MembershipRole[];
  recipientEmail?: string | null;
  /** Push device token / WhatsApp consent — not implemented yet. */
  recipientChannelVerified?: boolean;
  referenceNow: Date;
  userTimezone: string;
  quietHours: QuietHoursConfig;
}

export interface ChannelPolicyEvaluationResult {
  allowed: boolean;
  reason?: ChannelPolicySkipReason;
  mandatory: boolean;
  deferredUntil?: Date;
}
