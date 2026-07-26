import { NotificationDeliveryChannel } from '@prisma/client';

/** Logical notification channels — includes engine and external-only channels. */
export type NotificationChannelId =
  | 'IN_APP'
  | 'EMAIL'
  | 'PUSH'
  | 'SMS'
  | 'WHATSAPP'
  | 'VOICE';

export type ChannelImplementationStatus = 'active' | 'stub' | 'disabled';

export type ChannelTrustLevel = 'high' | 'medium' | 'low';

export interface NotificationChannelDefinition {
  id: NotificationChannelId;
  label: string;
  implementationStatus: ChannelImplementationStatus;
  /** Whether sensitive template params may be included in payloads. */
  trustLevel: ChannelTrustLevel;
  /** Participates in notification engine outbox delivery. */
  engineDelivery: boolean;
  /** Recipient must have a verified address/token before enqueue. */
  requiresVerifiedRecipient: boolean;
}

/**
 * Canonical channel matrix for the Notification Engine.
 * Do not treat stub/disabled channels as user-selectable delivery paths.
 */
export const NOTIFICATION_CHANNEL_MATRIX: Record<
  NotificationChannelId,
  NotificationChannelDefinition
> = {
  IN_APP: {
    id: 'IN_APP',
    label: 'In-App',
    implementationStatus: 'active',
    trustLevel: 'high',
    engineDelivery: false,
    requiresVerifiedRecipient: false,
  },
  EMAIL: {
    id: 'EMAIL',
    label: 'E-Mail',
    implementationStatus: 'active',
    trustLevel: 'medium',
    engineDelivery: true,
    requiresVerifiedRecipient: false,
  },
  PUSH: {
    id: 'PUSH',
    label: 'Push',
    implementationStatus: 'stub',
    trustLevel: 'medium',
    engineDelivery: false,
    requiresVerifiedRecipient: true,
  },
  SMS: {
    id: 'SMS',
    label: 'SMS',
    implementationStatus: 'disabled',
    trustLevel: 'low',
    engineDelivery: false,
    requiresVerifiedRecipient: true,
  },
  WHATSAPP: {
    id: 'WHATSAPP',
    label: 'WhatsApp',
    implementationStatus: 'disabled',
    trustLevel: 'low',
    engineDelivery: false,
    requiresVerifiedRecipient: true,
  },
  VOICE: {
    id: 'VOICE',
    label: 'Voice',
    implementationStatus: 'disabled',
    trustLevel: 'low',
    engineDelivery: false,
    requiresVerifiedRecipient: true,
  },
};

export function getChannelDefinition(
  channel: NotificationChannelId | NotificationDeliveryChannel,
): NotificationChannelDefinition | null {
  const key = String(channel) as NotificationChannelId;
  return NOTIFICATION_CHANNEL_MATRIX[key] ?? null;
}

export function isEngineDeliverableChannel(
  channel: NotificationDeliveryChannel,
): boolean {
  const def = getChannelDefinition(channel);
  return def?.engineDelivery === true && def.implementationStatus === 'active';
}

export function isStubOrDisabledChannel(
  channel: NotificationChannelId | NotificationDeliveryChannel,
): boolean {
  const def = getChannelDefinition(channel);
  if (!def) return true;
  return def.implementationStatus === 'stub' || def.implementationStatus === 'disabled';
}

export function listDocumentedChannels(): NotificationChannelDefinition[] {
  return Object.values(NOTIFICATION_CHANNEL_MATRIX);
}
