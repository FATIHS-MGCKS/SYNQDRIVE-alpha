import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntity,
  VoiceAgentDeploymentStatus,
  VoiceControlPlaneProvider,
  VoiceProvisioningErrorClass,
  VoiceProvisioningJobStatus,
  VoiceProvisioningJobType,
} from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { ElevenLabsProviderAdapter } from '../elevenlabs-provider/elevenlabs-provider.adapter';
import { ElevenLabsProviderError, ElevenLabsProviderErrorCode } from '../elevenlabs-provider/elevenlabs-provider.errors';
import { maskExternalId, sanitizeElevenLabsLogMessage } from '../elevenlabs-provider/elevenlabs-provider.redaction';
import type { VoicePermissionMode } from '../voice-assistant-permissions';
import {
  VoiceAgentDeploymentRepository,
  VoiceProvisioningJobRepository,
} from '../control-plane/voice-control-plane.repository';
import {
  buildCanonicalAgentConfigFromAssistant,
  buildProviderSystemPrompt,
  mergeCanonicalAgentConfig,
  parseCanonicalAgentConfigSnapshot,
} from './agent-config.builder';
import { hashCanonicalAgentConfig } from './agent-config.hash';
import {
  rejectProviderPayloadKeys,
  validateCanonicalAgentConfig,
} from './agent-config.validation';
import type {
  AgentDeploymentDraftView,
  AgentDeploymentDiffView,
  AgentDeploymentResultView,
  AgentDeploymentRollbackView,
  CanonicalAgentConfig,
  CanonicalAgentConfigPatch,
} from './agent-config.types';
import { AgentDeploymentDiffService } from './agent-deployment-diff.service';
import { AgentDeploymentReadinessService } from './agent-deployment-readiness.service';
import { isAgentDeploymentStagingEnabled } from './agent-deployment.config';
import { buildCanonicalElevenLabsPostCallWebhookUrl } from './agent-post-call.config';
import { buildCanonicalVoiceMcpGatewayUrl } from '@modules/voice-mcp-gateway/voice-mcp-canonical-url';
import { isVoiceMcpGatewayFeatureEnabled } from '@modules/voice-call-orchestration/voice-feature-flags.config';
import { validateTransferConfig } from './agent-transfer.validation';
import type { SaveAgentDeploymentDraftDto } from './dto/agent-deployment.dto';
import type { AgentDeploymentReadinessView } from './agent-config.types';

type ActorContext = {
  userId?: string;
  idempotencyKey?: string;
  confirm?: boolean;
};

@Injectable()
export class AgentDeploymentService {
  private readonly logger = new Logger(AgentDeploymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly deploymentRepository: VoiceAgentDeploymentRepository,
    private readonly provisioningJobRepository: VoiceProvisioningJobRepository,
    private readonly elevenLabs: ElevenLabsProviderAdapter,
    private readonly diffService: AgentDeploymentDiffService,
    private readonly readinessService: AgentDeploymentReadinessService,
    private readonly audit: AuditService,
  ) {}

  async getDraft(organizationId: string): Promise<AgentDeploymentDraftView> {
    const assistant = await this.requireAssistant(organizationId);
    const draft = await this.ensureDraftDeployment(organizationId, assistant.id, assistant);
    const config = this.readDeploymentConfig(draft.configSnapshot, assistant);
    return this.toDraftView(draft.id, assistant.id, config, draft.configHash ?? '', draft.updatedAt);
  }

  async saveDraft(
    organizationId: string,
    body: SaveAgentDeploymentDraftDto,
    actor?: ActorContext,
  ): Promise<AgentDeploymentDraftView> {
    this.assertStagingEnabled();
    const assistant = await this.requireAssistant(organizationId);
    const draft = await this.ensureDraftDeployment(organizationId, assistant.id, assistant);
    const currentConfig = this.readDeploymentConfig(draft.configSnapshot, assistant);

    const patch = this.dtoToPatch(body);
    rejectProviderPayloadKeys(patch);
    const merged = mergeCanonicalAgentConfig(currentConfig, patch, organizationId);
    validateCanonicalAgentConfig(merged, { forDeploy: false });
    await validateTransferConfig(this.prisma, organizationId, merged);

    const configHash = hashCanonicalAgentConfig(merged);
    const expectedUpdatedAt = body.expectedUpdatedAt ? new Date(body.expectedUpdatedAt) : undefined;

    const updated = await this.deploymentRepository.update(
      organizationId,
      draft.id,
      {
        configSnapshot: merged,
        configHash,
        updatedByUserId: actor?.userId ?? null,
      },
      expectedUpdatedAt ? { expectedUpdatedAt } : undefined,
    );

    void this.audit.record({
      actorUserId: actor?.userId,
      actorOrganizationId: organizationId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.ADMIN_OPERATION,
      entityId: updated.id,
      description: 'Voice agent deployment draft updated.',
      changeSummary: `configHash=${configHash.slice(0, 12)}`,
    });

    return this.toDraftView(
      updated.id,
      assistant.id,
      merged,
      configHash,
      updated.updatedAt,
    );
  }

