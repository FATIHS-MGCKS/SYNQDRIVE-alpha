import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, VoiceProviderWebhookProcessingStatus } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { TwilioControlPlaneTelephonyService } from '@modules/twilio/twilio-control-plane.telephony.service';
import { VoiceBillingService } from '@modules/voice-billing/voice-billing.service';
import { VoiceSubscriptionService } from '@modules/voice-billing/voice-subscription.service';
import { VoiceProtectionAuditService } from '@modules/voice-protection/voice-protection-audit.service';
import { VoiceWebhookReplayService } from '@modules/voice-webhook-ingestion/voice-webhook-processing.service';
import { ElevenLabsService } from '../elevenlabs.service';
import { VoiceAssistantService } from '../voice-assistant.service';
import { AgentDeploymentService } from '../agent-deployment/agent-deployment.service';
import {
  VoiceAgentDeploymentRepository,
  VoicePhoneNumberRepository,
  VoiceProvisioningJobRepository,
  VoiceProviderAccountRepository,
  VoiceSubscriptionRepository,
} from '../control-plane/voice-control-plane.repository';
import { VoiceProviderWebhookEventRepository } from '../control-plane/voice-audit-persistence.repository';

type WebhookEventRow = {
  id: string;
  organizationId: string | null;
  organizationName: string | null;
  provider: string;
  eventType: string | null;
  status: string;
  receivedAt: string;
  processedAt: string | null;
  retryCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  diagnosticSummary: string | null;
};

