export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

export interface EmailAttachmentInput {
  fileName: string;
  mimeType: string;
  content: Buffer;
}

export interface SendEmailInput {
  fromEmail: string;
  fromName?: string | null;
  replyToEmail?: string | null;
  toEmail: string;
  ccEmails?: string[];
  bccEmails?: string[];
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  attachments?: EmailAttachmentInput[];
  idempotencyKey?: string;
}

export interface SendEmailResult {
  provider: string;
  providerMessageId: string | null;
  status: 'SENT' | 'SENT_SIMULATED' | 'FAILED';
  errorCode?: string;
  errorMessage?: string;
}

export interface DnsRecordDto {
  type: string;
  name: string;
  value: string;
  priority?: number | null;
  status?: string | null;
}

export interface RegisterDomainInput {
  domain: string;
}

export interface RegisterDomainResult {
  providerDomainId: string;
  status: string;
  dnsRecords: DnsRecordDto[];
}

export interface VerifyDomainResult {
  status: string;
  dnsRecords?: DnsRecordDto[];
  failureReason?: string | null;
}

export interface EmailProviderPort {
  readonly providerName: string;
  readonly isSimulated: boolean;

  isConfigured(): boolean;

  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;

  registerDomain?(input: RegisterDomainInput): Promise<RegisterDomainResult>;
  verifyDomain?(providerDomainId: string): Promise<VerifyDomainResult>;
  getDomain?(providerDomainId: string): Promise<VerifyDomainResult>;
}
