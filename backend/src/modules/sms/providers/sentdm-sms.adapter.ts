import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsProviderPort, SmsSendMessageInput, SmsSendMessageResult } from '@modules/communication/sms/sms-provider.port';
import type { SentDmSendFailure, SentDmSendRequest, SentDmSendResult } from './sentdm-sms.types';

export type SentDmFetch = typeof fetch;

@Injectable()
export class SentDmSmsAdapter implements SmsProviderPort {
  private readonly logger = new Logger(SentDmSmsAdapter.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly fetchImpl: SentDmFetch = fetch,
  ) {}

  async sendMessage(input: SmsSendMessageInput): Promise<SmsSendMessageResult> {
    const apiKey = this.resolveApiKey(input.organizationId);
    const result = await this.executeSend(
      {
        organizationId: input.organizationId,
        recipientE164: input.recipientE164,
        body: input.body,
        idempotencyKey: input.idempotencyKey,
        senderProfileId: input.senderProfileId!.trim(),
        sandbox: input.sandbox,
      },
      apiKey,
    );

    if (!result.ok) {
      throw result;
    }

    return {
      providerMessageId: result.providerMessageId,
      providerStatus: result.providerStatus,
      acceptedAt: result.acceptedAt,
    };
  }

  async executeSend(input: SentDmSendRequest, apiKey: string): Promise<SentDmSendResult> {
    const baseUrl = this.configService.get<string>('sms.apiBaseUrl', 'https://api.sent.dm');
    const timeoutMs = this.configService.get<number>('sms.requestTimeoutMs', 30_000);
    const sandbox = input.sandbox ?? this.configService.get<boolean>('sms.sandboxMode', false);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.fetchImpl(`${baseUrl}/v3/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'x-profile-id': input.senderProfileId,
          'Idempotency-Key': input.idempotencyKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: [input.recipientE164],
          channel: ['sms'],
          text: input.body,
          sandbox,
        }),
        signal: controller.signal,
      });

      const json = await this.parseJson(response);
      if (!response.ok) {
        return this.classifyHttpError(response.status, json);
      }

      const providerMessageId = this.extractProviderMessageId(json);
      if (!providerMessageId) {
        return {
          ok: false,
          kind: 'MALFORMED_RESPONSE',
          failureCode: 'MALFORMED_RESPONSE',
          retryable: true,
        };
      }

      const providerStatus =
        typeof json?.data?.status === 'string' ? json.data.status : 'QUEUED';

      return {
        ok: true,
        providerMessageId,
        providerStatus,
        acceptedAt: new Date(),
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          ok: false,
          kind: 'NETWORK_TIMEOUT',
          failureCode: 'NETWORK_TIMEOUT',
          retryable: true,
        };
      }
      this.logger.warn({
        msg: 'sent.dm SMS transport error',
        organizationId: input.organizationId,
        failureCode: 'NETWORK_ERROR',
      });
      return {
        ok: false,
        kind: 'NETWORK_TIMEOUT',
        failureCode: 'NETWORK_ERROR',
        retryable: true,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  resolveApiKey(organizationId: string): string {
    const perOrg = process.env[`SENT_DM_API_KEY_${organizationId}`]?.trim();
    if (perOrg) {
      return perOrg;
    }
    const global = this.configService.get<string>('sms.globalApiKey', '')?.trim();
    if (!global) {
      const failure: SentDmSendFailure = {
        ok: false,
        kind: 'AUTH_CONFIGURATION',
        failureCode: 'AUTH_CONFIGURATION',
        retryable: false,
      };
      throw failure;
    }
    return global;
  }

  private async parseJson(response: Response): Promise<any> {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  private extractProviderMessageId(json: any): string | null {
    const recipients = json?.data?.recipients;
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return null;
    }
    const smsRecipient = recipients.find((r: any) => r?.channel === 'sms') ?? recipients[0];
    const id = smsRecipient?.message_id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }

  private classifyHttpError(status: number, json: any): SentDmSendFailure {
    const errorCode =
      typeof json?.error?.code === 'string' ? json.error.code.slice(0, 64) : `HTTP_${status}`;

    if (status === 401 || status === 403) {
      return { ok: false, kind: 'AUTH_CONFIGURATION', failureCode: errorCode, retryable: false };
    }
    if (status === 400 || status === 404 || status === 422) {
      return { ok: false, kind: 'TERMINAL_REJECTION', failureCode: errorCode, retryable: false };
    }
    if (status === 429) {
      return { ok: false, kind: 'RATE_LIMIT', failureCode: errorCode, retryable: true };
    }
    if (status >= 500) {
      return { ok: false, kind: 'TRANSIENT_5XX', failureCode: errorCode, retryable: true };
    }
    return { ok: false, kind: 'UNKNOWN', failureCode: errorCode, retryable: true };
  }
}
