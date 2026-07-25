import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  VoiceAgentDeploymentStatus,
  VoiceControlPlaneProvider,
  VoiceConversationDirection,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceCallOrchestrationService } from '@modules/voice-call-orchestration/voice-call-orchestration.service';
import { VoiceProtectionDeniedError } from '@modules/voice-protection/voice-protection-reason-codes';
import { resolveAllowedMcpToolsForAssistant } from '@modules/voice-call-orchestration/voice-mcp-tools.util';
import { SmsConsentService } from '@modules/sms/sms-consent.service';
import { normalizePhoneNumber, toE164Phone } from '@modules/whatsapp/utils/whatsapp-phone.util';
import type { WorkflowActionExecutionContext } from '../workflow-action-execution.context';
import type {
  VoiceCallStartActionConfig,
  WorkflowVoiceCallPlan,
  WorkflowVoiceCallPurpose,
  WorkflowVoiceCallStartResult,
  WorkflowVoicePostCallResult,
  WorkflowVoiceScenarioKey,
} from './workflow-action-adapter.types';
import { WorkflowVoiceCallCommunicationPolicyService } from './workflow-voice-call-communication-policy.service';
import { maskPhoneNumber } from './workflow-whatsapp-mask.util';
import { WORKFLOW_VOICE_SCENARIOS } from './workflow-voice-scenarios';

