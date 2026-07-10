import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  DnsRecordDto,
  EmailProviderPort,
  RegisterDomainInput,
  RegisterDomainResult,
  SendEmailInput,
  SendEmailResult,
  VerifyDomainResult,
} from './email-provider.port';
import { mapResendOperatorError } from '../resend-error.util';

interface ResendDomainRecord {
  record?: string;
  type?: string;
  name?: string;
  value?: string;
  priority?: number;
  status?: string;
}

@Injectable()
export class ResendEmailProvider implements EmailProviderPort {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly apiKey: string;

  readonly providerName = 'resend';
  readonly isSimulated = false;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('email.resendApiKey', '');
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  private formatFrom(email: string, name?: string | null): string {
    if (!name?.trim()) return email;
    return `${name.trim()} <${email}>`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<{ ok: boolean; status: number; data: T | null; errorMessage?: string }> {
    const res = await fetch(`https://api.resend.com${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = (await res.json().catch(() => null)) as T & { message?: string };
    if (!res.ok) {
      const message =
        (data as { message?: string } | null)?.message ||
        `Resend API error ${res.status}`;
      this.logger.warn(`Resend ${method} ${path} failed: ${message}`);
      return { ok: false, status: res.status, data: null, errorMessage: message };
    }
    return { ok: true, status: res.status, data, errorMessage: undefined };
  }

  private mapDnsRecords(records: ResendDomainRecord[] | undefined): DnsRecordDto[] {
    return (records ?? []).map((r) => ({
      type: r.type || r.record || 'TXT',
      name: r.name || '',
      value: r.value || '',
      priority: r.priority ?? null,
      status: r.status ?? null,
    }));
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.isConfigured()) {
      return {
        provider: this.providerName,
        providerMessageId: null,
        status: 'FAILED',
        errorCode: 'NOT_CONFIGURED',
        errorMessage: 'RESEND_API_KEY is not configured',
      };
    }

    const payload: Record<string, unknown> = {
      from: this.formatFrom(input.fromEmail, input.fromName),
      to: [input.toEmail],
      subject: input.subject,
    };

    if (input.replyToEmail) payload.reply_to = input.replyToEmail;
    if (input.ccEmails?.length) payload.cc = input.ccEmails;
    if (input.bccEmails?.length) payload.bcc = input.bccEmails;
    if (input.bodyHtml) payload.html = input.bodyHtml;
    if (input.bodyText) payload.text = input.bodyText;
    if (input.attachments?.length) {
      payload.attachments = input.attachments.map((a) => ({
        filename: a.fileName,
        content: a.content.toString('base64'),
      }));
    }

    const requestHeaders: Record<string, string> = {};
    if (input.idempotencyKey) {
      requestHeaders['Idempotency-Key'] = input.idempotencyKey;
    }

    const result = await this.request<{ id?: string }>(
      'POST',
      '/emails',
      payload,
      requestHeaders,
    );
    if (!result.ok) {
      return {
        provider: this.providerName,
        providerMessageId: null,
        status: 'FAILED',
        errorCode: String(result.status),
        errorMessage: result.errorMessage,
      };
    }

    return {
      provider: this.providerName,
      providerMessageId: result.data?.id ?? null,
      status: 'SENT',
    };
  }

  async registerDomain(input: RegisterDomainInput): Promise<RegisterDomainResult> {
    const result = await this.request<{
      id?: string;
      status?: string;
      records?: ResendDomainRecord[];
    }>('POST', '/domains', { name: input.domain });

    if (!result.ok || !result.data?.id) {
      throw new Error(result.errorMessage || 'Failed to register domain with Resend');
    }

    return {
      providerDomainId: result.data.id,
      status: result.data.status || 'PENDING_DNS',
      dnsRecords: this.mapDnsRecords(result.data.records),
    };
  }

  async verifyDomain(providerDomainId: string): Promise<VerifyDomainResult> {
    const result = await this.request<{
      status?: string;
      records?: ResendDomainRecord[];
    }>('POST', `/domains/${providerDomainId}/verify`);

    if (!result.ok) {
      return {
        status: 'FAILED',
        failureReason: mapResendOperatorError(result.errorMessage),
      };
    }

    return {
      status: result.data?.status || 'VERIFYING',
      dnsRecords: this.mapDnsRecords(result.data?.records),
    };
  }

  async getDomain(providerDomainId: string): Promise<VerifyDomainResult> {
    const result = await this.request<{
      status?: string;
      records?: ResendDomainRecord[];
    }>('GET', `/domains/${providerDomainId}`);

    if (!result.ok) {
      return {
        status: 'FAILED',
        failureReason: mapResendOperatorError(result.errorMessage),
      };
    }

    return {
      status: result.data?.status || 'PENDING_DNS',
      dnsRecords: this.mapDnsRecords(result.data?.records),
    };
  }
}
