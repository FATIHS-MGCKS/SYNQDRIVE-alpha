import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WorkflowRuntimeRolloutStage } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { WorkflowAuditService } from '../audit/workflow-audit.service';
import { WORKFLOW_MAKER_CHECKER_TTL_MS } from '../maker-checker/workflow-maker-checker.constants';
import {
  isRolloutStageAtLeast,
  requiresMakerCheckerForStage,
  type WorkflowRuntimeEffectiveFlags,
} from './workflow-runtime-rollout.contract';
import {
  isExternalWorkflowAction,
  isInternalWorkflowAction,
  resolveActionChannelFlag,
} from './workflow-runtime-rollout-action.util';
import {
  mapOrgRow,
  readGlobalRolloutConfig,
  resolveEffectiveRolloutFlags,
} from './workflow-runtime-rollout.resolver';
import { WorkflowRuntimeRolloutGatesService } from './workflow-runtime-rollout-gates.service';

const ORG_CACHE_TTL_MS = 30_000;

@Injectable()
export class WorkflowRuntimeRolloutService {
  private readonly orgCache = new Map<string, { at: number; row: ReturnType<typeof mapOrgRow> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: WorkflowAuditService,
    private readonly gates: WorkflowRuntimeRolloutGatesService,
  ) {}

  async resolveEffectiveFlags(
    organizationId: string,
    workflowId?: string,
  ): Promise<WorkflowRuntimeEffectiveFlags> {
    const global = readGlobalRolloutConfig(this.config);
    const org = await this.getOrgSettingsCached(organizationId);
    return resolveEffectiveRolloutFlags({ organizationId, workflowId, global, org });
  }

  async canExecuteLiveAction(
    organizationId: string,
    actionType: string,
    workflowId?: string,
  ): Promise<{ allowed: boolean; reasons: string[] }> {
    const flags = await this.resolveEffectiveFlags(organizationId, workflowId);
    const reasons: string[] = [];

    if (flags.killSwitchActive) {
      reasons.push(...flags.killSwitchReasons);
    }

    const global = readGlobalRolloutConfig(this.config);
    const org = await this.getOrgSettingsCached(organizationId);
    const channel = resolveActionChannelFlag(actionType);

    if (global.killActionTypes.has(actionType.toLowerCase())) {
      reasons.push(`action_type_kill_switch:${actionType}`);
    }
    if (global.killSwitchEmail && channel === 'email') reasons.push('provider_kill_switch:email');
    if (global.killSwitchWhatsapp && channel === 'whatsapp') reasons.push('provider_kill_switch:whatsapp');
    if (global.killSwitchSms && channel === 'sms') reasons.push('provider_kill_switch:sms');
    if (global.killSwitchVoice && channel === 'voice') reasons.push('provider_kill_switch:voice');
    if (global.killSwitchAi && channel === 'ai') reasons.push('provider_kill_switch:ai');
    if (global.killSwitchCritical && channel === 'critical') reasons.push('provider_kill_switch:critical');

    if (org.killSwitchEmail && channel === 'email') reasons.push('org_kill_switch:email');
    if (org.killSwitchWhatsapp && channel === 'whatsapp') reasons.push('org_kill_switch:whatsapp');
    if (org.killSwitchSms && channel === 'sms') reasons.push('org_kill_switch:sms');
    if (org.killSwitchVoice && channel === 'voice') reasons.push('org_kill_switch:voice');
    if (org.killSwitchAi && channel === 'ai') reasons.push('org_kill_switch:ai');
    if (org.killSwitchCritical && channel === 'critical') reasons.push('org_kill_switch:critical');

    if (!flags.runLiveEngine) {
      reasons.push('live_engine_not_enabled_for_stage');
    }

    if (isInternalWorkflowAction(actionType)) {
      if (!isRolloutStageAtLeast(flags.effectiveStage, 'INTERNAL_ACTIONS_ONLY')) {
        reasons.push('internal_actions_not_enabled');
      }
    } else if (isExternalWorkflowAction(actionType)) {
      const channelAllowed =
        (channel === 'email' && flags.channelEmail)
        || (channel === 'whatsapp' && flags.channelWhatsapp)
        || (channel === 'sms' && flags.channelSms)
        || (channel === 'voice' && flags.channelVoice)
        || (channel === 'ai' && flags.channelAi)
        || (channel === 'critical' && flags.criticalActions);
      if (!channelAllowed) {
        reasons.push(`channel_not_enabled:${channel ?? 'external'}`);
      }
      if (!isRolloutStageAtLeast(flags.effectiveStage, 'EXTERNAL_COMMUNICATIONS_WITH_APPROVAL')) {
        reasons.push('external_communications_stage_not_reached');
      }
    }

    return { allowed: reasons.length === 0, reasons };
  }