  async getReadiness(organizationId: string): Promise<AgentDeploymentReadinessView> {
    const assistant = await this.requireAssistant(organizationId);
    const draft = await this.ensureDraftDeployment(organizationId, assistant.id, assistant);
    const config = this.readDeploymentConfig(draft.configSnapshot, assistant);
    return this.readinessService.evaluate(organizationId, config, { forDeploy: true });
  }

  async getDiff(organizationId: string): Promise<AgentDeploymentDiffView> {
    const assistant = await this.requireAssistant(organizationId);
    const draft = await this.ensureDraftDeployment(organizationId, assistant.id, assistant);
    const draftConfig = this.readDeploymentConfig(draft.configSnapshot, assistant);
    const active = await this.deploymentRepository.findActiveByAssistant(organizationId, assistant.id);
    const activeConfig = active
      ? this.readDeploymentConfig(active.configSnapshot, assistant)
      : null;

    return this.diffService.buildDiff({
      draft: draftConfig,
      draftDeploymentId: draft.id,
      activeConfig,
      activeVersion: active?.version ?? null,
    });
  }

  async deploy(
    organizationId: string,
    actor: ActorContext,
  ): Promise<AgentDeploymentResultView> {
    this.assertStagingEnabled();
    if (!actor.confirm) {
      throw new BadRequestException('Deployment requires confirm=true.');
    }
    if (!actor.idempotencyKey?.trim()) {
      throw new BadRequestException('Idempotency-Key header is required for deployment.');
    }

    const assistant = await this.requireAssistant(organizationId);
    const draft = await this.ensureDraftDeployment(organizationId, assistant.id, assistant);
    const config = this.readDeploymentConfig(draft.configSnapshot, assistant);
    validateCanonicalAgentConfig(config, { forDeploy: true });
    await validateTransferConfig(this.prisma, organizationId, config);
    const readiness = await this.readinessService.evaluate(organizationId, config, {
      forDeploy: true,
    });
    if (!readiness.ready) {
      throw new BadRequestException({
        message: 'Voice agent deployment is not ready.',
        blockers: readiness.blockers,
        warnings: readiness.warnings,
      });
    }
    const configHash = hashCanonicalAgentConfig(config);

    const idempotencyKey = `agent-deploy:${actor.idempotencyKey.trim()}`;
    const { job, created } = await this.provisioningJobRepository.persistOrGet({
      organizationId,
      jobType: VoiceProvisioningJobType.ELEVENLABS_AGENT_UPDATE,
      idempotencyKey,
      voiceAssistantId: assistant.id,
      deploymentId: draft.id,
      createdByUserId: actor.userId,
      payload: {
        configHash,
        draftDeploymentId: draft.id,
      },
    });

    if (!created && job.deploymentId && job.status === VoiceProvisioningJobStatus.COMPLETED) {
      const existing = await this.deploymentRepository.findById(organizationId, job.deploymentId);
      if (existing) {
        return {
          deploymentId: existing.id,
          version: existing.version,
          status: existing.status,
          configHash: existing.configHash ?? configHash,
          maskedExternalRef: existing.maskedExternalRef,
          jobId: job.id,
          idempotentReplay: true,
        };
      }
    }

    if (!created && job.status === VoiceProvisioningJobStatus.IN_PROGRESS) {
      throw new ConflictException('Agent deployment is already in progress for this organization.');
    }

    const inFlight = await this.deploymentRepository.findProvisioningForOrganization(organizationId);
    if (inFlight && inFlight.id !== job.deploymentId) {
      throw new ConflictException('Another agent deployment is already provisioning for this organization.');
    }

    const active = await this.deploymentRepository.findActiveByAssistant(organizationId, assistant.id);
    const nextVersion = await this.deploymentRepository.getNextVersion(organizationId, assistant.id);

    let targetDeployment = inFlight;
    if (!targetDeployment || targetDeployment.voiceAssistantId !== assistant.id) {
      targetDeployment = await this.deploymentRepository.create({
        organizationId,
        voiceAssistantId: assistant.id,
        provider: VoiceControlPlaneProvider.ELEVENLABS,
        version: nextVersion,
        status: VoiceAgentDeploymentStatus.PROVISIONING,
        configHash,
        configSnapshot: config,
        previousVersion: active?.version ?? null,
        createdByUserId: actor.userId,
      });
    }

    await this.provisioningJobRepository.updateProgress(organizationId, job.id, {
      status: VoiceProvisioningJobStatus.IN_PROGRESS,
      currentStep: 'provider_update',
      progressPct: 20,
      deploymentId: targetDeployment.id,
      startedAt: new Date(),
    });

    try {
      const providerResult = await this.applyProviderUpdate(
        organizationId,
        targetDeployment.id,
        config,
        active,
        assistant.elevenLabsAgentId,
      );

      const verified = await this.verifyProviderDeployment(organizationId, targetDeployment.id, config);
      await this.applyPostCallConfiguration(organizationId, targetDeployment.id, config);
      await this.applyMcpGatewayConfiguration(organizationId, targetDeployment.id);

      const activated = await this.prisma.$transaction(async (tx) => {
        await tx.voiceAgentDeployment.updateMany({
          where: {
            organizationId,
            voiceAssistantId: assistant.id,
            status: VoiceAgentDeploymentStatus.ACTIVE,
            id: { not: targetDeployment!.id },
            archivedAt: null,
          },
          data: { status: VoiceAgentDeploymentStatus.SUPERSEDED },
        });

        const row = await tx.voiceAgentDeployment.update({
          where: { id: targetDeployment!.id },
          data: {
            status: VoiceAgentDeploymentStatus.ACTIVE,
            configHash,
            configSnapshot: config,
            maskedExternalRef: providerResult.maskedExternalRef,
            protectedExternalRef: providerResult.externalAgentId,
            activatedVersion: targetDeployment!.version,
            previousVersion: active?.version ?? null,
            provisionedAt: new Date(),
            failedAt: null,
            updatedByUserId: actor.userId,
          },
        });

        await tx.voiceAssistant.update({
          where: { id: assistant.id },
          data: {
            elevenLabsAgentId: providerResult.externalAgentId,
            name: config.assistantName,
            systemPrompt: config.systemPrompt,
            companyContext: config.companyContext,
            businessRules: config.businessRules,
            forbiddenActions: config.forbiddenActions,
            greetingMessage: config.greeting,
            voiceId: config.voiceId,
            voiceName: config.voiceName,
            language: config.language,
            lastProvisionedAt: new Date(),
          },
        });

        return row;
      });

      await this.provisioningJobRepository.updateProgress(organizationId, job.id, {
        status: VoiceProvisioningJobStatus.COMPLETED,
        currentStep: 'verified',
        progressPct: 100,
        deploymentId: activated.id,
        completedAt: new Date(),
        payload: {
          configHash,
          verifiedAgentName: verified.name ?? config.assistantName,
        },
      });

      void this.audit.record({
        actorUserId: actor.userId,
        actorOrganizationId: organizationId,
        action: ActivityAction.ADMIN_OVERRIDE,
        entity: ActivityEntity.ADMIN_OPERATION,
        entityId: activated.id,
        description: `Voice agent deployment v${activated.version} activated.`,
        changeSummary: `configHash=${configHash.slice(0, 12)}`,
        metaJson: {
          version: activated.version,
          maskedExternalRef: activated.maskedExternalRef,
        },
      });

      return {
        deploymentId: activated.id,
        version: activated.version,
        status: activated.status,
        configHash,
        maskedExternalRef: activated.maskedExternalRef,
        jobId: job.id,
        idempotentReplay: false,
      };
    } catch (err: unknown) {
      const message = sanitizeElevenLabsLogMessage(
        err instanceof Error ? err.message : 'Agent deployment failed.',
      );
      this.logger.error(`Agent deployment failed for org ${organizationId}: ${message}`);

      await this.deploymentRepository.update(organizationId, targetDeployment.id, {
        status: VoiceAgentDeploymentStatus.FAILED,
        failedAt: new Date(),
      });

      await this.provisioningJobRepository.updateProgress(organizationId, job.id, {
        status: VoiceProvisioningJobStatus.FAILED,
        currentStep: 'provider_update',
        progressPct: 100,
        errorClass: this.mapProviderErrorClass(err),
        errorMessage: message,
        failedAt: new Date(),
        deploymentId: targetDeployment.id,
      });

      throw err;
    }
  }

