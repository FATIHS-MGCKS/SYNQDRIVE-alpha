import type { SmsConversation, SmsMessage } from '@prisma/client';

export type SentDmSmsLifecycleStatus = 'DELIVERED' | 'FAILED';

export interface SentDmSmsInboundProjectionSource {
  conversation: SmsConversation;
  message: SmsMessage;
  occurredAt?: Date;
  webhookExternalEventId: string;
}

export interface SentDmSmsOutboundProjectionSource {
  conversation: SmsConversation;
  message: SmsMessage;
  occurredAt?: Date;
}

export interface SentDmSmsStatusProjectionSource {
  conversation: SmsConversation;
  message: SmsMessage;
  status: SentDmSmsLifecycleStatus;
  occurredAt?: Date;
  webhookExternalEventId: string;
  failureCode?: string | null;
}