  async resolveBridgeExecutionPath(
    organizationId: string,
    workflowId?: string,
  ): Promise<WorkflowRuntimeEffectiveFlags['executionPath']> {
    const flags = await this.resolveEffectiveFlags(organizationId, workflowId);
    return flags.executionPath;
  }

  async getOrgSettings(organizationId: string) {
    const row = await this.prisma.orgWorkflowRuntimeRolloutSettings.findUnique({
      where: { organizationId },
    });
    const org = mapOrgRow(row);
    const flags = await this.resolveEffectiveFlags(organizationId);
    return {
      organizationId,
      ...org,
      effectiveStage: flags.effectiveStage,
      globalStage: flags.globalStage,
      executionPath: flags.executionPath,
      killSwitchActive: flags.killSwitchActive,
      monitoringLinked: flags.monitoringLinked,
      updatedAt: row?.updatedAt?.toISOString() ?? null,
    };
  }

  async updateOrgSettings(
    organizationId: string,
    dto: Partial<{
      stage: WorkflowRuntimeRolloutStage;
      workflowAllowlist: string[];
      channelEmailEnabled: boolean;
      channelWhatsappEnabled: boolean;
      channelSmsEnabled: boolean;
      channelVoiceEnabled: boolean;
      channelAiEnabled: boolean;
      criticalActionsEnabled: boolean;
      monitoringAcknowledged: boolean;
    }>,
    actor?: { userId?: string; userName?: string },
  ) {
    if (dto.stage && requiresMakerCheckerForStage(dto.stage)) {
      throw new BadRequestException(
        'Stage promotion to EXTERNAL_COMMUNICATIONS_WITH_APPROVAL or GENERAL_AVAILABILITY requires maker-checker approval request',
      );
    }

    const existing = await this.prisma.orgWorkflowRuntimeRolloutSettings.findUnique({
      where: { organizationId },
    });
    const previousStage = existing?.stage ?? 'DISABLED';

    const row = await this.prisma.orgWorkflowRuntimeRolloutSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        stage: dto.stage ?? 'DISABLED',
        workflowAllowlist: dto.workflowAllowlist ?? [],
        channelEmailEnabled: dto.channelEmailEnabled ?? false,
        channelWhatsappEnabled: dto.channelWhatsappEnabled ?? false,
        channelSmsEnabled: dto.channelSmsEnabled ?? false,
        channelVoiceEnabled: dto.channelVoiceEnabled ?? false,
        channelAiEnabled: dto.channelAiEnabled ?? false,
        criticalActionsEnabled: dto.criticalActionsEnabled ?? false,
        monitoringAcknowledged: dto.monitoringAcknowledged ?? false,
        updatedByUserId: actor?.userId ?? null,
      },
      update: {
        ...(dto.stage !== undefined ? { stage: dto.stage } : {}),
        ...(dto.workflowAllowlist !== undefined ? { workflowAllowlist: dto.workflowAllowlist } : {}),
        ...(dto.channelEmailEnabled !== undefined
          ? { channelEmailEnabled: dto.channelEmailEnabled }
          : {}),
        ...(dto.channelWhatsappEnabled !== undefined
          ? { channelWhatsappEnabled: dto.channelWhatsappEnabled }
          : {}),
        ...(dto.channelSmsEnabled !== undefined ? { channelSmsEnabled: dto.channelSmsEnabled } : {}),
        ...(dto.channelVoiceEnabled !== undefined
          ? { channelVoiceEnabled: dto.channelVoiceEnabled }
          : {}),
        ...(dto.channelAiEnabled !== undefined ? { channelAiEnabled: dto.channelAiEnabled } : {}),
        ...(dto.criticalActionsEnabled !== undefined
          ? { criticalActionsEnabled: dto.criticalActionsEnabled }
          : {}),
        ...(dto.monitoringAcknowledged !== undefined
          ? { monitoringAcknowledged: dto.monitoringAcknowledged }
          : {}),
        updatedByUserId: actor?.userId ?? null,
      },
    });

    this.orgCache.delete(organizationId);

    if (dto.stage && dto.stage !== previousStage) {
      await this.audit.record({
        orgId: organizationId,
        workflowId: null,
        eventType: 'WORKFLOW_ROLLOUT_STAGE_CHANGED',
        actorUserId: actor?.userId ?? null,
        summary: `Rollout stage changed ${previousStage} → ${dto.stage}`,
        payload: {
          previousStage,
          nextStage: dto.stage,
          source: 'direct_update',
          actorName: actor?.userName ?? null,
        },
      });
    }

    return this.getOrgSettings(organizationId);
  }

  async requestStagePromotion(
    organizationId: string,
    requestedStage: WorkflowRuntimeRolloutStage,
    reason: string,
    actor?: { userId?: string; userName?: string },
  ) {
    if (!requiresMakerCheckerForStage(requestedStage)) {
      return this.updateOrgSettings(organizationId, { stage: requestedStage }, actor);
    }

    const gateResult = await this.gates.evaluate(organizationId);
    if (gateResult.status !== 'PASS') {
      throw new ForbiddenException({
        message: 'Pre-deployment gates not satisfied',
        gates: gateResult.gates.filter((g) => !g.passed),
      });
    }

    await this.prisma.orgWorkflowRuntimeRolloutSettings.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });

    const existing = await this.prisma.orgWorkflowRuntimeRolloutSettings.findUnique({
      where: { organizationId },
    });
    const previousStage = existing?.stage ?? 'DISABLED';

    const request = await this.prisma.workflowRuntimeRolloutChangeRequest.create({
      data: {
        organizationId,
        requestedStage,
        previousStage,
        reason,
        requestedByUserId: actor?.userId ?? null,
        requestedByName: actor?.userName ?? null,
        expiresAt: new Date(Date.now() + WORKFLOW_MAKER_CHECKER_TTL_MS),
        payload: { gateResult: gateResult as unknown as Prisma.InputJsonValue },
      },
    });

    return { requestId: request.id, status: request.status, expiresAt: request.expiresAt.toISOString() };
  }

  async decideStagePromotion(
    organizationId: string,
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    actor?: { userId?: string; userName?: string },
  ) {
    const request = await this.prisma.workflowRuntimeRolloutChangeRequest.findFirst({
      where: { id: requestId, organizationId },
    });
    if (!request) throw new NotFoundException('Rollout change request not found');
    if (request.status !== 'PENDING') {
      throw new BadRequestException(`Request already ${request.status}`);
    }
    if (request.expiresAt.getTime() < Date.now()) {
      await this.prisma.workflowRuntimeRolloutChangeRequest.update({
        where: { id: requestId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Rollout change request expired');
    }

    if (decision === 'REJECTED') {
      await this.prisma.workflowRuntimeRolloutChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          decidedByUserId: actor?.userId ?? null,
          decidedByName: actor?.userName ?? null,
          decidedAt: new Date(),
        },
      });
      return { requestId, status: 'REJECTED' as const };
    }

    await this.prisma.$transaction([
      this.prisma.workflowRuntimeRolloutChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          decidedByUserId: actor?.userId ?? null,
          decidedByName: actor?.userName ?? null,
          decidedAt: new Date(),
        },
      }),
      this.prisma.orgWorkflowRuntimeRolloutSettings.update({
        where: { organizationId },
        data: {
          stage: request.requestedStage,
          updatedByUserId: actor?.userId ?? null,
        },
      }),
    ]);

    this.orgCache.delete(organizationId);

    await this.audit.record({
      orgId: organizationId,
      workflowId: null,
      eventType: 'WORKFLOW_ROLLOUT_STAGE_CHANGED',
      actorUserId: actor?.userId ?? null,
      summary: `Rollout stage promoted ${request.previousStage} → ${request.requestedStage}`,
      payload: {
        previousStage: request.previousStage,
        nextStage: request.requestedStage,
        source: 'maker_checker_approval',
        requestId,
        actorName: actor?.userName ?? null,
      },
    });

    return { requestId, status: 'APPROVED' as const, stage: request.requestedStage };
  }

  async setKillSwitch(
    organizationId: string,
    input: {
      enabled: boolean;
      email?: boolean;
      whatsapp?: boolean;
      sms?: boolean;
      voice?: boolean;
      ai?: boolean;
      critical?: boolean;
    },
    actor?: { userId?: string; userName?: string },
  ) {
    const row = await this.prisma.orgWorkflowRuntimeRolloutSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        killSwitchEnabled: input.enabled,
        killSwitchEmail: input.email ?? false,
        killSwitchWhatsapp: input.whatsapp ?? false,
        killSwitchSms: input.sms ?? false,
        killSwitchVoice: input.voice ?? false,
        killSwitchAi: input.ai ?? false,
        killSwitchCritical: input.critical ?? false,
        updatedByUserId: actor?.userId ?? null,
      },
      update: {
        killSwitchEnabled: input.enabled,
        ...(input.email !== undefined ? { killSwitchEmail: input.email } : {}),
        ...(input.whatsapp !== undefined ? { killSwitchWhatsapp: input.whatsapp } : {}),
        ...(input.sms !== undefined ? { killSwitchSms: input.sms } : {}),
        ...(input.voice !== undefined ? { killSwitchVoice: input.voice } : {}),
        ...(input.ai !== undefined ? { killSwitchAi: input.ai } : {}),
        ...(input.critical !== undefined ? { killSwitchCritical: input.critical } : {}),
        updatedByUserId: actor?.userId ?? null,
      },
    });

    this.orgCache.delete(organizationId);

    await this.audit.record({
      orgId: organizationId,
      workflowId: null,
      eventType: 'WORKFLOW_KILL_SWITCH_TOGGLED',
      actorUserId: actor?.userId ?? null,
      summary: `Workflow kill switch ${input.enabled ? 'enabled' : 'disabled'}`,
      payload: {
        enabled: input.enabled,
        channels: {
          email: row.killSwitchEmail,
          whatsapp: row.killSwitchWhatsapp,
          sms: row.killSwitchSms,
          voice: row.killSwitchVoice,
          ai: row.killSwitchAi,
          critical: row.killSwitchCritical,
        },
        note: 'In-flight workflow runs continue; new actions are blocked',
        actorName: actor?.userName ?? null,
      },
    });

    return this.getOrgSettings(organizationId);
  }

  async getEffectiveFlagsApi(organizationId: string, workflowId?: string) {
    return this.resolveEffectiveFlags(organizationId, workflowId);
  }

  evaluatePreDeploymentGates(organizationId: string) {
    return this.gates.evaluate(organizationId);
  }

  private async getOrgSettingsCached(organizationId: string) {
    const cached = this.orgCache.get(organizationId);
    const now = Date.now();
    if (cached && now - cached.at < ORG_CACHE_TTL_MS) {
      return cached.row;
    }
    const row = await this.prisma.orgWorkflowRuntimeRolloutSettings.findUnique({
      where: { organizationId },
    });
    const mapped = mapOrgRow(row);
    this.orgCache.set(organizationId, { at: now, row: mapped });
    return mapped;
  }

  invalidateOrgCache(organizationId: string): void {
    this.orgCache.delete(organizationId);
  }
}
