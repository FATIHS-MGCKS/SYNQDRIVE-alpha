import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OrgSmsConfig } from '@prisma/client';
import type { SmsProviderPort, SmsSendMessageInput, SmsSendMessageResult } from '@modules/communication/sms/sms-provider.port';

export class SentDmSmsProviderError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'SentDmSmsProviderError';
  }
}

interface SentDmSendResponse {
  data?: {
    recipients?: Array<{
      message_id?: string;
      status?: string;
    }>;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

@Injectable()
export class SentDmSmsAdapter implements SmsProviderPort {
  private readonly logger = new Logger(SentDmSmsAdapter.name);

  constructor(private readonly configService: ConfigService) {}

  async sendMessage(input: SmsSendMessageInput): Promise<SmsSendMessageResult> {
    const apiKey = this.resolveApiKey(input.organizationId);
    if (!apiKey) {
      throw new SentDmSmsProviderError('SMS_NOT_CONFIGURED', 'SMS provider API key is not configured');
    }

    const baseUrl = this.configService.get<string>('sms.apiBaseUrl', 'https://api.sent.dm');
    const url = `${baseUrl.replace(/\/$/, '')}/v3/messages`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'Idempotency-Key': input.idempotencyKey,
    };
    if (input.senderProfileId?.trim()) {
      headers['x-profile-id'] = input.senderProfileId.trim();
    }

    const body: Record<string, unknown> = {
      to: [input.recipientE164],
      text: input.body,
      channel: ['sms'],
    };
    if (input.sandbox) {
      body.sandbox = true;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    let parsed: SentDmSendResponse | null = null;
    try {
      parsed = responseText ? (JSON.parse(responseText) as SentDmSendResponse) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const code = parsed?.error?.code ?? `HTTP_${response.status}`;
      this.logger.warn({
        msg: 'sent.dm SMS send rejected',
        organizationId: input.organizationId,
        errorCode: code,
        status: response.status,
      });
      throw new SentDmSmsProviderError(
        code,
        'SMS provider rejected send request',
        response.status >= 500 || response.status === 429,
      );
    }

    const recipient = parsed?.data?.recipients?.[0];
    const providerMessageId = recipient?.message_id?.trim();
    if (!providerMessageId) {
      throw new SentDmSmsProviderError(
        'SMS_INVALID_RESPONSE',
        'SMS provider accepted request without message_id',
      );
    }

    return {
      providerMessageId,
      providerStatus: (recipient?.status ?? 'QUEUED').toUpperCase(),
      acceptedAt: new Date(),
    };
  }

  resolveApiKey(organizationId: string, orgConfig?: OrgSmsConfig | null): string | null {
    if (orgConfig?.apiKeyConfigured) {
      const perOrg = process.env[`SENT_DM_API_KEY_${organizationId}`]?.trim();
      if (perOrg) {
        return perOrg;
      }
    }
    const global = this.configService.get<string>('sms.globalApiKey', '')?.trim();
    return global || null;
  }

  resolveWebhookSigningSecret(organizationId: string, orgConfig?: OrgSmsConfig | null): string | null {
    if (orgConfig?.webhookSigningSecretConfigured) {
      const perOrg = process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${organizationId}`]?.trim();
      if (perOrg) {
        return perOrg;
      }
    }
    return this.configService.get<string>('sms.globalWebhookSigningSecret', '')?.trim() || null;
  }

  isConfigured(orgConfig: OrgSmsConfig | null | undefined): boolean {
    if (!orgConfig?.isActive || !orgConfig.apiKeyConfigured) {
      return false;
    }
    return Boolean(this.resolveApiKey(orgConfig.organizationId, orgConfig));
  }
}
