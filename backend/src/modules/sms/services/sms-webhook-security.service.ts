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
   * Fail-closed ingress gate. X-Webhook-ID is authoritative tenant routing identity.
   * No mutation may proceed unless signature verification succeeds against that org secret.
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

    const orgConfig = await this.prisma.orgSmsConfig.findUnique({
      where: { webhookEndpointId },
    });
    if (!orgConfig?.isActive) {
      throw new ForbiddenException('SMS webhook endpoint is not registered for an active organization');
    }

    await this.assertPayloadTenantConsistency(orgConfig, parsed);

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

  private async assertPayloadTenantConsistency(
    orgConfig: OrgSmsConfig,
    parsed: ParsedSentDmWebhookEvent,
  ): Promise<void> {
    const accountId = parsed.payload.account_id?.trim();
    if (accountId && orgConfig.sentDmAccountId && accountId !== orgConfig.sentDmAccountId) {
      throw new ForbiddenException('SMS webhook account binding mismatch');
    }
    if (accountId && !orgConfig.sentDmAccountId) {
      throw new ForbiddenException('SMS webhook account binding is not configured');
    }

    const providerMessageId = parsed.payload.message_id?.trim();
    if (!providerMessageId) {
      return;
    }

    const message = await this.prisma.smsMessage.findUnique({
      where: { providerMessageId },
      select: { organizationId: true },
    });
    if (message && message.organizationId !== orgConfig.organizationId) {
      throw new ForbiddenException('SMS webhook message binding mismatch');
    }
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