@Injectable()
export class WorkflowVoiceCallStartService {
  private readonly providerStartTimeoutMs = 30_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestration: VoiceCallOrchestrationService,
    private readonly communicationPolicy: WorkflowVoiceCallCommunicationPolicyService,
    private readonly smsConsent: SmsConsentService,
  ) {}

  buildIdempotencyKey(ctx: WorkflowActionExecutionContext): string {
    return `workflow:${ctx.organizationId}:${ctx.idempotencyKey}:action:${ctx.actionIndex}:voice`;
  }

  async findExistingConversation(orgId: string, idempotencyKey: string) {
    return this.prisma.voiceConversation.findFirst({
      where: {
        organizationId: orgId,
        direction: VoiceConversationDirection.OUTBOUND,
        metadata: {
          path: ['outboundIdempotencyKey'],
          equals: idempotencyKey,
        },
      },
      select: {
        id: true,
        elevenLabsConvId: true,
        twilioCallSid: true,
        callerNumber: true,
        lifecycleState: true,
        outcome: true,
        summary: true,
        metadata: true,
      },
    });
  }

  async buildCallPlan(
    config: VoiceCallStartActionConfig,
    ctx: WorkflowActionExecutionContext,
    options?: { allowExplicitPhone?: boolean },
  ): Promise<WorkflowVoiceCallPlan> {
    const scenario = this.resolveScenario(config);
    const resolved = await this.resolveRecipient(config, ctx, options?.allowExplicitPhone === true);
    const deployment = await this.resolveApprovedDeployment(ctx.organizationId, config.agentVersion);

    const assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    if (!assistant) {
      throw new NotFoundException('Voice assistant not configured');
    }

    const allowedTools = resolveAllowedMcpToolsForAssistant(assistant);
    const effectiveToolAllowlist = this.resolveToolAllowlist(
      scenario.allowedToolAllowlist,
      config.toolAllowlist,
      allowedTools,
    );

    const maxDurationSeconds = Math.min(
      config.maxDurationSeconds ?? scenario.maxDurationSeconds,
      scenario.maxDurationSeconds,
    );

    return {
      scenarioKey: config.scenarioKey,
      scenarioVersion: config.scenarioVersion,
      callPurpose: config.callPurpose,
      maskedRecipient: maskPhoneNumber(resolved.phoneE164),
      agentDeploymentId: deployment.id,
      agentVersion: deployment.version,
      maxDurationSeconds,
      aiTransparencyRequired: scenario.aiTransparencyRequired,
      toolAllowlist: effectiveToolAllowlist,
      emergencyEscalation: scenario.emergencyEscalation,
      dryRun: true,
    };
  }

  async start(
    config: VoiceCallStartActionConfig,
    ctx: WorkflowActionExecutionContext,
    options?: { allowExplicitPhone?: boolean; dryRun?: boolean },
  ): Promise<WorkflowVoiceCallStartResult> {
    const idempotencyKey = this.buildIdempotencyKey(ctx);
    const existing = await this.findExistingConversation(ctx.organizationId, idempotencyKey);
    if (existing) {
      return this.toStartResult(existing, idempotencyKey, true);
    }

    const scenario = this.resolveScenario(config);
    this.assertPurposeAllowed(config.callPurpose, scenario.allowedPurposes);
    this.assertNoTechnicalDiagnosis(config, scenario.prohibitTechnicalDiagnosis);

    const resolved = await this.resolveRecipient(config, ctx, options?.allowExplicitPhone === true);
    await this.assertContactConsent(ctx.organizationId, resolved.phoneNormalized, config.callPurpose);

    const policyResult = await this.communicationPolicy.evaluate({
      organizationId: ctx.organizationId,
      phoneNormalized: resolved.phoneNormalized,
      callPurpose: config.callPurpose,
      respectCallHours: config.respectCallHours,
    });
    if (!policyResult.allowed) {
      throw new BadRequestException(policyResult.reason ?? 'Voice communication policy blocked call');
    }

    const deployment = await this.resolveApprovedDeployment(ctx.organizationId, config.agentVersion);
    const assistant = await this.prisma.voiceAssistant.findUnique({
      where: { organizationId: ctx.organizationId },
    });
    if (!assistant) {
      throw new NotFoundException('Voice assistant not configured');
    }

    const allowedTools = resolveAllowedMcpToolsForAssistant(assistant);
    const effectiveToolAllowlist = this.resolveToolAllowlist(
      scenario.allowedToolAllowlist,
      config.toolAllowlist,
      allowedTools,
    );

    const maxDurationSeconds = Math.min(
      config.maxDurationSeconds ?? scenario.maxDurationSeconds,
      scenario.maxDurationSeconds,
    );

    if (options?.dryRun) {
      const plan = await this.buildCallPlan(config, ctx, options);
      return {
        conversationId: '',
        idempotencyKey,
        maskedRecipient: plan.maskedRecipient,
        duplicate: false,
        status: 'call_plan',
        dryRun: true,
        callPlan: plan,
        twilioCallSid: null,
        elevenLabsConversationId: null,
        agentDeploymentId: deployment.id,
        agentVersion: deployment.version,
        scenarioKey: config.scenarioKey,
        scenarioVersion: config.scenarioVersion,
        toolAllowlist: effectiveToolAllowlist,
        maxDurationSeconds,
      };
    }

    try {
      const result = await Promise.race([
        this.orchestration.orchestrateOutboundCall({
          organizationId: ctx.organizationId,
          toE164: resolved.phoneE164,
          idempotencyKey,
          customerId: resolved.customerId,
          bookingId: resolved.bookingId,
          initiatedByUserId: ctx.actor.kind === 'user' ? ctx.actor.id ?? null : null,
          workflowSource: {
            workflowRunId: ctx.workflowRunId,
            actionRunId: ctx.actionRunId,
            workflowId: ctx.workflowId,
            actionIndex: ctx.actionIndex,
            scenarioKey: config.scenarioKey,
            scenarioVersion: config.scenarioVersion,
            callPurpose: config.callPurpose,
            maxDurationSeconds,
            toolAllowlist: effectiveToolAllowlist,
            aiTransparencyRequired: scenario.aiTransparencyRequired,
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('VOICE_ORCHESTRATOR_TIMEOUT')), this.providerStartTimeoutMs),
        ),
      ]);

      const conversation = await this.prisma.voiceConversation.findUnique({
        where: { id: result.conversationId },
        select: {
          id: true,
          elevenLabsConvId: true,
          twilioCallSid: true,
          callerNumber: true,
          lifecycleState: true,
          outcome: true,
          summary: true,
          metadata: true,
        },
      });
      if (!conversation) {
        throw new ServiceUnavailableException('Voice orchestrator did not persist conversation');
      }

      return this.toStartResult(conversation, idempotencyKey, result.idempotentReplay);
    } catch (err: unknown) {
      if (err instanceof VoiceProtectionDeniedError) {
        throw new ForbiddenException(err.message);
      }
      if (err instanceof Error && err.message.includes('VOICE_ORCHESTRATOR_TIMEOUT')) {
        throw new ServiceUnavailableException('Voice orchestrator timed out while starting call');
      }
      if (err instanceof ForbiddenException || err instanceof NotFoundException) {
        throw new ServiceUnavailableException(
          err instanceof Error ? err.message : 'Voice orchestrator unavailable',
        );
      }
      throw err;
    }
  }

  async resolvePostCallResult(
    organizationId: string,
    conversationId: string,
  ): Promise<WorkflowVoicePostCallResult> {
    const conversation = await this.prisma.voiceConversation.findFirst({
      where: { id: conversationId, organizationId },
      select: {
        id: true,
        lifecycleState: true,
        outcome: true,
        summary: true,
        durationSeconds: true,
        escalationReason: true,
        metadata: true,
      },
    });
    if (!conversation) {
      throw new NotFoundException('Voice conversation not found');
    }

    return {
      conversationId: conversation.id,
      lifecycleState: conversation.lifecycleState,
      outcome: conversation.outcome,
      resultSummary: conversation.summary ?? null,
      durationSeconds: conversation.durationSeconds,
      escalated: conversation.outcome === 'ESCALATED',
      escalationReason: conversation.escalationReason,
      transcriptStored: false,
    };
  }

  private resolveScenario(config: VoiceCallStartActionConfig) {
    const scenario = WORKFLOW_VOICE_SCENARIOS[config.scenarioKey as WorkflowVoiceScenarioKey];
    if (!scenario) {
      throw new BadRequestException(`Unknown voice scenario: ${config.scenarioKey}`);
    }
    if (scenario.version !== config.scenarioVersion) {
      throw new BadRequestException(
        `Scenario version mismatch: expected ${scenario.version}, got ${config.scenarioVersion}`,
      );
    }
    return scenario;
  }

  private assertPurposeAllowed(
    purpose: WorkflowVoiceCallPurpose,
    allowed: WorkflowVoiceCallPurpose[],
  ): void {
    if (!allowed.includes(purpose)) {
      throw new BadRequestException(`Call purpose "${purpose}" is not allowed for this scenario`);
    }
  }

  private assertNoTechnicalDiagnosis(
    config: VoiceCallStartActionConfig,
    prohibitTechnicalDiagnosis: boolean,
  ): void {
    if (!prohibitTechnicalDiagnosis) return;
    if (config.includeTechnicalDiagnosis) {
      throw new BadRequestException(
        'Automatic technical diagnosis is not permitted for workflow voice calls',
      );
    }
    if ((config.sensitiveFlags ?? []).some((flag) => /diagnos|dtc|fault/i.test(flag))) {
      throw new BadRequestException(
        'Sensitive diagnostic flags require human escalation — workflow voice cannot auto-diagnose',
      );
    }
  }

  private async resolveApprovedDeployment(organizationId: string, requestedVersion?: number) {
    const deployment = await this.prisma.voiceAgentDeployment.findFirst({
      where: {
        organizationId,
        status: VoiceAgentDeploymentStatus.ACTIVE,
        provider: VoiceControlPlaneProvider.ELEVENLABS,
        archivedAt: null,
        ...(requestedVersion != null ? { version: requestedVersion } : {}),
      },
      orderBy: { version: 'desc' },
      select: { id: true, version: true },
    });
    if (!deployment) {
      throw new BadRequestException('No approved active ElevenLabs agent deployment for organization');
    }
    if (requestedVersion != null && deployment.version !== requestedVersion) {
      throw new BadRequestException(`Agent version ${requestedVersion} is not the active deployment`);
    }
    return deployment;
  }

  private resolveToolAllowlist(
    scenarioTools: string[],
    requestedTools: string[] | undefined,
    assistantAllowed: string[],
  ): string[] {
    const base = requestedTools?.length
      ? requestedTools.filter((tool) => scenarioTools.includes(tool))
      : scenarioTools;
    return base.filter((tool) => assistantAllowed.includes(tool));
  }

  private async assertContactConsent(
    orgId: string,
    phoneNormalized: string,
    purpose: WorkflowVoiceCallPurpose,
  ): Promise<void> {
    if (purpose === 'emergency') {
      return;
    }
    await this.smsConsent.assertCanSend(orgId, phoneNormalized, purpose === 'collections' ? 'marketing' : 'transactional');
  }

  private async resolveRecipient(
    config: VoiceCallStartActionConfig,
    ctx: WorkflowActionExecutionContext,
    allowExplicitPhone: boolean,
  ): Promise<{ phoneE164: string; phoneNormalized: string; customerId?: string; bookingId?: string }> {
    if (config.toPhone) {
      if (!allowExplicitPhone) {
        throw new ForbiddenException('Explicit toPhone requires WORKFLOW_CUSTOMER_CONTACT permission');
      }
      const normalized = normalizePhoneNumber(config.toPhone);
      if (!normalized) throw new BadRequestException('Invalid explicit phone number');
      const e164 = toE164Phone(normalized);
      if (!e164) throw new BadRequestException('Invalid explicit phone number');
      return { phoneE164: e164, phoneNormalized: normalized };
    }

    const recipient = config.recipient;
    if (recipient.type === 'customer') {
      const customer = await this.prisma.customer.findFirst({
        where: { id: recipient.customerId, organizationId: ctx.organizationId },
        select: { id: true, phone: true },
      });
      if (!customer?.phone) throw new NotFoundException('Customer phone not found');
      const normalized = normalizePhoneNumber(customer.phone);
      if (!normalized) throw new BadRequestException('Customer phone is not valid E.164');
      const e164 = toE164Phone(normalized);
      if (!e164) throw new BadRequestException('Customer phone is not valid E.164');
      return { phoneE164: e164, phoneNormalized: normalized, customerId: customer.id };
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: recipient.bookingId, organizationId: ctx.organizationId },
      select: {
        id: true,
        customerId: true,
        customer: { select: { id: true, phone: true } },
      },
    });
    if (!booking?.customer?.phone) throw new NotFoundException('Booking customer phone not found');
    const normalized = normalizePhoneNumber(booking.customer.phone);
    if (!normalized) throw new BadRequestException('Booking customer phone is not valid E.164');
    const e164 = toE164Phone(normalized);
    if (!e164) throw new BadRequestException('Booking customer phone is not valid E.164');
    return {
      phoneE164: e164,
      phoneNormalized: normalized,
      customerId: booking.customer.id,
      bookingId: booking.id,
    };
  }

  private toStartResult(
    row: {
      id: string;
      elevenLabsConvId: string | null;
      twilioCallSid: string | null;
      callerNumber: string | null;
      lifecycleState: string;
      outcome: string;
      summary: string | null;
      metadata: unknown;
    },
    idempotencyKey: string,
    duplicate: boolean,
  ): WorkflowVoiceCallStartResult {
    const meta = (row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata))
      ? row.metadata as Record<string, unknown>
      : {};

    return {
      conversationId: row.id,
      idempotencyKey,
      maskedRecipient: maskPhoneNumber(row.callerNumber ?? ''),
      duplicate,
      status: duplicate ? 'already_requested' : String(meta.dryRun === true ? 'dry_run' : 'started'),
      dryRun: meta.dryRun === true,
      twilioCallSid: row.twilioCallSid,
      elevenLabsConversationId: row.elevenLabsConvId,
      agentDeploymentId: typeof meta.agentDeploymentId === 'string' ? meta.agentDeploymentId : null,
      agentVersion: null,
      scenarioKey: typeof meta.workflowScenarioKey === 'string' ? meta.workflowScenarioKey : null,
      scenarioVersion:
        typeof meta.workflowScenarioVersion === 'string' ? meta.workflowScenarioVersion : null,
      toolAllowlist: Array.isArray(meta.workflowToolAllowlist)
        ? meta.workflowToolAllowlist.map(String)
        : [],
      maxDurationSeconds:
        typeof meta.workflowMaxDurationSeconds === 'number'
          ? meta.workflowMaxDurationSeconds
          : null,
    };
  }
}
