import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { SmsConsentService } from '@modules/sms/sms-consent.service';
import {
  WorkflowCommunicationPolicyEngineService,
  evaluateQuietHours,
} from '../../communication-policy';
import {
  mapEngineResultToChannel,
  type WorkflowChannelCommunicationPolicyResult,
} from './workflow-communication-policy-bridge';

export interface WorkflowSmsCommunicationPolicyResult extends WorkflowChannelCommunicationPolicyResult {
  code?: 'QUIET_HOURS' | 'RATE_LIMIT' | 'CONTACT_FREQUENCY' | 'MARKETING_BLOCKED' | 'CHANNEL_DISABLED' | string;
}

@Injectable()
export class WorkflowSmsCommunicationPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly consent: SmsConsentService,
    private readonly policyEngine: WorkflowCommunicationPolicyEngineService,
  ) {}

  async evaluate(input: {
    organizationId: string;
    phoneNormalized: string;
    enforceQuietHours: boolean;
    respectQuietHours?: boolean;
    messageKind: 'transactional' | 'marketing' | 'support';
    bookingId?: string | null;
    customerId?: string | null;
    legalBasisRef?: string | null;
    requiresApproval?: boolean;
    runApproved?: boolean;
    frozenSnapshot?: import('../../communication-policy').WorkflowCommunicationPolicySnapshot | null;
    phase?: 'plan' | 'pre_send';
    now?: Date;
  }): Promise<WorkflowSmsCommunicationPolicyResult> {
    const now = input.now ?? new Date();
    const config = await this.prisma.orgSmsConfig.findUnique({
      where: { organizationId: input.organizationId },
      select: { isActive: true },
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
    const recentToPhone = await this.prisma.outboundSms.count({
      where: {
        organizationId: input.organizationId,
        toPhoneNormalized: input.phoneNormalized,
        createdAt: { gte: since24h },
      },
    });
    const contactFrequencyExceeded = recentToPhone >= 3;

    const sinceHour = new Date(now.getTime() - 60 * 60 * 1000);
    const recentOrg = await this.prisma.outboundSms.count({
      where: { organizationId: input.organizationId, createdAt: { gte: sinceHour } },
    });
    const rateLimitExceeded = recentOrg >= 20;

    const engineResult = this.policyEngine.evaluate({
      organizationId: input.organizationId,
      phase: input.phase ?? 'plan',
      channel: 'sms',
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
      channelEnabled: Boolean(config?.isActive),
      channelPermissionGranted: true,
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
      requiresApproval: input.requiresApproval,
      runApproved: input.runApproved,
      frozenSnapshot: input.frozenSnapshot,
      retentionClass: 'STANDARD',
      now,
    });

    return mapEngineResultToChannel(engineResult);
  }
}