  async rollback(
    organizationId: string,
    actor: ActorContext,
  ): Promise<AgentDeploymentRollbackView> {
    this.assertStagingEnabled();
    if (!actor.confirm) {
      throw new BadRequestException('Rollback requires confirm=true.');
    }

    const assistant = await this.requireAssistant(organizationId);
    const active = await this.deploymentRepository.findActiveByAssistant(organizationId, assistant.id);
    if (!active) {
      throw new BadRequestException('No active agent deployment to roll back from.');
    }

    const restoreVersion = active.previousVersion;
    if (!restoreVersion) {
      throw new BadRequestException('No previous successful deployment is available for rollback.');
    }

    const restoreTarget = await this.prisma.voiceAgentDeployment.findFirst({
      where: {
        organizationId,
        voiceAssistantId: assistant.id,
        version: restoreVersion,
        status: { in: [VoiceAgentDeploymentStatus.SUPERSEDED, VoiceAgentDeploymentStatus.ROLLED_BACK, VoiceAgentDeploymentStatus.ACTIVE] },
        archivedAt: null,
      },
    });

    if (!restoreTarget?.configSnapshot) {
      throw new BadRequestException('Previous deployment snapshot is unavailable.');
    }

    const restoreConfig = parseCanonicalAgentConfigSnapshot(
      restoreTarget.configSnapshot,
      organizationId,
    );
    if (!restoreConfig) {
      throw new BadRequestException('Previous deployment snapshot is invalid.');
    }

    validateCanonicalAgentConfig(restoreConfig, { forDeploy: true });

    const inFlight = await this.deploymentRepository.findProvisioningForOrganization(organizationId);
    if (inFlight) {
      throw new ConflictException('Cannot rollback while another deployment is provisioning.');
    }

    const nextVersion = await this.deploymentRepository.getNextVersion(organizationId, assistant.id);
    const rollbackDeployment = await this.deploymentRepository.create({
      organizationId,
      voiceAssistantId: assistant.id,
      provider: VoiceControlPlaneProvider.ELEVENLABS,
      version: nextVersion,
      status: VoiceAgentDeploymentStatus.PROVISIONING,
      configHash: hashCanonicalAgentConfig(restoreConfig),
      configSnapshot: restoreConfig,
      previousVersion: active.version,
      createdByUserId: actor.userId,
    });

    try {
      const providerResult = await this.applyProviderUpdate(
        organizationId,
        rollbackDeployment.id,
        restoreConfig,
        active,
        assistant.elevenLabsAgentId,
      );

      await this.verifyProviderDeployment(organizationId, rollbackDeployment.id, restoreConfig);
      await this.applyPostCallConfiguration(organizationId, rollbackDeployment.id, restoreConfig);
      await this.applyMcpGatewayConfiguration(organizationId, rollbackDeployment.id);

      const activated = await this.prisma.$transaction(async (tx) => {
        await tx.voiceAgentDeployment.update({
          where: { id: active.id },
          data: {
            status: VoiceAgentDeploymentStatus.ROLLED_BACK,
            rolledBackAt: new Date(),
          },
        });

        await tx.voiceAgentDeployment.updateMany({
          where: {
            organizationId,
            voiceAssistantId: assistant.id,
            status: VoiceAgentDeploymentStatus.ACTIVE,
            id: { not: rollbackDeployment.id },
            archivedAt: null,
          },
          data: { status: VoiceAgentDeploymentStatus.SUPERSEDED },
        });

        const row = await tx.voiceAgentDeployment.update({
          where: { id: rollbackDeployment.id },
          data: {
            status: VoiceAgentDeploymentStatus.ACTIVE,
            maskedExternalRef: providerResult.maskedExternalRef,
            protectedExternalRef: providerResult.externalAgentId,
            activatedVersion: restoreTarget.version,
            previousVersion: restoreTarget.previousVersion,
            provisionedAt: new Date(),
          },
        });

        await tx.voiceAssistant.update({
          where: { id: assistant.id },
          data: {
            elevenLabsAgentId: providerResult.externalAgentId,
            name: restoreConfig.assistantName,
            systemPrompt: restoreConfig.systemPrompt,
            greetingMessage: restoreConfig.greeting,
            voiceId: restoreConfig.voiceId,
            voiceName: restoreConfig.voiceName,
            language: restoreConfig.language,
            lastProvisionedAt: new Date(),
          },
        });

        return row;
      });

      void this.audit.record({
        actorUserId: actor.userId,
        actorOrganizationId: organizationId,
        action: ActivityAction.ADMIN_OVERRIDE,
        entity: ActivityEntity.ADMIN_OPERATION,
        entityId: activated.id,
        description: `Voice agent rolled back to v${restoreTarget.version}.`,
        changeSummary: `from=v${active.version}`,
        metaJson: {
          restoredFromVersion: restoreTarget.version,
          maskedExternalRef: activated.maskedExternalRef,
        },
      });

      return {
        deploymentId: activated.id,
        version: activated.version,
        restoredFromVersion: restoreTarget.version,
        status: activated.status,
        maskedExternalRef: activated.maskedExternalRef,
      };
    } catch (err: unknown) {
      const message = sanitizeElevenLabsLogMessage(
        err instanceof Error ? err.message : 'Agent rollback failed.',
      );
      await this.deploymentRepository.update(organizationId, rollbackDeployment.id, {
        status: VoiceAgentDeploymentStatus.FAILED,
        failedAt: new Date(),
      });
      this.logger.error(`Agent rollback failed for org ${organizationId}: ${message}`);
      throw err;
    }
  }

