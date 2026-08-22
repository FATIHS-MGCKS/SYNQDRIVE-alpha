import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export type SmsConfigPublicDto = {
  organizationId: string;
  isConnected: boolean;
  isActive: boolean;
  credentialsConfigured: boolean;
  webhookConfigured: boolean;
  senderProfileConfigured: boolean;
  webhookEndpointConfigured: boolean;
  lastWebhookAt: string | null;
  updatedAt: string;
};

@Injectable()
export class SmsConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicConfig(orgId: string): Promise<SmsConfigPublicDto> {
    let config = await this.prisma.orgSmsConfig.findUnique({
      where: { organizationId: orgId },
    });

    if (!config) {
      config = await this.prisma.orgSmsConfig.create({
        data: { organizationId: orgId },
      });
    }

    return {
      organizationId: config.organizationId,
      isConnected: config.isConnected,
      isActive: config.isActive,
      credentialsConfigured: config.apiKeyConfigured,
      webhookConfigured: config.webhookSigningSecretConfigured,
      senderProfileConfigured: Boolean(config.senderProfileId),
      webhookEndpointConfigured: Boolean(config.webhookEndpointId),
      lastWebhookAt: config.lastWebhookAt?.toISOString() ?? null,
      updatedAt: config.updatedAt.toISOString(),
    };
  }
}
