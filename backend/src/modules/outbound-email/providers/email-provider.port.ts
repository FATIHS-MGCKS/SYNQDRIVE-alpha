export interface EmailAttachmentPayload {
  fileName: string;
  mimeType: string;
  content: Buffer;
  sizeBytes?: number;
}

export interface EmailSendPayload {
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyText: string;
  bodyHtml?: string;
  attachments?: EmailAttachmentPayload[];
}

export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  simulated?: boolean;
  errorMessage?: string;
}

export interface EmailProviderPort {
  readonly providerId: string;
  send(payload: EmailSendPayload): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER_PORT = Symbol('EMAIL_PROVIDER_PORT');
