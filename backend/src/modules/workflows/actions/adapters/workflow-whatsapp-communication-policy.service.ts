import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import { WhatsAppTemplateCategory } from '@prisma/client';

export interface WorkflowWhatsAppCommunicationPolicyResult {
  allowed: boolean;
  reason?: string;
  code?: 'QUIET_HOURS' | 'RATE_LIMIT' | 'CONTACT_FREQUENCY' | 'MARKETING_BLOCKED' | 'CHANNEL_DISABLED';
}

/** Org-local quiet hours + contact frequency for workflow WhatsApp sends. */
@Injectable()
export class WorkflowWhatsAppCommunicationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(input: {
    organizationId: string;
    phoneNormalized: string;
    templateCategory?: WhatsAppTemplateCategory;
    messageKind: 'transactional' | 'marketing' | 'support';
    enforceQuietHours: boolean;
    respectQuietHours?: boolean;
    now?: Date;
  }): Promise<WorkflowWhatsAppCommunicationPolicyResult> {
    const config = await this.prisma.orgWhatsAppConfig.findUnique({
      where: { organizationId: input.organizationId },
      select: { isActive: true, isConnected: true },
    });
    if (!config?.isConnected || !config.isActive) {
      return {
        allowed: false,
        code: 'CHANNEL_DISABLED',
        reason: 'WhatsApp channel is not connected or active for this organization',
      };
    }

    if (input.messageKind === 'marketing') {
      return {
        allowed: false,
        code: 'MARKETING_BLOCKED',
        reason: 'Marketing WhatsApp sends via workflow are not enabled',
      };
    }

    if (input.enforceQuietHours && input.respectQuietHours !== false) {
      const inWindow = await this.isWithinQuietHours(input.organizationId, input.now ?? new Date());
      if (!inWindow) {
        return {
          allowed: false,
          code: 'QUIET_HOURS',
          reason: 'Outside organization WhatsApp quiet hours (Mon–Fri 08:00–20:00 org timezone)',
        };
      }
    }

    const since24h = new Date((input.now ?? new Date()).getTime() - 24 * 60 * 60 * 1000);
    const recentToPhone = await this.prisma.whatsAppMessage.count({
      where: {
        organizationId: input.organizationId,
        direction: 'outgoing',
        createdAt: { gte: since24h },
        conversation: { contactPhoneNormalized: input.phoneNormalized },
      },
    });
    const maxPerPhonePerDay = 5;
    if (recentToPhone >= maxPerPhonePerDay) {
      return {
        allowed: false,
        code: 'CONTACT_FREQUENCY',
        reason: `Contact frequency limit reached (${maxPerPhonePerDay} outbound messages per 24h)`,
      };
    }

    const sinceHour = new Date((input.now ?? new Date()).getTime() - 60 * 60 * 1000);
    const recentOrg = await this.prisma.whatsAppMessage.count({
      where: {
        organizationId: input.organizationId,
        direction: 'outgoing',
        createdAt: { gte: sinceHour },
      },
    });
    const maxPerOrgPerHour = 30;
    if (recentOrg >= maxPerOrgPerHour) {
      return {
        allowed: false,
        code: 'RATE_LIMIT',
        reason: 'Hourly WhatsApp send limit reached for this organization',
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
    const isWeekend = weekday === 'Sat' || weekday === 'Sun';
    if (isWeekend) return false;
    return hour >= 8 && hour < 20;
  }
}
