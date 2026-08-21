import type {
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppMessageDeliveryStatus,
} from '@prisma/client';

export interface MetaWhatsAppInboundProjectionSource {
  conversation: WhatsAppConversation;
  message: WhatsAppMessage;
  webhookExternalEventId?: string | null;
  occurredAt?: Date;
}

export interface MetaWhatsAppOutboundProjectionSource {
  conversation: WhatsAppConversation;
  message: WhatsAppMessage;
  occurredAt?: Date;
}

export type MetaWhatsAppLifecycleStatus = Extract<
  WhatsAppMessageDeliveryStatus,
  'DELIVERED' | 'READ' | 'FAILED'
>;

export interface MetaWhatsAppStatusProjectionSource {
  conversation: WhatsAppConversation;
  message: WhatsAppMessage;
  status: MetaWhatsAppLifecycleStatus;
  webhookExternalEventId: string;
  occurredAt: Date;
  failureReason?: string | null;
}

export interface MetaWhatsAppHumanRequiredProjectionSource {
  conversation: WhatsAppConversation;
  occurredAt: Date;
  webhookExternalEventId?: string | null;
  handoffReasonCode?: string | null;
}
