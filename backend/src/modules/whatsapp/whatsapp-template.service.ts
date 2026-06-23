import { Injectable, NotFoundException } from '@nestjs/common';
import {
  WhatsAppTemplateCategory,
  WhatsAppTemplateProviderStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { OrgWhatsAppConfig } from '@prisma/client';
import { WhatsAppProviderService } from './providers/whatsapp-provider.service';
import { WhatsAppMessagePolicyService } from './whatsapp-message-policy.service';
import { WhatsAppConsentService } from './whatsapp-consent.service';
import { WhatsAppProviderNotConfiguredException } from './utils/whatsapp-errors';

export interface CreateWhatsAppTemplateDto {
  name: string;
  language?: string;
  category: WhatsAppTemplateCategory;
  bodyTemplate: string;
  variableSchema?: Record<string, unknown>;
}

@Injectable()
export class WhatsAppTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: WhatsAppProviderService,
    private readonly policy: WhatsAppMessagePolicyService,
    private readonly consent: WhatsAppConsentService,
  ) {}

  listTemplates(orgId: string) {
    return this.prisma.whatsAppTemplate.findMany({
      where: { organizationId: orgId },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async createDraft(orgId: string, dto: CreateWhatsAppTemplateDto) {
    return this.prisma.whatsAppTemplate.create({
      data: {
        organizationId: orgId,
        name: dto.name,
        language: dto.language ?? 'de',
        category: dto.category,
        bodyTemplate: dto.bodyTemplate,
        variableSchema: dto.variableSchema as any,
        providerStatus: WhatsAppTemplateProviderStatus.DRAFT,
      },
    });
  }

  async updateDraft(orgId: string, templateId: string, dto: Partial<CreateWhatsAppTemplateDto>) {
    const existing = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    return this.prisma.whatsAppTemplate.update({
      where: { id: templateId },
      data: {
        name: dto.name,
        language: dto.language,
        category: dto.category,
        bodyTemplate: dto.bodyTemplate,
        variableSchema: dto.variableSchema as any,
      },
    });
  }

  async markProviderStatus(
    orgId: string,
    templateId: string,
    status: WhatsAppTemplateProviderStatus,
    providerTemplateId?: string,
  ) {
    const existing = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, organizationId: orgId },
    });
    if (!existing) throw new NotFoundException('Template not found');

    return this.prisma.whatsAppTemplate.update({
      where: { id: templateId },
      data: {
        providerStatus: status,
        providerTemplateId: providerTemplateId ?? existing.providerTemplateId,
      },
    });
  }

  async sendTemplateMessage(
    orgConfig: OrgWhatsAppConfig,
    toPhone: string,
    templateId: string,
    variables: Record<string, string>,
    metadata: { conversationId?: string; messageId?: string },
  ) {
    const template = await this.prisma.whatsAppTemplate.findFirst({
      where: { id: templateId, organizationId: orgConfig.organizationId },
    });
    if (!template) throw new NotFoundException('Template not found');

    const policy = this.policy.canSendTemplate(orgConfig.organizationId, template);
    if (!policy.allowed) {
      throw new Error(policy.reason);
    }

    await this.consent.assertCanSend(orgConfig.organizationId, toPhone, 'transactional');

    if (!this.provider.isConfigured(orgConfig)) {
      throw new WhatsAppProviderNotConfiguredException();
    }

    return this.provider.sendTemplateMessage(
      orgConfig,
      toPhone,
      template.name,
      template.language,
      variables,
      {
        organizationId: orgConfig.organizationId,
        conversationId: metadata.conversationId,
        messageId: metadata.messageId,
        templateName: template.name,
      },
    );
  }
}