  private async applyProviderUpdate(
    organizationId: string,
    deploymentId: string,
    config: CanonicalAgentConfig,
    active: { protectedExternalRef: string | null; version: number } | null,
    legacyAgentId: string | null,
  ): Promise<{ externalAgentId: string; maskedExternalRef: string | null }> {
    const prompt = buildProviderSystemPrompt(config);
    const hasExistingRef = Boolean(
      active?.protectedExternalRef?.trim() || legacyAgentId?.trim(),
    );

    if (!hasExistingRef) {
      const created = await this.elevenLabs.createAgent({
        organizationId,
        deploymentId,
        name: config.assistantName,
        systemPrompt: prompt,
        greetingMessage: config.greeting,
        voiceId: config.voiceId ?? undefined,
        language: config.language,
      });
      const externalAgentId = created.externalAgentId;
      if (!externalAgentId) {
        throw new BadRequestException('ElevenLabs agent provisioning did not return an agent reference.');
      }
      await this.deploymentRepository.update(organizationId, deploymentId, {
        protectedExternalRef: externalAgentId,
        maskedExternalRef: created.maskedAgentRef ?? maskExternalId(externalAgentId, 'agent'),
      });
      return {
        externalAgentId,
        maskedExternalRef: created.maskedAgentRef ?? maskExternalId(externalAgentId, 'agent'),
      };
    }

    const updated = await this.elevenLabs.updateAgent({
      organizationId,
      deploymentId,
      name: config.assistantName,
      systemPrompt: prompt,
      greetingMessage: config.greeting,
      voiceId: config.voiceId ?? undefined,
      language: config.language,
    });

    const externalAgentId = updated.externalAgentId;
    if (!externalAgentId) {
      throw new BadRequestException('ElevenLabs agent update did not return an agent reference.');
    }

    await this.deploymentRepository.update(organizationId, deploymentId, {
      protectedExternalRef: externalAgentId,
      maskedExternalRef: updated.maskedAgentRef ?? maskExternalId(externalAgentId, 'agent'),
    });

    return {
      externalAgentId,
      maskedExternalRef: updated.maskedAgentRef ?? maskExternalId(externalAgentId, 'agent'),
    };
  }

