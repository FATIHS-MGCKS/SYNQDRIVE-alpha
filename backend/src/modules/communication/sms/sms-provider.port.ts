export interface SmsSendMessageInput {
  organizationId: string;
  recipientE164: string;
  body: string;
  idempotencyKey: string;
  senderProfileId?: string | null;
  sandbox?: boolean;
}

export interface SmsSendMessageResult {
  providerMessageId: string;
  providerStatus: string;
  acceptedAt: Date;
}

export interface SmsProviderPort {
  sendMessage(input: SmsSendMessageInput): Promise<SmsSendMessageResult>;
}

export const SMS_PROVIDER_PORT = Symbol('SMS_PROVIDER_PORT');
