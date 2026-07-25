import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { WhatsAppTemplateCategory } from '@prisma/client';
import { WhatsAppConsentService } from '@modules/whatsapp/whatsapp-consent.service';
import {
  WorkflowCommunicationPolicyEngineService,
  evaluateQuietHours,
} from '../../communication-policy';
import {
  mapEngineResultToChannel,
  type WorkflowChannelCommunicationPolicyResult,
} from './workflow-communication-policy-bridge';

export interface WorkflowWhatsAppCommunicationPolicyResult extends WorkflowChannelCommunicationPolicyResult {
  code?: 'QUIET_HOURS' | 'RATE_LIMIT' | 'CONTACT_FREQUENCY' | 'MARKETING_BLOCKED' | 'CHANNEL_DISABLED' | string;
}

@Injectable()
export class WorkflowWhatsAppCommunicationPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: WhatsAppConsentService,
    private readonly policyEngine: WorkflowCommunicationPolicyEngineService,
  ) {}

  async evaluate(input: {
    organizationId: string;
    phoneNormalized: string;
    templateCategory?: WhatsAppTemplateCategory;
    messageKind: 'transactional' | 'marketing' | 'support';
    enforceQuietHours: boolean;
    respectQuietHours?: boolean;
    bookingId?: string | null;
    customerId?: string | null;
    legalBasisRef?: string | null;
    aiGenerated?: boolean;
    aiTransparencyProvided?: boolean;
    requiresApproval?: boolean;
    runApproved?: boolean;
    frozenSnapshot?: import('../../communication-policy').WorkflowCommunicationPolicySnapshot | null;
    phase?: 'plan' | 'pre_send';
    now?: Date;
  }): Promise<WorkflowWhatsAppCommunicationPolicyResult> {
    const now = input.now ?? new Date();
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: input.organizationId },
      select: { isActive: true, isConnected: true },
    });

    const consentRow = await this.consent.getConsent(input.organizationId, input.phoneNormalized);
    const optedOut = this.consent.isOptedOut(consentRow);

    const org = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { timezone: true },
    });
    const timeZone = org?.timezone?.trim() || 'Europe/Berlin';
    const quietHours = evaluateQuietHours(timeZone, now);

    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentToPhone = await this.prisma.whatsAppMessage.count({
      where: {
        organizationId: input.organizationId,
        direction: 'outgoing',
        createdAt: { gte: since24h },
        conversation: { contactPhoneNormalized: input.phoneNormalized },
      },
    });
    const maxPerPhonePerDay = 5;
    const contactFrequencyExceeded = recentToPhone >= maxPerPhonePerDay;

    const sinceHour = new Date(now.getTime() - 60 * 60 * 1000);
    const recentOrg = await this.prisma.whatsAppMessage.count({
      where: {
        organizationId: input.organizationId,
        direction: 'outgoing',
        createdAt: { gte: sinceHour },
      },
    });
    const rateLimitExceeded = recentOrg >= 30;

    const engineResult = this.policyEngine.evaluate({
      organizationId: input.organizationId,
      phase: input.phase ?? 'plan',
      channel: 'whatsapp',
      processingPurpose: input.messageKind,
      recipientType: input.bookingId ? 'booking_customer' : 'customer',
      recipientPhoneNormalized: input.phoneNormalized,
      recipientValidated: true,
      bookingId: input.bookingId,
      customerId: input.customerId,
      legalBasisRef: input.legalBasisRef ?? 'gdpr.art6.1.b.contract',
      requireBookingOrContractRef: input.messageKind === 'transactional',
      optedOut,
      optedIn: Boolean(consentRow?.optedInAt),
      requireOptIn: input.messageKind === 'marketing',
      channelEnabled: Boolean(config?.isConnected && config.isActive),
      channelPermissionGranted: true,
      communicationPreference: null,
      fallbackChannel: 'sms',
      enforceQuietHours: input.enforceQuietHours,
      respectQuietHours: input.respectQuietHours,
      inQuietHours: quietHours.inWindow,
      quietHoursDelayUntil: quietHours.nextAllowedAt,
      contactFrequencyExceeded,
      contactFrequencyDelayUntil: contactFrequencyExceeded
        ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
        : null,
      rateLimitExceeded,
      rateLimitDelayUntil: rateLimitExceeded ? new Date(now.getTime() + 60 * 60 * 1000) : null,
      aiGenerated: input.aiGenerated,
      aiTransparencyProvided: input.aiTransparencyProvided,
      requiresApproval: input.requiresApproval,
      runApproved: input.runApproved,
      frozenSnapshot: input.frozenSnapshot,
      retentionClass: 'STANDARD',
      now,
    });

    return mapEngineResultToChannel(engineResult);
  }
}
