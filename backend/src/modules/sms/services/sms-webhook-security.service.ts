import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgSmsConfig } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { verifySentDmWebhookSignature } from '../providers/sentdm-webhook-verification';
import { parseSentDmWebhookEvent } from '../providers/sentdm-webhook.parser';
import type { ParsedSentDmWebhookEvent } from '../providers/sentdm-webhook.parser';

export interface VerifiedSmsWebhookIngress {
  organizationId: string;
  orgConfig: OrgSmsConfig;
  parsed: ParsedSentDmWebhookEvent;
  webhookEndpointId: string;
  occurredAt: Date;
}

@Injectable()
export class SmsWebhookSecurityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Fail-closed ingress gate. No mutation may proceed unless signature verification succeeds
   * against a configured per-org signing secret.
   */
  async verifyIngress(input: {
    rawBody: Buffer;
    headers: Record<string, string | string[] | undefined>;
  }): Promise<VerifiedSmsWebhookIngress> {
    const webhookEndpointId = headerValue(input.headers, 'x-webhook-id').trim();
    const timestamp = headerValue(input.headers, 'x-webhook-timestamp').trim();
    const signature = headerValue(input.headers, 'x-webhook-signature').trim();

    if (!webhookEndpointId || !timestamp || !signature) {
      throw new BadRequestException('Missing SMS webhook signature headers');
    }

    let parsed: ParsedSentDmWebhookEvent | null;
    try {
      parsed = parseSentDmWebhookEvent(JSON.parse(input.rawBody.toString('utf8')));
    } catch {
      throw new BadRequestException('Invalid SMS webhook payload');
    }
    if (!parsed) {
      throw new BadRequestException('Invalid SMS webhook payload');
    }

    const orgConfig = await this.resolveOrgConfig({
      webhookEndpointId,
      accountId: parsed.payload.account_id,
      providerMessageId: parsed.payload.message_id,
    });

    if (!orgConfig) {
      throw new ForbiddenException('SMS webhook tenant could not be resolved');
    }

    const signingSecret = this.resolveSigningSecret(orgConfig);
    if (!signingSecret) {
      throw new ForbiddenException('SMS webhook signing secret is not configured');
    }

    const signatureValid = verifySentDmWebhookSignature({
      rawBody: input.rawBody,
      webhookId: webhookEndpointId,
      timestamp,
      signatureHeader: signature,
      signingSecret,
    });
    if (!signatureValid) {
      throw new UnauthorizedException('Invalid SMS webhook signature');
    }

    if (
      parsed.payload.account_id
      && orgConfig.sentDmAccountId
      && parsed.payload.account_id !== orgConfig.sentDmAccountId
    ) {
      throw new ForbiddenException('SMS webhook account binding mismatch');
    }

    const occurredAt = resolveAuthoritativeOccurredAt(parsed);

    return {
      organizationId: orgConfig.organizationId,
      orgConfig,
      parsed,
      webhookEndpointId,
      occurredAt,
    };
  }

  resolveSigningSecret(orgConfig: OrgSmsConfig): string | null {
    if (!orgConfig.webhookSigningSecretConfigured) {
      return null;
    }
    const perOrg = process.env[`SENT_DM_WEBHOOK_SIGNING_SECRET_${orgConfig.organizationId}`]?.trim();
    if (perOrg) {
      return perOrg;
    }
    return this.configService.get<string>('sms.globalWebhookSigningSecret', '')?.trim() || null;
  }

  private async resolveOrgConfig(input: {
    webhookEndpointId: string;
    accountId?: string;
    providerMessageId?: string;
  }): Promise<OrgSmsConfig | null> {
    const byEndpoint = await this.prisma.orgSmsConfig.findUnique({
      where: { webhookEndpointId: input.webhookEndpointId },
    });
    if (byEndpoint?.isActive) {
      return byEndpoint;
    }

    if (input.providerMessageId?.trim()) {
      const message = await this.prisma.smsMessage.findUnique({
        where: { providerMessageId: input.providerMessageId.trim() },
        select: { organizationId: true },
      });
      if (message) {
        const config = await this.prisma.orgSmsConfig.findUnique({
          where: { organizationId: message.organizationId },
        });
        if (config?.isActive) {
          return config;
        }
      }
    }

    if (input.accountId?.trim()) {
      return this.prisma.orgSmsConfig.findUnique({
        where: { sentDmAccountId: input.accountId.trim() },
      });
    }

    return null;
  }
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string {
  const raw = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(raw)) {
    return raw[0] ?? '';
  }
  return raw ?? '';
}

function resolveAuthoritativeOccurredAt(parsed: ParsedSentDmWebhookEvent): Date {
  const payload = parsed.payload;
  const candidates = [
    payload.received_at,
    payload.updated_at,
    parsed.timestamp,
  ];
  for (const value of candidates) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  throw new BadRequestException('SMS webhook missing authoritative timestamp');
}
