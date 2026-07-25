import { Injectable } from '@nestjs/common';
import { PrismaService } from '@shared/database/prisma.service';
import type { WorkflowEmailTemplateCategory } from './workflow-email-templates';
import {
  WorkflowCommunicationPolicyEngineService,
  evaluateQuietHours,
} from '../../communication-policy';
import {
  mapEngineResultToChannel,
  type WorkflowChannelCommunicationPolicyResult,
} from './workflow-communication-policy-bridge';

export interface WorkflowEmailCommunicationPolicyResult extends WorkflowChannelCommunicationPolicyResult {
  code?: 'SUPPRESSED' | 'SEND_WINDOW' | 'MARKETING_BLOCKED' | string;
}

@Injectable()
export class WorkflowEmailCommunicationPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policyEngine: WorkflowCommunicationPolicyEngineService,
  ) {}

  async evaluate(input: {
    organizationId: string;
    recipientEmail: string;
    templateCategory: WorkflowEmailTemplateCategory;
    enforceSendWindow: boolean;
    respectSendWindow?: boolean;
    bookingId?: string | null;
    customerId?: string | null;
    legalBasisRef?: string | null;
    requiresApproval?: boolean;
    runApproved?: boolean;
    frozenSnapshot?: import('../../communication-policy').WorkflowCommunicationPolicySnapshot | null;
    phase?: 'plan' | 'pre_send';
    now?: Date;
  }): Promise<WorkflowEmailCommunicationPolicyResult> {
    const now = input.now ?? new Date();
    const email = input.recipientEmail.trim().toLowerCase();

    const suppressed = await this.prisma.billingEmailSuppression.findFirst({
      where: { organizationId: input.organizationId, email },
    });

    const org = await this.prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { timezone: true },
    });
    const timeZone = org?.timezone?.trim() || 'Europe/Berlin';
    const quietHours = evaluateQuietHours(timeZone, now);

    const purpose =
      input.templateCategory === 'MARKETING' ? 'marketing' : 'transactional';

    const engineResult = this.policyEngine.evaluate({
      organizationId: input.organizationId,
      phase: input.phase ?? 'plan',
      channel: 'email',
      processingPurpose: purpose,
      recipientType: input.bookingId ? 'booking_customer' : 'customer',
      recipientEmail: email,
      recipientValidated: email.includes('@'),
      bookingId: input.bookingId,
      customerId: input.customerId,
      legalBasisRef: input.legalBasisRef ?? 'gdpr.art6.1.b.contract',
      requireBookingOrContractRef: purpose === 'transactional',
      optedOut: Boolean(suppressed),
      emailSuppressed: Boolean(suppressed),
      channelEnabled: true,
      channelPermissionGranted: true,
      enforceQuietHours: input.enforceSendWindow,
      respectQuietHours: input.respectSendWindow,
      inQuietHours: quietHours.inWindow,
      quietHoursDelayUntil: quietHours.nextAllowedAt,
      requiresApproval: input.requiresApproval,
      runApproved: input.runApproved,
      frozenSnapshot: input.frozenSnapshot,
      retentionClass: 'STANDARD',
      now,
    });

    return mapEngineResultToChannel(engineResult);
  }
}
