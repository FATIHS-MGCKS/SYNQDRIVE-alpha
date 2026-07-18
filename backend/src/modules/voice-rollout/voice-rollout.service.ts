import { BadRequestException, Injectable } from '@nestjs/common';
import {
  VoiceAgentDeploymentStatus,
  VoiceAssistantStatus,
  VoiceConnectionStatus,
  VoiceControlPlaneProvider,
  VoiceElevenLabsImportStatus,
  VoicePhoneNumberLifecycle,
  VoiceRolloutStatus,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { VoiceEntitlementService } from '@modules/voice-entitlement/voice-entitlement.service';
import { VoiceEntitlementDeniedError } from '@modules/voice-entitlement/voice-entitlement-reason-codes';
import { VoiceBudgetEnforcementService } from '@modules/voice-protection/voice-budget-enforcement.service';
import { buildCanonicalVoiceMcpGatewayUrl } from '@modules/voice-mcp-gateway/voice-mcp-canonical-url';
import {
  isLegacyDiagnosticCallsEnabled,
  isVoiceMcpGatewayFeatureEnabled,
  isVoiceNativeTwilioIntegrationEnabled,
  isVoiceOutboundAutomationsEnabled,
} from '@modules/voice-call-orchestration/voice-feature-flags.config';
import { isVoiceWebhookIngestionEnabled } from '@modules/voice-webhook-ingestion/voice-webhook-ingestion.config';
import {
  isKnownRolloutStatus,
  isLegacyDiagnosticRolloutAllowed,
  isSurfaceRolloutTierAllowed,
  VOICE_ROLLOUT_SURFACE_GLOBAL_FLAG,
  VOICE_ROLLOUT_STATUSES_REQUIRING_CONFIRM,
} from './voice-rollout.policy';
import { VoiceRolloutRepository } from './voice-rollout.repository';
import {
  VOICE_ROLLOUT_REASON_CODES,
  VoiceRolloutDeniedError,
} from './voice-rollout-reason-codes';
import type {
  VoiceRolloutContext,
  VoiceRolloutEvaluation,
  VoiceRolloutPrerequisiteBlocker,
  VoiceRolloutStatusView,
  VoiceRolloutSurface,
} from './voice-rollout.types';
import { VOICE_ROLLOUT_SURFACE_ENTITLEMENT } from './voice-rollout.types';

@Injectable()
export class VoiceRolloutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: VoiceRolloutRepository,
    private readonly entitlements: VoiceEntitlementService,
    private readonly budget: VoiceBudgetEnforcementService,
  ) {}

  async resolveContext(organizationId: string): Promise<VoiceRolloutContext> {
    const row = await this.repository.findByOrganization(organizationId);
    if (!row) {
      return {
        organizationId,
        status: 'DISABLED',
        lastReason: null,
        updatedAt: null,
      };
    }
    return {
      organizationId,
      status: row.status,
      lastReason: row.lastReason,
      updatedAt: row.updatedAt,
    };
  }

  async getStatusView(organizationId: string): Promise<VoiceRolloutStatusView> {
    const context = await this.resolveContext(organizationId);
    const row = await this.repository.findByOrganization(organizationId);
    return {
      organizationId,
      status: context.status,
      lastReason: context.lastReason,
      updatedAt: context.updatedAt?.toISOString() ?? null,
      updatedByUserId: row?.updatedByUserId ?? null,
    };
  }

  async evaluateSurface(
    organizationId: string,
    surface: VoiceRolloutSurface,
    options?: { skipRuntimePrerequisites?: boolean },
  ): Promise<VoiceRolloutEvaluation> {
    const context = await this.resolveContext(organizationId);
    const blockers: VoiceRolloutPrerequisiteBlocker[] = [];

    blockers.push(...this.evaluateGlobalKillSwitches(surface));
    blockers.push(...this.evaluateTenantRollout(surface, context.status));

    if (blockers.length === 0) {
      const entitlementBlocker = await this.evaluateEntitlement(organizationId, surface);
      if (entitlementBlocker) {
        blockers.push(entitlementBlocker);
      }
    }

    if (!options?.skipRuntimePrerequisites && blockers.length === 0) {
      const runtimeBlockers = await this.evaluateRuntimePrerequisites(organizationId, surface);
      blockers.push(...runtimeBlockers);
    }

    return {
      organizationId,
      surface,
      rolloutStatus: context.status,
      allowed: blockers.length === 0,
      blockers,
    };
  }

  /** Shared fundamental prerequisites for inbound and outbound voice calls. */
  async evaluateCallPrerequisites(organizationId: string, surface: 'inbound' | 'outbound') {
    return this.evaluateSurface(organizationId, surface);
  }

  async assertSurfaceAllowed(
    organizationId: string,
    surface: VoiceRolloutSurface,
    options?: { skipRuntimePrerequisites?: boolean },
  ): Promise<VoiceRolloutContext> {
    const evaluation = await this.evaluateSurface(organizationId, surface, options);
    if (evaluation.allowed) {
      return this.resolveContext(organizationId);
    }

    const primary = evaluation.blockers[0];
    throw new VoiceRolloutDeniedError({
      reasonCode: this.reasonForBlocker(primary?.code, evaluation.rolloutStatus),
      message: primary?.message ?? `Voice rollout blocked for surface '${surface}'.`,
      rolloutStatus: evaluation.rolloutStatus,
      surface,
      blockers: evaluation.blockers,
    });
  }

  async changeRolloutStatus(params: {
    organizationId: string;
    status: VoiceRolloutStatus;
    reason: string;
    actorUserId?: string | null;
    confirm?: boolean;
    idempotencyKey?: string | null;
  }) {
    if (!params.reason?.trim()) {
      throw new BadRequestException({
        message: 'reason is required for rollout status changes',
        reasonCode: VOICE_ROLLOUT_REASON_CODES.REASON_REQUIRED,
      });
    }

    if (!isKnownRolloutStatus(params.status)) {
      throw new BadRequestException({
        message: `Unknown rollout status: ${params.status}`,
        reasonCode: VOICE_ROLLOUT_REASON_CODES.UNKNOWN_STATUS,
      });
    }

    if (VOICE_ROLLOUT_STATUSES_REQUIRING_CONFIRM.has(params.status) && !params.confirm) {
      throw new BadRequestException({
        message: `confirm=true is required to set rollout status to ${params.status}`,
        reasonCode: VOICE_ROLLOUT_REASON_CODES.CONFIRMATION_REQUIRED,
      });
    }

    if (params.idempotencyKey?.trim()) {
      const prior = await this.repository.findAuditByIdempotencyKey(
        params.organizationId,
        params.idempotencyKey.trim(),
      );
      if (prior) {
        const current = await this.getStatusView(params.organizationId);
        return {
          idempotentReplay: true,
          ...current,
          auditEventId: prior.id,
        };
      }
    }

    const previous = await this.resolveContext(params.organizationId);
    const reason = params.reason.trim();

    const row = await this.repository.upsertStatus({
      organizationId: params.organizationId,
      status: params.status,
      reason,
      actorUserId: params.actorUserId,
    });

    const audit = await this.repository.recordAudit({
      organizationId: params.organizationId,
      action: 'STATUS_CHANGED',
      previousStatus: previous.status,
      newStatus: params.status,
      reason,
      actorUserId: params.actorUserId,
      idempotencyKey: params.idempotencyKey?.trim() ?? null,
      metadata: {
        previousStatus: previous.status,
        newStatus: params.status,
      },
    });

    return {
      idempotentReplay: false,
      organizationId: params.organizationId,
      status: row.status,
      lastReason: row.lastReason,
      updatedAt: row.updatedAt.toISOString(),
      updatedByUserId: row.updatedByUserId,
      auditEventId: audit.id,
      previousStatus: previous.status,
    };
  }

  listAuditEvents(organizationId: string, limit = 50) {
    return this.repository.listAuditByOrganization(organizationId, limit);
  }

  private evaluateGlobalKillSwitches(surface: VoiceRolloutSurface): VoiceRolloutPrerequisiteBlocker[] {
    const flag = VOICE_ROLLOUT_SURFACE_GLOBAL_FLAG[surface];
    if (!flag) {
      return [];
    }

    const blockers: VoiceRolloutPrerequisiteBlocker[] = [];

    switch (flag) {
      case 'native':
        if (!isVoiceNativeTwilioIntegrationEnabled()) {
          blockers.push({
            code: 'global_kill_switch_native',
            message: 'VOICE_NATIVE_TWILIO_INTEGRATION is disabled platform-wide.',
          });
        }
        break;
      case 'mcp':
        if (!isVoiceMcpGatewayFeatureEnabled()) {
          blockers.push({
            code: 'global_kill_switch_mcp',
            message: 'VOICE_MCP_GATEWAY is disabled platform-wide.',
          });
        }
        break;
      case 'webhooks':
        if (!isVoiceWebhookIngestionEnabled()) {
          blockers.push({
            code: 'global_kill_switch_webhooks',
            message: 'VOICE_WEBHOOK_INGESTION_ENABLED is disabled platform-wide.',
          });
        }
        break;
      case 'automations':
        if (!isVoiceOutboundAutomationsEnabled()) {
          blockers.push({
            code: 'global_kill_switch_automations',
            message: 'VOICE_OUTBOUND_AUTOMATIONS is disabled platform-wide.',
          });
        }
        if (!isVoiceNativeTwilioIntegrationEnabled()) {
          blockers.push({
            code: 'global_kill_switch_native',
            message: 'VOICE_NATIVE_TWILIO_INTEGRATION is disabled platform-wide.',
          });
        }
        break;
      case 'legacy':
        if (!isLegacyDiagnosticCallsEnabled()) {
          blockers.push({
            code: 'global_kill_switch_legacy',
            message: 'VOICE_LEGACY_DIAGNOSTIC_CALLS is disabled platform-wide.',
          });
        }
        break;
      default:
        break;
    }

    return blockers;
  }

  private evaluateTenantRollout(
    surface: VoiceRolloutSurface,
    status: VoiceRolloutStatus,
  ): VoiceRolloutPrerequisiteBlocker[] {
    if (!isKnownRolloutStatus(status)) {
      return [
        {
          code: 'tenant_rollout_unknown',
          message: `Unknown tenant rollout status: ${status}`,
        },
      ];
    }

    if (status === 'DISABLED') {
      return [
        {
          code: 'tenant_rollout_disabled',
          message: 'Voice rollout is DISABLED for this organization.',
        },
      ];
    }

    if (status === 'SUSPENDED') {
      return [
        {
          code: 'tenant_rollout_suspended',
          message: 'Voice rollout is SUSPENDED for this organization.',
        },
      ];
    }

    if (surface === 'legacy_diagnostic' && !isLegacyDiagnosticRolloutAllowed(status)) {
      return [
        {
          code: 'legacy_not_in_production',
          message: 'Legacy diagnostic calls are not allowed for PRODUCTION rollout tier.',
        },
      ];
    }

    if (!isSurfaceRolloutTierAllowed(surface, status)) {
      return [
        {
          code: 'tenant_rollout_tier_insufficient',
          message: `Rollout tier ${status} is insufficient for surface '${surface}'.`,
        },
      ];
    }

    return [];
  }

  private async evaluateEntitlement(
    organizationId: string,
    surface: VoiceRolloutSurface,
  ): Promise<VoiceRolloutPrerequisiteBlocker | null> {
    const capability = VOICE_ROLLOUT_SURFACE_ENTITLEMENT[surface];
    if (!capability) {
      return null;
    }

    try {
      await this.entitlements.assertCapability(organizationId, capability);
      return null;
    } catch (err) {
      if (err instanceof VoiceEntitlementDeniedError) {
        return {
          code: 'entitlement_denied',
          message: err.message,
        };
      }
      throw err;
    }
  }

  private async evaluateRuntimePrerequisites(
    organizationId: string,
    surface: VoiceRolloutSurface,
  ): Promise<VoiceRolloutPrerequisiteBlocker[]> {
    const needsCallRuntime =
      surface === 'inbound' || surface === 'outbound' || surface === 'automation';
    const needsMcp = surface === 'mcp' || (needsCallRuntime && isVoiceMcpGatewayFeatureEnabled());
    const needsPhone = needsCallRuntime || surface === 'provisioning';
    const needsDeployment =
      needsCallRuntime || surface === 'agent_deployment' || surface === 'mcp';
    const needsProviderHealth = needsCallRuntime || surface === 'provisioning';
    const needsBudget = needsCallRuntime;

    const blockers: VoiceRolloutPrerequisiteBlocker[] = [];
    const assistant = await this.prisma.voiceAssistant.findUnique({ where: { organizationId } });

    if (needsProviderHealth) {
      if (!assistant) {
        blockers.push({
          code: 'provider_unhealthy',
          message: 'Voice assistant is not configured.',
        });
      } else if (
        assistant.status !== VoiceAssistantStatus.ACTIVE &&
        (surface === 'inbound' || surface === 'outbound' || surface === 'automation')
      ) {
        blockers.push({
          code: 'provider_unhealthy',
          message: 'Voice assistant is not active.',
        });
      } else if (
        assistant.connectionStatus === VoiceConnectionStatus.ERROR &&
        needsCallRuntime
      ) {
        blockers.push({
          code: 'provider_unhealthy',
          message: 'Voice provider connection is in error state.',
        });
      }
    }

    if (needsDeployment && blockers.length === 0) {
      const deployment = await this.prisma.voiceAgentDeployment.findFirst({
        where: {
          organizationId,
          status: VoiceAgentDeploymentStatus.ACTIVE,
          provider: VoiceControlPlaneProvider.ELEVENLABS,
          archivedAt: null,
        },
      });
      if (!deployment) {
        blockers.push({
          code: 'deployment_missing',
          message: 'No active ElevenLabs agent deployment.',
        });
      }
    }

    if (needsPhone && blockers.length === 0) {
      const phone = await this.prisma.voicePhoneNumber.findFirst({
        where: {
          organizationId,
          lifecycle: VoicePhoneNumberLifecycle.ACTIVE,
          archivedAt: null,
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (!phone) {
        blockers.push({
          code: 'phone_missing',
          message: 'No active voice phone number is assigned.',
        });
      } else if (
        needsCallRuntime &&
        phone.elevenLabsImportStatus !== VoiceElevenLabsImportStatus.ASSIGNED
      ) {
        blockers.push({
          code: 'phone_not_imported',
          message: 'Twilio number is not imported and assigned in ElevenLabs.',
        });
      }
    }

    if (needsMcp && blockers.length === 0 && isVoiceMcpGatewayFeatureEnabled()) {
      const mcpUrl = buildCanonicalVoiceMcpGatewayUrl(organizationId);
      if (!mcpUrl) {
        blockers.push({
          code: 'mcp_url_missing',
          message: 'MCP gateway public URL is not configured.',
        });
      }
    }

    if (needsBudget && blockers.length === 0) {
      const degradation = await this.budget.evaluateInboundDegradation(organizationId);
      if (degradation.degraded) {
        blockers.push({
          code: 'budget_degraded',
          message: degradation.message ?? 'Voice budget limits block this operation.',
        });
      }
    }

    return blockers;
  }

  private reasonForBlocker(
    code: VoiceRolloutPrerequisiteBlocker['code'] | undefined,
    status: VoiceRolloutStatus,
  ) {
    if (code?.startsWith('global_kill_switch')) {
      return VOICE_ROLLOUT_REASON_CODES.GLOBAL_KILL_SWITCH;
    }
    if (code === 'tenant_rollout_disabled') {
      return VOICE_ROLLOUT_REASON_CODES.TENANT_DISABLED;
    }
    if (code === 'tenant_rollout_suspended') {
      return VOICE_ROLLOUT_REASON_CODES.TENANT_SUSPENDED;
    }
    if (code === 'tenant_rollout_unknown') {
      return VOICE_ROLLOUT_REASON_CODES.UNKNOWN_STATUS;
    }
    if (code === 'legacy_not_in_production') {
      return VOICE_ROLLOUT_REASON_CODES.LEGACY_NOT_IN_PRODUCTION;
    }
    if (code === 'tenant_rollout_tier_insufficient') {
      return VOICE_ROLLOUT_REASON_CODES.TIER_INSUFFICIENT;
    }
    if (!isKnownRolloutStatus(status)) {
      return VOICE_ROLLOUT_REASON_CODES.UNKNOWN_STATUS;
    }
    return VOICE_ROLLOUT_REASON_CODES.PREREQUISITE_FAILED;
  }
}
