import { Injectable } from '@nestjs/common';
import { VoiceAssistantStatus, VoiceConversationDirection } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { isWithinBusinessHours } from '@modules/voice-assistant/agent-deployment/agent-business-hours.util';
import { readBusinessHoursFromAssistant } from './workflow-voice-call.util';

export interface WorkflowVoiceCommunicationPolicyResult {
  allowed: boolean;
  reason?: string;
  code?:
    | 'CHANNEL_DISABLED'
    | 'QUIET_HOURS'
    | 'CALL_HOURS'
    | 'CONTACT_FREQUENCY'
    | 'RATE_LIMIT'
    | 'CONTACT_PERMISSION';
}

@Injectable()
export class WorkflowVoiceCallCommunicationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(input: {
    organizationId: string;
    phoneNormalized: string;
    callPurpose: string;
    respectCallHours?: boolean;
    now?: Date;
  }): Promise<WorkflowVoiceCommunicationPolicyResult> {
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

    if (!assistant || assistant.status !== VoiceAssistantStatus.ACTIVE) {
      return {
        allowed: false,
        code: 'CHANNEL_DISABLED',
        reason: 'Voice assistant is not active for this organization',
      };
    }

    if (!assistant.outboundEnabled) {
      return {
        allowed: false,
        code: 'CHANNEL_DISABLED',
        reason: 'Outbound voice calls are disabled for this organization',
      };
    }

    if (!assistant.permContactCustomers) {
      return {
        allowed: false,
        code: 'CONTACT_PERMISSION',
        reason: 'Assistant permission permContactCustomers is required for workflow outbound calls',
      };
    }

    if (input.respectCallHours !== false) {
      const businessHours = readBusinessHoursFromAssistant(assistant);
      const inHours = await this.isWithinAllowedCallHours(
        input.organizationId,
        businessHours,
        input.now ?? new Date(),
      );
      if (!inHours) {
        return {
          allowed: false,
          code: 'CALL_HOURS',
          reason: 'Outside allowed outbound call hours for this organization',
        };
      }
    }

    const since24h = new Date((input.now ?? new Date()).getTime() - 24 * 60 * 60 * 1000);
    const recentToPhone = await this.prisma.voiceConversation.count({
      where: {
        organizationId: input.organizationId,
        direction: VoiceConversationDirection.OUTBOUND,
        callerNumber: { contains: input.phoneNormalized.slice(-8) },
        createdAt: { gte: since24h },
      },
    });
    if (recentToPhone >= 2) {
      return {
        allowed: false,
        code: 'CONTACT_FREQUENCY',
        reason: 'Contact frequency limit reached (2 outbound voice calls per phone per 24h)',
      };
    }

    const sinceHour = new Date((input.now ?? new Date()).getTime() - 60 * 60 * 1000);
    const recentOrg = await this.prisma.voiceConversation.count({
      where: {
        organizationId: input.organizationId,
        direction: VoiceConversationDirection.OUTBOUND,
        createdAt: { gte: sinceHour },
      },
    });
    if (recentOrg >= 10) {
      return {
        allowed: false,
        code: 'RATE_LIMIT',
        reason: 'Hourly outbound voice call limit reached for this organization',
      };
    }

    return { allowed: true };
  }

  private async isWithinAllowedCallHours(
    orgId: string,
    businessHours: ReturnType<typeof readBusinessHoursFromAssistant>,
    now: Date,
  ): Promise<boolean> {
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
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    }).formatToParts(now);

    const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
    if (weekday === 'Sat' || weekday === 'Sun') return false;
    return hour >= 9 && hour < 18;
  }
}