@Injectable()
export class VoiceControlPlaneAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assistantService: VoiceAssistantService,
    private readonly elevenLabs: ElevenLabsService,
    private readonly twilioControlPlane: TwilioControlPlaneTelephonyService,
    private readonly billing: VoiceBillingService,
    private readonly subscriptions: VoiceSubscriptionService,
    private readonly subscriptionRepo: VoiceSubscriptionRepository,
    private readonly protectionAudit: VoiceProtectionAuditService,
    private readonly webhookEvents: VoiceProviderWebhookEventRepository,
    private readonly webhookReplay: VoiceWebhookReplayService,
    private readonly phoneNumbers: VoicePhoneNumberRepository,
    private readonly providerAccounts: VoiceProviderAccountRepository,
    private readonly provisioningJobs: VoiceProvisioningJobRepository,
    private readonly deployments: VoiceAgentDeploymentRepository,
    private readonly agentDeployment: AgentDeploymentService,
    @InjectQueue(QUEUE_NAMES.VOICE_WEBHOOK_PROCESS)
    private readonly webhookQueue: Queue,
  ) {}

  async getPlatformStatus() {
    const elevenLabsOk = this.elevenLabs.isConfigured();
    const twilioIe1Ok = this.twilioControlPlane.isConfigured();
    const mcpGatewayOk = Boolean(process.env.VOICE_MCP_GATEWAY_ENABLED !== 'false');

    const [webhookCounts, failedRecent, queueCounts, latencySample] = await Promise.all([
      this.prisma.voiceProviderWebhookEvent.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.voiceProviderWebhookEvent.count({
        where: {
          status: VoiceProviderWebhookProcessingStatus.FAILED,
          receivedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      this.safeQueueCounts(),
      this.prisma.voiceProviderWebhookEvent.findMany({
        where: {
          status: VoiceProviderWebhookProcessingStatus.PROCESSED,
          processedAt: { not: null },
          receivedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        select: { receivedAt: true, processedAt: true },
        take: 200,
        orderBy: { receivedAt: 'desc' },
      }),
    ]);

    const statusMap = Object.fromEntries(
      webhookCounts.map(row => [row.status, row._count._all]),
    );
    const queued = statusMap.QUEUED ?? 0;
    const received = statusMap.RECEIVED ?? 0;
    const backlog = queued + received + (queueCounts.waiting ?? 0) + (queueCounts.active ?? 0);

    const delaysMs = latencySample
      .map(row =>
        row.processedAt ? row.processedAt.getTime() - row.receivedAt.getTime() : null,
      )
      .filter((v): v is number => v != null && v >= 0);
    const avgDelayMs =
      delaysMs.length > 0
        ? Math.round(delaysMs.reduce((sum, v) => sum + v, 0) / delaysMs.length)
        : null;

    const incidents: Array<{ id: string; severity: 'critical' | 'warning'; message: string }> = [];
    if (!elevenLabsOk) {
      incidents.push({ id: 'elevenlabs', severity: 'critical', message: 'ElevenLabs not configured' });
    }
    if (!twilioIe1Ok) {
      incidents.push({ id: 'twilio-ie1', severity: 'warning', message: 'Twilio IE1 control plane not configured' });
    }
    if (failedRecent > 0) {
      incidents.push({
        id: 'webhook-dlq',
        severity: 'warning',
        message: `${failedRecent} failed webhook event(s) in the last 24h`,
      });
    }
    if (backlog > 50) {
      incidents.push({
        id: 'webhook-backlog',
        severity: 'warning',
        message: `Webhook processing backlog elevated (${backlog})`,
      });
    }

    return {
      checkedAt: new Date().toISOString(),
      providers: {
        elevenLabs: { ok: elevenLabsOk, label: elevenLabsOk ? 'Connected' : 'Not configured' },
        twilioIe1: { ok: twilioIe1Ok, label: twilioIe1Ok ? 'Connected' : 'Not configured' },
        mcpGateway: { ok: mcpGatewayOk, label: mcpGatewayOk ? 'Enabled' : 'Disabled' },
        webhookIngestion: { ok: true, label: 'Active' },
      },
      queues: {
        waiting: queueCounts.waiting ?? 0,
        active: queueCounts.active ?? 0,
        failed: queueCounts.failed ?? 0,
        webhookBacklog: backlog,
      },
      webhooks: {
        byStatus: statusMap,
        dlqCount24h: failedRecent,
        avgProcessingDelayMs: avgDelayMs,
      },
      activeIncidents: incidents,
    };
  }

  async listOrganizations() {
    const overview = await this.assistantService.getAdminOverview();
    const orgIds = overview.assistants.map(row => row.organizationId);

    const [subscriptions, budgets, billingSnapshots] = await Promise.all([
      this.prisma.voiceSubscription.findMany({
        where: { organizationId: { in: orgIds }, archivedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.voiceBudgetPolicy.findMany({
        where: { organizationId: { in: orgIds } },
      }),
      Promise.all(
        orgIds.map(async orgId => {
          try {
            return { orgId, usage: await this.billing.getOrganizationUsage(orgId) };
          } catch {
            return { orgId, usage: null };
          }
        }),
      ),
    ]);

    const subByOrg = new Map<string, (typeof subscriptions)[number]>();
    for (const sub of subscriptions) {
      if (!subByOrg.has(sub.organizationId)) subByOrg.set(sub.organizationId, sub);
    }
    const budgetByOrg = new Map(budgets.map(b => [b.organizationId, b]));
    const usageByOrg = new Map(billingSnapshots.map(s => [s.orgId, s.usage]));

    return {
      summary: overview.summary,
      organizations: overview.assistants.map(row => {
        const sub = subByOrg.get(row.organizationId);
        const budget = budgetByOrg.get(row.organizationId);
        const usage = usageByOrg.get(row.organizationId);
        return {
          ...row,
          planCode: sub?.planCode ?? usage?.planCode ?? null,
          subscriptionStatus: sub?.status ?? null,
          subaccountStatus: null,
          consumedMinutes: usage?.consumedMinutes ?? 0,
          remainingMinutes: usage?.remainingIncludedMinutes ?? 0,
          monthlyBudgetCents: budget?.monthlyBudgetCents ?? null,
          maxConcurrentCalls: budget?.maxConcurrentCalls ?? null,
          openErrors: row.lastError ? 1 : row.missingReadinessItemsCount,
        };
      }),
    };
  }

  async listPhoneNumbers() {
    const rows = await this.prisma.voicePhoneNumber.findMany({
      where: { archivedAt: null },
      include: {
        organization: { select: { id: true, companyName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 500,
    });

    return rows.map(row => ({
      id: row.id,
      organizationId: row.organizationId,
      organizationName: row.organization.companyName,
      maskedPhoneNumber: row.maskedPhoneNumber,
      status: row.lifecycle,
      region: row.region ?? null,
      regulatoryStatus: row.regulatoryStatus ?? null,
      elevenLabsAssigned: row.elevenLabsImportStatus === 'IMPORTED' || row.elevenLabsImportStatus === 'ASSIGNED',
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  async listWebhookEvents(params: {
    organizationId?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);
    const where: Prisma.VoiceProviderWebhookEventWhereInput = {};
    if (params.organizationId) where.organizationId = params.organizationId;
    if (params.status) {
      where.status = params.status as VoiceProviderWebhookProcessingStatus;
    }

    const [items, total] = await Promise.all([
      this.prisma.voiceProviderWebhookEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          organization: { select: { companyName: true } },
        },
      }),
      this.prisma.voiceProviderWebhookEvent.count({ where }),
    ]);

    return {
      total,
      items: items.map(event => this.mapWebhookEvent(event)),
    };
  }

  async listAuditEvents(params: { organizationId?: string; limit?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const where: Prisma.VoiceProtectionAuditEventWhereInput = {};
    if (params.organizationId) where.organizationId = params.organizationId;

    const [protection, approvals, executions] = await Promise.all([
      this.prisma.voiceProtectionAuditEvent.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { organization: { select: { companyName: true } } },
      }),
      this.prisma.voiceApprovalRequest.findMany({
        where: params.organizationId ? { organizationId: params.organizationId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          organization: { select: { companyName: true } },
          toolExecution: { select: { toolName: true, riskClass: true } },
        },
      }),
      this.prisma.voiceToolExecution.findMany({
        where: params.organizationId ? { organizationId: params.organizationId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { organization: { select: { companyName: true } } },
      }),
    ]);

    const merged = [
      ...protection.map(row => ({
        id: row.id,
        category: 'protection' as const,
        organizationId: row.organizationId,
        organizationName: row.organization.companyName,
        action: row.action,
        reasonCode: row.reasonCode,
        message: row.message,
        actorUserId: row.actorUserId,
        createdAt: row.createdAt.toISOString(),
      })),
      ...approvals.map(row => ({
        id: row.id,
        category: 'tool_approval' as const,
        organizationId: row.organizationId,
        organizationName: row.organization.companyName,
        action: row.status,
        reasonCode: row.toolExecution.toolName,
        message: row.toolExecution.riskClass,
        actorUserId: row.decidedByUserId,
        createdAt: row.createdAt.toISOString(),
      })),
      ...executions.map(row => ({
        id: row.id,
        category: 'tool_execution' as const,
        organizationId: row.organizationId,
        organizationName: row.organization.companyName,
        action: row.status,
        reasonCode: row.toolName,
        message: row.riskClass,
        actorUserId: null,
        createdAt: row.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);

    return { items: merged };
  }

  async getOrganizationWorkspace(orgId: string) {
    const [detail, billing, protection, accounts, numbers, jobs, deploymentDraft, deploymentDiff] =
      await Promise.all([
        this.assistantService.getAdminOrgDetail(orgId),
        this.billing.getMasterAdminOrgBilling(orgId).catch(() => null),
        this.protectionAudit.listByOrganization(orgId, 50),
        this.providerAccounts.listByOrganization(orgId),
        this.phoneNumbers.listByOrganization(orgId),
        this.provisioningJobs.listByOrganization(orgId),
        this.agentDeployment.getDraft(orgId).catch(() => null),
        this.agentDeployment.getDiff(orgId).catch(() => null),
      ]);

    const subscription = await this.subscriptionRepo.findActiveByOrganization(orgId);

    return {
      detail,
      subscription,
      billing,
      protectionAudit: protection,
      providerAccounts: accounts.map(a => ({
        id: a.id,
        provider: a.provider,
        status: a.status,
        maskedExternalRef: a.maskedExternalRef,
        region: a.region,
        updatedAt: a.updatedAt.toISOString(),
      })),
      phoneNumbers: numbers.map(n => ({
        id: n.id,
        maskedPhoneNumber: n.maskedPhoneNumber,
        status: n.lifecycle,
        region: n.region,
        regulatoryStatus: n.regulatoryStatus,
        elevenLabsAssigned: n.elevenLabsImportStatus === 'IMPORTED' || n.elevenLabsImportStatus === 'ASSIGNED',
      })),
      provisioningJobs: jobs.map(j => ({
        id: j.id,
        jobType: j.jobType,
        status: j.status,
        currentStep: j.currentStep,
        resumeStep: j.currentStep,
        lastError: j.errorMessage,
        updatedAt: j.updatedAt.toISOString(),
      })),
      agentDeployment: {
        draft: deploymentDraft,
        diff: deploymentDiff,
      },
    };
  }

  async suspendOrganization(params: {
    orgId: string;
    reason: string;
    actorUserId?: string;
    confirm?: boolean;
  }) {
    if (!params.confirm) {
      throw new BadRequestException('confirm=true is required to suspend organization voice services');
    }
    if (!params.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }

    const sub = await this.subscriptionRepo.findActiveByOrganization(params.orgId);
    if (!sub) {
      throw new NotFoundException('No active voice subscription for organization');
    }

    await this.subscriptions.suspendSubscription(params.orgId, sub.id);
    await this.protectionAudit.record({
      organizationId: params.orgId,
      action: 'ACTIVATION_BLOCKED',
      reasonCode: 'master_admin_suspend',
      message: params.reason.trim(),
      actorUserId: params.actorUserId,
    });

    return { suspended: true, subscriptionId: sub.id };
  }

  async replayWebhookEvent(params: {
    eventId: string;
    reason: string;
    actorUserId?: string;
    confirm?: boolean;
  }) {
    if (!params.confirm) {
      throw new BadRequestException('confirm=true is required to replay webhook events');
    }
    if (!params.reason?.trim()) {
      throw new BadRequestException('reason is required');
    }

    const event = await this.webhookEvents.findById(params.eventId);
    if (!event?.organizationId) {
      throw new NotFoundException('Voice webhook event not found');
    }

    const result = await this.webhookReplay.replayForOrganization(event.organizationId, params.eventId);
    await this.protectionAudit.record({
      organizationId: event.organizationId,
      action: 'OVERRIDE_CREATED',
      reasonCode: 'master_admin_replay',
      message: params.reason.trim(),
      actorUserId: params.actorUserId,
      metadata: { eventId: params.eventId },
    });

    return result;
  }

  async deployAgent(params: {
    orgId: string;
    actorUserId?: string;
    confirm?: boolean;
    idempotencyKey?: string;
  }) {
    return this.agentDeployment.deploy(params.orgId, {
      userId: params.actorUserId,
      confirm: params.confirm,
      idempotencyKey: params.idempotencyKey,
    });
  }

  async rollbackAgent(params: {
    orgId: string;
    actorUserId?: string;
    confirm?: boolean;
  }) {
    return this.agentDeployment.rollback(params.orgId, {
      userId: params.actorUserId,
      confirm: params.confirm,
    });
  }

  private async safeQueueCounts() {
    try {
      return await this.webhookQueue.getJobCounts('waiting', 'active', 'failed', 'delayed');
    } catch {
      return { waiting: 0, active: 0, failed: 0, delayed: 0 };
    }
  }

  private mapWebhookEvent(
    event: Prisma.VoiceProviderWebhookEventGetPayload<{
      include: { organization: { select: { companyName: true } } };
    }>,
  ): WebhookEventRow {
    const payload = event.redactedPayload as Record<string, unknown> | null;
    const diagnosticSummary =
      typeof payload?.summary === 'string'
        ? payload.summary
        : event.errorMessage ?? event.eventType ?? null;

    return {
      id: event.id,
      organizationId: event.organizationId,
      organizationName: event.organization?.companyName ?? null,
      provider: event.provider,
      eventType: event.eventType,
      status: event.status,
      receivedAt: event.receivedAt.toISOString(),
      processedAt: event.processedAt?.toISOString() ?? null,
      retryCount: event.retryCount,
      errorCode: event.errorCode,
      errorMessage: event.errorMessage,
      diagnosticSummary,
    };
  }
}
