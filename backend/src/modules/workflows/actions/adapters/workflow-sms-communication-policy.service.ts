import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';

export interface WorkflowSmsCommunicationPolicyResult {
  allowed: boolean;
  reason?: string;
  code?: 'QUIET_HOURS' | 'RATE_LIMIT' | 'CONTACT_FREQUENCY' | 'MARKETING_BLOCKED' | 'CHANNEL_DISABLED';
}

@Injectable()
export class WorkflowSmsCommunicationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(input: {
    organizationId: string;
    phoneNormalized: string;
    enforceQuietHours: boolean;
    respectQuietHours?: boolean;
    messageKind: 'transactional' | 'marketing' | 'support';
    now?: Date;
  }): Promise<WorkflowSmsCommunicationPolicyResult> {
    const config = await this.prisma.orgSmsConfig.findUnique({
      where: { organizationId: input.organizationId },
      select: { isActive: true },
    });
    if (!config?.isActive) {
      return {
        allowed: false,
        code: 'CHANNEL_DISABLED',
        reason: 'SMS channel is not active for this organization',
      };
    }

    if (input.messageKind === 'marketing') {
      return {
        allowed: false,
        code: 'MARKETING_BLOCKED',
        reason: 'Marketing SMS via workflow is not enabled',
      };
    }

    if (input.enforceQuietHours && input.respectQuietHours !== false) {
      const inWindow = await this.isWithinQuietHours(input.organizationId, input.now ?? new Date());
      if (!inWindow) {
        return {
          allowed: false,
          code: 'QUIET_HOURS',
          reason: 'Outside organization SMS quiet hours (Mon–Fri 08:00–20:00 org timezone)',
        };
      }
    }

    const since24h = new Date((input.now ?? new Date()).getTime() - 24 * 60 * 60 * 1000);
    const recentToPhone = await this.prisma.outboundSms.count({
      where: {
        organizationId: input.organizationId,
        toPhoneNormalized: input.phoneNormalized,
        createdAt: { gte: since24h },
      },
    });
    if (recentToPhone >= 3) {
      return {
        allowed: false,
        code: 'CONTACT_FREQUENCY',
        reason: 'Contact frequency limit reached (3 SMS per phone per 24h)',
      };
    }

    const sinceHour = new Date((input.now ?? new Date()).getTime() - 60 * 60 * 1000);
    const recentOrg = await this.prisma.outboundSms.count({
      where: { organizationId: input.organizationId, createdAt: { gte: sinceHour } },
    });
    if (recentOrg >= 20) {
      return {
        allowed: false,
        code: 'RATE_LIMIT',
        reason: 'Hourly SMS send limit reached for this organization',
      };
    }

    return { allowed: true };
  }

  private async isWithinQuietHours(orgId: string, now: Date): Promise<boolean> {
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
    return hour >= 8 && hour < 20;
  }
}
