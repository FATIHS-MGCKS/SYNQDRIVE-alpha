import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowEmailTemplateCategory } from './workflow-email-templates';

export interface WorkflowEmailCommunicationPolicyResult {
  allowed: boolean;
  reason?: string;
  code?: 'SUPPRESSED' | 'SEND_WINDOW' | 'MARKETING_BLOCKED';
}

/** Org-local send window: Mon–Fri 08:00–20:00 in org timezone. */
@Injectable()
export class WorkflowEmailCommunicationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(input: {
    organizationId: string;
    recipientEmail: string;
    templateCategory: WorkflowEmailTemplateCategory;
    enforceSendWindow: boolean;
    respectSendWindow?: boolean;
    now?: Date;
  }): Promise<WorkflowEmailCommunicationPolicyResult> {
    const suppressed = await this.prisma.billingEmailSuppression.findFirst({
      where: {
        organizationId: input.organizationId,
        email: input.recipientEmail.trim().toLowerCase(),
      },
    });
    if (suppressed) {
      return {
        allowed: false,
        code: 'SUPPRESSED',
        reason: `Recipient suppressed (${suppressed.reason})`,
      };
    }

    if (input.templateCategory === 'MARKETING') {
      return {
        allowed: false,
        code: 'MARKETING_BLOCKED',
        reason: 'Marketing email templates are not enabled for workflow sends',
      };
    }

    if (input.enforceSendWindow && input.respectSendWindow !== false) {
      const inWindow = await this.isWithinSendWindow(input.organizationId, input.now ?? new Date());
      if (!inWindow) {
        return {
          allowed: false,
          code: 'SEND_WINDOW',
          reason: 'Outside organization email send window (Mon–Fri 08:00–20:00 org timezone)',
        };
      }
    }

    return { allowed: true };
  }

  private async isWithinSendWindow(orgId: string, now: Date): Promise<boolean> {
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
