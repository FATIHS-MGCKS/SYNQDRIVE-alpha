import { Injectable } from '@nestjs/common';
import { VoiceAssistantStatus, VoiceConversationDirection } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { SmsConsentService } from '@modules/sms/sms-consent.service';
import { isWithinBusinessHours } from '@modules/voice-assistant/agent-deployment/agent-business-hours.util';
import {
  WorkflowCommunicationPolicyEngineService,
  evaluateQuietHours,
} from '../../communication-policy';
import {
  mapEngineResultToChannel,
  type WorkflowChannelCommunicationPolicyResult,
} from './workflow-communication-policy-bridge';
import { readBusinessHoursFromAssistant } from './workflow-voice-call.util';

export interface WorkflowVoiceCommunicationPolicyResult extends WorkflowChannelCommunicationPolicyResult {
  code?:
    | 'CHANNEL_DISABLED'
    | 'QUIET_HOURS'
    | 'CALL_HOURS'
    | 'CONTACT_FREQUENCY'
    | 'RATE_LIMIT'
    | 'CONTACT_PERMISSION'
    | string;
}

@Injectable()
export class WorkflowVoiceCallCommunicationPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly smsConsent: SmsConsentService,
    private readonly policyEngine: WorkflowCommunicationPolicyEngineService,
  ) {}

  async evaluate(input: {
    organizationId: string;
    phoneNormalized: string;
    callPurpose: string;
    respectCallHours?: boolean;
    bookingId?: string | null;
    customerId?: string | null;
    legalBasisRef?: string | null;
    requiresApproval?: boolean;
    runApproved?: boolean;
    frozenSnapshot?: import('../../communication-policy').WorkflowCommunicationPolicySnapshot | null;
    phase?: 'plan' | 'pre_send';
    now?: Date;
  }): Promise<WorkflowVoiceCommunicationPolicyResult> {
    const now = input.now ?? new Date();

    const assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId: input.organizationId },
      select: {
        status: true,
        outboundEnabled: true,
        permContactCustomers: true,
        businessHours: true,
        businessHoursStart: true,
        businessHoursEnd: true,
        businessHoursTimezone: true,
      },
    });

    const consentRow = await this.smsConsent.getConsent(input.organizationId, input.phoneNormalized);
    const optedOut = this.smsConsent.isOptedOut(consentRow);

    const inCallHours = await this.isWithinAllowedCallHours(
      input.organizationId,
      assistant ? readBusinessHoursFromAssistant(assistant) : null,
      now,
      input.respectCallHours !== false,
    );

    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const recentToPhone = await this.prisma.voiceConversation.count({
      where: {
        organizationId: input.organizationId,
        direction: VoiceConversationDirection.OUTBOUND,
        callerNumber: { contains: input.phoneNormalized.slice(-8) },
        createdAt: { gte: since24h },
      },
    });
    const contactFrequencyExceeded = recentToPhone >= 2;

    const sinceHour = new Date(now.getTime() - 60 * 60 * 1000);
    const recentOrg = await this.prisma.voiceConversation.count({
      where: {
        organizationId: input.organizationId,
        direction: VoiceConversationDirection.OUTBOUND,
        createdAt: { gte: sinceHour },
      },
    });
    const rateLimitExceeded = recentOrg >= 10;

    const org = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { timezone: true },
    });
    const timeZone = org?.timezone?.trim() || 'Europe/Berlin';
    const quietHours = evaluateQuietHours(timeZone, now, { startHour: 9, endHour: 18 });

    const engineResult = this.policyEngine.evaluate({
      organizationId: input.organizationId,
      phase: input.phase ?? 'plan',
      channel: 'voice',
      processingPurpose: 'operational',
      recipientType: input.bookingId ? 'booking_customer' : 'customer',
      recipientPhoneNormalized: input.phoneNormalized,
      recipientValidated: true,
      bookingId: input.bookingId,
      customerId: input.customerId,
      legalBasisRef: input.legalBasisRef ?? 'gdpr.art6.1.f.legitimate_interest',
      requireBookingOrContractRef: true,
      optedOut,
      channelEnabled: Boolean(
        assistant?.status === VoiceAssistantStatus.ACTIVE && assistant.outboundEnabled,
      ),
      channelPermissionGranted: Boolean(assistant?.permContactCustomers),
      enforceQuietHours: input.respectCallHours !== false,
      respectQuietHours: input.respectCallHours,
      inQuietHours: inCallHours,
      quietHoursDelayUntil: inCallHours ? null : quietHours.nextAllowedAt,
      quietHoursExplanation: inCallHours
        ? undefined
        : 'Outside allowed outbound call hours for this organization',
      contactFrequencyExceeded,
      contactFrequencyDelayUntil: contactFrequencyExceeded
        ? new Date(now.getTime() + 24 * 60 * 60 * 1000)
        : null,
      rateLimitExceeded,
      rateLimitDelayUntil: rateLimitExceeded ? new Date(now.getTime() + 60 * 60 * 1000) : null,
      aiGenerated: true,
      aiTransparencyProvided: true,
      requiresApproval: input.requiresApproval,
      runApproved: input.runApproved,
      frozenSnapshot: input.frozenSnapshot,
      retentionClass: 'COMPLIANCE',
      now,
    });

    return mapEngineResultToChannel(engineResult);
  }

  private async isWithinAllowedCallHours(
    orgId: string,
    businessHours: ReturnType<typeof readBusinessHoursFromAssistant>,
    now: Date,
    respectCallHours: boolean,
  ): Promise<boolean> {
    if (!respectCallHours) return true;

    if (businessHours) {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId },
        select: { timezone: true },
      });
      const timeZone = businessHours.timezone?.trim() || org?.timezone?.trim() || 'Europe/Berlin';
      const localized = new Date(now.toLocaleString('en-US', { timeZone }));
      return isWithinBusinessHours(businessHours, localized);
    }

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { timezone: true },
    });
    const timeZone = org?.timezone?.trim() || 'Europe/Berlin';
    const quiet = evaluateQuietHours(timeZone, now, { startHour: 9, endHour: 18 });
    return quiet.inWindow;
  }
}
