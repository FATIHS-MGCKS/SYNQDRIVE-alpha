export interface WhatsAppProviderRuntimeConfig {
  organizationId: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  accessToken: string | null;
  appSecret: string | null;
  webhookVerifyToken: string | null;
  metaApiVersion: string;
}

export interface WhatsAppSendMetadata {
  organizationId: string;
  conversationId?: string;
  messageId?: string;
  idempotencyKey?: string;
  templateName?: string;
}

export interface WhatsAppProviderSendResult {
  providerMessageId: string;
  status: 'QUEUED' | 'SENT' | 'FAILED';
  failureReason?: string;
}

export interface WhatsAppParsedWebhook {
  phoneNumberId?: string;
  entries: WhatsAppWebhookEntry[];
}

export interface WhatsAppWebhookEntry {
  externalEventId: string;
  eventType: string;
  /** Inbound customer message */
  inboundMessage?: {
    providerMessageId: string;
    fromPhone: string;
    fromName?: string;
    body: string;
    timestamp: Date;
  };
  /** Delivery status update for outbound message */
  statusUpdate?: {
    providerMessageId: string;
    status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
    timestamp: Date;
    failureReason?: string;
  };
}

export interface WhatsAppProviderInterface {
  readonly providerName: string;
  readonly isStub: boolean;

  isConfigured(config: WhatsAppProviderRuntimeConfig): boolean;

  sendTextMessage(
    config: WhatsAppProviderRuntimeConfig,
    toPhoneNumber: string,
    body: string,
    metadata: WhatsAppSendMetadata,
  ): Promise<WhatsAppProviderSendResult>;

  sendTemplateMessage(
    config: WhatsAppProviderRuntimeConfig,
    toPhoneNumber: string,
    templateName: string,
    language: string,
    variables: Record<string, string>,
    metadata: WhatsAppSendMetadata,
  ): Promise<WhatsAppProviderSendResult>;

  markRead?(
    config: WhatsAppProviderRuntimeConfig,
    providerMessageId: string,
  ): Promise<void>;

  verifyWebhook(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    config: WhatsAppProviderRuntimeConfig,
  ): string | null;

  parseWebhook(
    payload: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): WhatsAppParsedWebhook;

  validateSignature(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    config: WhatsAppProviderRuntimeConfig,
  ): boolean;

  healthCheck(config: WhatsAppProviderRuntimeConfig): Promise<{ ok: boolean; detail?: string }>;
}
