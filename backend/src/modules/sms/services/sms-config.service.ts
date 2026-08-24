import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgSmsConfig } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { COMMUNICATION_CENTER_SMS_ENABLED_FLAG } from '@config/sms.config';

export interface SmsRuntimeReadiness {
  ready: boolean;
  reason?: string;
}

export interface SmsRuntimeConfigView {
  isConnected: boolean;
  isActive: boolean;
  sentDmAccountConfigured: boolean;
  senderProfileConfigured: boolean;
  webhookEndpointConfigured: boolean;
  apiKeyConfigured: boolean;
  webhookSigningSecretConfigured: boolean;
  runtimeEnabled: boolean;
}

@Injectable()
export class SmsConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  isRuntimeEnabled(): boolean {
    return process.env[COMMUNICATION_CENTER_SMS_ENABLED_FLAG] === 'true';
  }

  async getOrgConfig(organizationId: string): Promise<OrgSmsConfig | null> {
    return this.prisma.orgSmsConfig.findUnique({ where: { organizationId } });
  }

  async getRuntimeConfigView(organizationId: string): Promise<SmsRuntimeConfigView> {
    const config = await this.getOrgConfig(organizationId);
    return {
      isConnected: config?.isConnected ?? false,
      isActive: config?.isActive ?? false,
      sentDmAccountConfigured: Boolean(config?.sentDmAccountId),
      senderProfileConfigured: Boolean(config?.senderProfileId),
      webhookEndpointConfigured: Boolean(config?.webhookEndpointId),
      apiKeyConfigured: config?.apiKeyConfigured ?? false,
      webhookSigningSecretConfigured: config?.webhookSigningSecretConfigured ?? false,
      runtimeEnabled: this.isRuntimeEnabled(),
    };
  }

  evaluateReadiness(config: OrgSmsConfig | null): SmsRuntimeReadiness {
    if (!this.isRuntimeEnabled()) {
      return { ready: false, reason: 'SMS runtime is disabled' };
    }
    if (!config) {
      return { ready: false, reason: 'SMS is not configured for this organization' };
    }
    if (!config.isConnected || !config.isActive) {
      return { ready: false, reason: 'SMS integration is not active' };
    }
    if (!config.sentDmAccountId?.trim()) {
      return { ready: false, reason: 'sent.dm account is not configured' };
    }
    if (!config.senderProfileId?.trim()) {
      return { ready: false, reason: 'SMS sender profile is not configured' };
    }
    if (!config.apiKeyConfigured) {
      return { ready: false, reason: 'SMS API credential is not configured' };
    }
    if (!this.resolveApiKey(config.organizationId)) {
      return { ready: false, reason: 'SMS API credential is not available' };
    }
    return { ready: true };
  }

  evaluateWebhookReadiness(config: OrgSmsConfig | null): SmsRuntimeReadiness {
    const base = this.evaluateReadiness(config);
    if (!base.ready) {
      return base;
    }
    if (!config!.webhookEndpointId?.trim()) {
      return { ready: false, reason: 'SMS webhook endpoint is not configured' };
    }
    if (!config!.webhookSigningSecretConfigured) {
      return { ready: false, reason: 'SMS webhook signing secret is not configured' };
    }
    return { ready: true };
  }

  resolveApiKey(organizationId: string, config?: OrgSmsConfig | null): string | null {
    if (config && !config.apiKeyConfigured) {
      return null;
    }
    const perOrg = process.env[`SENT_DM_API_KEY_${organizationId}`]?.trim();
    if (perOrg) {
      return perOrg;
    }
    return this.configService.get<string>('sms.globalApiKey', '')?.trim() || null;
  }

  assertOutboundReady(config: OrgSmsConfig | null): void {
    const readiness = this.evaluateReadiness(config);
    if (!readiness.ready) {
      throw new BadRequestException(readiness.reason ?? 'SMS is not ready');
    }
  }
}