  private async applyMcpGatewayConfiguration(
    organizationId: string,
    deploymentId: string,
  ): Promise<void> {
    if (!isVoiceMcpGatewayFeatureEnabled()) {
      return;
    }
    const mcpUrl = buildCanonicalVoiceMcpGatewayUrl(organizationId);
    if (!mcpUrl) {
      return;
    }
    await this.elevenLabs.updateToolsConfiguration({
      organizationId,
      deploymentId,
      mcpServerUrl: mcpUrl,
    });
  }

  private async applyPostCallConfiguration(
    organizationId: string,
    deploymentId: string,
    config: CanonicalAgentConfig,
  ): Promise<void> {
    const webhookUrl = buildCanonicalElevenLabsPostCallWebhookUrl(organizationId);
    if (!webhookUrl) {
      throw new BadRequestException('Canonical post-call webhook URL is not configured.');
    }

    await this.elevenLabs.updatePostCallConfiguration({
      organizationId,
      deploymentId,
      webhookUrl,
      sendAudio: config.postCall.sendAudio,
      analysisEnabled: config.postCall.enableAnalysis,
      enableTranscript: config.postCall.enableTranscript,
      enableSummary: config.postCall.enableSummary,
      enableOutcome: config.postCall.enableOutcome,
      configVersion: config.postCall.version,
    });
  }

  private async verifyProviderDeployment(
    organizationId: string,
    deploymentId: string,
    config: CanonicalAgentConfig,
  ) {
    const verified = await this.elevenLabs.getAgent({ organizationId, deploymentId });
    if (verified.name && verified.name !== config.assistantName) {
      throw new BadRequestException('Provider verification failed: agent name mismatch.');
    }
    return verified;
  }

  private async ensureDraftDeployment(
    organizationId: string,
    voiceAssistantId: string,
    assistant: Awaited<ReturnType<typeof this.requireAssistant>>,
  ) {
    const existing = await this.deploymentRepository.findDraftByAssistant(
      organizationId,
      voiceAssistantId,
    );
    if (existing) {
      return existing;
    }

    const config = buildCanonicalAgentConfigFromAssistant(assistant);
    const configHash = hashCanonicalAgentConfig(config);
    return this.deploymentRepository.create({
      organizationId,
      voiceAssistantId,
      provider: VoiceControlPlaneProvider.ELEVENLABS,
      status: VoiceAgentDeploymentStatus.DRAFT,
      version: 0,
      configHash,
      configSnapshot: config,
    });
  }

  private readDeploymentConfig(
    snapshot: unknown,
    assistant: Awaited<ReturnType<typeof this.requireAssistant>>,
  ): CanonicalAgentConfig {
    const parsed = parseCanonicalAgentConfigSnapshot(snapshot, assistant.organizationId);
    if (parsed) {
      return parsed;
    }
    return buildCanonicalAgentConfigFromAssistant(assistant);
  }

  private async requireAssistant(organizationId: string) {
    const assistant = await this.prisma.voiceAssistant.findFirst({
      where: { organizationId },
    });
    if (!assistant) {
      throw new NotFoundException('Voice assistant not found for organization.');
    }
    return assistant;
  }

  private assertStagingEnabled(): void {
    if (!isAgentDeploymentStagingEnabled()) {
      throw new ForbiddenException(
        'Versioned agent deployments are disabled. Set VOICE_AI_PROVISIONING_STAGING_ENABLED=true.',
      );
    }
  }

  private dtoToPatch(body: SaveAgentDeploymentDraftDto): CanonicalAgentConfigPatch {
    const { expectedUpdatedAt: _ignored, mcpToolRefs, ...rest } = body;
    return {
      ...rest,
      ...(mcpToolRefs
        ? {
            mcpToolRefs: mcpToolRefs.map((tool) => ({
              capabilityKey: tool.capabilityKey,
              mode: tool.mode as VoicePermissionMode,
            })),
          }
        : {}),
    };
  }

  private toDraftView(
    deploymentId: string,
    voiceAssistantId: string,
    config: CanonicalAgentConfig,
    configHash: string,
    updatedAt: Date,
  ): AgentDeploymentDraftView {
    return {
      deploymentId,
      voiceAssistantId,
      config,
      configHash,
      updatedAt: updatedAt.toISOString(),
    };
  }

  private mapProviderErrorClass(err: unknown): VoiceProvisioningErrorClass {
    if (err instanceof ElevenLabsProviderError) {
      switch (err.code) {
        case ElevenLabsProviderErrorCode.INVALID_CONFIGURATION:
        case ElevenLabsProviderErrorCode.REGION_MISMATCH:
        case ElevenLabsProviderErrorCode.TENANT_ISOLATION_VIOLATION:
          return VoiceProvisioningErrorClass.CONFIGURATION;
        case ElevenLabsProviderErrorCode.UNAUTHORIZED:
          return VoiceProvisioningErrorClass.PERMISSION;
        case ElevenLabsProviderErrorCode.RATE_LIMITED:
        case ElevenLabsProviderErrorCode.PROVIDER_UNAVAILABLE:
          return VoiceProvisioningErrorClass.TRANSIENT;
        default:
          return VoiceProvisioningErrorClass.PROVIDER;
      }
    }
    return VoiceProvisioningErrorClass.UNKNOWN;
  }
}
