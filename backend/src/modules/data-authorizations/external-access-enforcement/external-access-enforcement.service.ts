import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { AuthorizationActorType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
} from '../authorization-decision-engine/authorization-decision.constants';
import type { AuthorizationDecisionRequest } from '../authorization-decision-engine/authorization-decision.types';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import {
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_SOURCE_SYSTEM,
} from '../policy-resolver/policy-resolver.constants';
import { normalizeDataCategories } from '../data-authorization-risk.util';
import { VehicleHealthEnforcementService } from '../vehicle-health-enforcement/vehicle-health-enforcement.service';
import { DrivingBehaviorEnforcementService } from '../driving-behavior-enforcement/driving-behavior-enforcement.service';
import { TripLocationEnforcementService } from '../trip-location-enforcement/trip-location-enforcement.service';
import { LiveGpsEnforcementService } from '../live-gps-enforcement/live-gps-enforcement.service';
import {
  resolveChannelSpec,
  resolveMcpToolSpec,
  type ExternalAccessChannelSpec,
} from './external-access-channel.registry';
import { readExternalAccessEnforcementConfig } from './external-access-enforcement.config';
import {
  EXTERNAL_ACCESS_ACTION,
  EXTERNAL_ACCESS_CHANNEL,
  EXTERNAL_ACCESS_DENY_REASON,
  EXTERNAL_ACCESS_PATH,
  EXTERNAL_ACCESS_SERVICE_IDENTITY,
  EXTERNAL_PARTNER_PROCESSOR,
  MCP_TOKEN_REVOCATION,
} from './external-access-enforcement.constants';
import { ExternalAccessEnforcementMetricsService } from './external-access-enforcement.metrics';
import type {
  ExternalAccessChannelRequest,
  ExternalAccessGateContext,
  ExternalAccessGateResult,
} from './external-access-enforcement.types';

/**
 * Unified egress authorization for EXPORT, SHARE, USE_FOR_AI, and external READ (MCP).
 * Export is never implied by normal READ permission — explicit action required.
 */
@Injectable()
export class ExternalAccessEnforcementService {
  private readonly logger = new Logger(ExternalAccessEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly auditService: DataAuthorizationAuditService,
    private readonly metrics: ExternalAccessEnforcementMetricsService,
    @Optional() private readonly healthEnforcement?: VehicleHealthEnforcementService,
    @Optional() private readonly behaviorEnforcement?: DrivingBehaviorEnforcementService,
    @Optional() private readonly tripLocationEnforcement?: TripLocationEnforcementService,
    @Optional() private readonly liveGpsEnforcement?: LiveGpsEnforcementService,
    @Optional()
    @Inject(MCP_TOKEN_REVOCATION)
    private readonly mcpRevoker?: {
      revokeConversationTokens(conversationId: string): Promise<number>;
    },
  ) {}

  async checkUseForAi(
    ctx: ExternalAccessChannelRequest,
  ): Promise<ExternalAccessGateResult> {
    const spec = resolveChannelSpec(ctx.channelKey);
    if (!spec) {
      return this.buildDeny(EXTERNAL_ACCESS_DENY_REASON.AI_DENIED, ['UNKNOWN_CHANNEL']);
    }
    return this.checkCategories({
      ...ctx,
      channel: EXTERNAL_ACCESS_CHANNEL.AI_INFERENCE,
      action: EXTERNAL_ACCESS_ACTION.USE_FOR_AI,
      dataCategories: spec.dataCategories,
      purpose: spec.purpose,
      processingPath: spec.processingPath,
      serviceIdentity: spec.serviceIdentity,
    });
  }

  async checkExport(
    ctx: ExternalAccessChannelRequest,
  ): Promise<ExternalAccessGateResult> {
    const spec = resolveChannelSpec(ctx.channelKey);
    if (!spec) {
      return this.buildDeny(EXTERNAL_ACCESS_DENY_REASON.EXPORT_DENIED, ['UNKNOWN_CHANNEL']);
    }
    if (ctx.bulkExport) {
      const bulkOk = await this.checkBulkExportPermission(ctx.organizationId);
      if (!bulkOk) {
        return this.buildDeny(EXTERNAL_ACCESS_DENY_REASON.BULK_EXPORT_DENIED, ['BULK_EXPORT_PERMISSION']);
      }
    }
    return this.checkCategories({
      ...ctx,
      channel: ctx.bulkExport ? EXTERNAL_ACCESS_CHANNEL.BULK_EXPORT : EXTERNAL_ACCESS_CHANNEL.FILE_EXPORT,
      action: EXTERNAL_ACCESS_ACTION.EXPORT,
      dataCategories: spec.dataCategories,
      purpose: spec.purpose,
      processingPath: spec.processingPath,
      serviceIdentity: spec.serviceIdentity,
    });
  }

  async checkShare(ctx: ExternalAccessGateContext): Promise<ExternalAccessGateResult> {
    return this.checkCategories({
      ...ctx,
      channel: EXTERNAL_ACCESS_CHANNEL.PARTNER_API,
      action: EXTERNAL_ACCESS_ACTION.SHARE,
      processorType: EXTERNAL_PARTNER_PROCESSOR,
      processorId: ctx.externalRecipient ?? ctx.processorId ?? 'external-partner',
    });
  }

  async checkWebhookEgress(ctx: {
    organizationId: string;
    externalRecipient: string;
    transferCountry?: string | null;
    dataCategories?: string[];
    purpose?: string;
    correlationId: string;
    vehicleId?: string;
  }): Promise<ExternalAccessGateResult> {
    const spec = resolveChannelSpec('webhook_egress');
    if (!spec) {
      return this.buildDeny(EXTERNAL_ACCESS_DENY_REASON.WEBHOOK_DENIED, ['UNKNOWN_CHANNEL']);
    }
    return this.checkCategories({
      organizationId: ctx.organizationId,
      channel: EXTERNAL_ACCESS_CHANNEL.WEBHOOK_EGRESS,
      action: EXTERNAL_ACCESS_ACTION.SHARE,
      dataCategories: ctx.dataCategories ?? spec.dataCategories,
      purpose: ctx.purpose ?? spec.purpose,
      processingPath: spec.processingPath,
      serviceIdentity: spec.serviceIdentity,
      correlationId: ctx.correlationId,
      externalRecipient: ctx.externalRecipient,
      transferCountry: ctx.transferCountry ?? null,
      processorType: EXTERNAL_PARTNER_PROCESSOR,
      processorId: ctx.externalRecipient,
      vehicleId: ctx.vehicleId,
    });
  }

  async checkMcpTool(input: {
    organizationId: string;
    toolName: string;
    vehicleId?: string;
    customerId?: string;
    bookingId?: string;
    conversationId: string;
    correlationId: string;
  }): Promise<ExternalAccessGateResult & { spec: ExternalAccessChannelSpec | null }> {
    const spec = resolveMcpToolSpec(input.toolName);
    if (!spec) {
      return {
        ...this.buildDeny(EXTERNAL_ACCESS_DENY_REASON.MCP_DENIED, ['UNKNOWN_MCP_TOOL']),
        spec: null,
      };
    }
    const result = await this.checkCategories({
      organizationId: input.organizationId,
      channel: EXTERNAL_ACCESS_CHANNEL.MCP_TOOL,
      action: EXTERNAL_ACCESS_ACTION.READ,
      dataCategories: spec.dataCategories,
      purpose: spec.purpose,
      processingPath: spec.processingPath,
      serviceIdentity: spec.serviceIdentity,
      correlationId: input.correlationId,
      vehicleId: input.vehicleId,
      customerId: input.customerId,
      bookingId: input.bookingId,
      mcpToolName: input.toolName,
      conversationId: input.conversationId,
    });
    return { ...result, spec };
  }

  async checkSupportAccess(ctx: {
    organizationId: string;
    vehicleId?: string;
    serviceIdentity: string;
    correlationId: string;
    dataCategories: string[];
    purpose: string;
  }): Promise<ExternalAccessGateResult> {
    if (ctx.serviceIdentity !== EXTERNAL_ACCESS_SERVICE_IDENTITY.MASTER_ADMIN_SUPPORT) {
      return this.buildDeny(EXTERNAL_ACCESS_DENY_REASON.SUPPORT_DENIED, ['SUPPORT_IDENTITY_REQUIRED']);
    }
    return this.checkCategories({
      organizationId: ctx.organizationId,
      channel: EXTERNAL_ACCESS_CHANNEL.SUPPORT_ACCESS,
      action: EXTERNAL_ACCESS_ACTION.READ,
      dataCategories: ctx.dataCategories,
      purpose: ctx.purpose,
      processingPath: EXTERNAL_ACCESS_PATH.SUPPORT_BREAK_GLASS,
      serviceIdentity: ctx.serviceIdentity,
      correlationId: ctx.correlationId,
      vehicleId: ctx.vehicleId,
      supportAccess: true,
    });
  }

  resolveChannelSpec(channelKey: string) {
    return resolveChannelSpec(channelKey);
  }

  resolveMcpToolSpec(toolName: string) {
    return resolveMcpToolSpec(toolName);
  }

  /**
   * Revocation: invalidate active MCP conversation tokens for org.
   * Existing export files are not retroactively deleted — retention policy applies.
   */
  async handleRevocation(input: {
    organizationId: string;
    conversationId?: string;
    correlationId: string;
  }): Promise<{ revokedTokens: number }> {
    let revokedTokens = 0;
    if (input.conversationId && this.mcpRevoker) {
      revokedTokens = await this.mcpRevoker.revokeConversationTokens(input.conversationId);
    }
    this.metrics.record({
      channel: EXTERNAL_ACCESS_CHANNEL.MCP_TOOL,
      action: EXTERNAL_ACCESS_ACTION.READ,
      outcome: 'revoked',
    });
    this.logger.warn(
      `External access revocation org=${input.organizationId} conversation=${input.conversationId ?? 'all'} tokens=${revokedTokens}`,
    );
    return { revokedTokens };
  }

  private async checkCategories(ctx: ExternalAccessGateContext): Promise<ExternalAccessGateResult> {
    if (!ctx.organizationId?.trim()) {
      this.metrics.record({ channel: ctx.channel, action: ctx.action, outcome: 'tenant_mismatch' });
      return this.buildDeny(EXTERNAL_ACCESS_DENY_REASON.TENANT_MISMATCH, ['SCOPE_MISMATCH']);
    }

    if (ctx.vehicleId) {
      const tenantOk = await this.prisma.vehicle.findFirst({
        where: { id: ctx.vehicleId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!tenantOk) {
        this.metrics.record({ channel: ctx.channel, action: ctx.action, outcome: 'tenant_mismatch' });
        return this.buildDeny(EXTERNAL_ACCESS_DENY_REASON.TENANT_MISMATCH, ['TENANT_MISMATCH']);
      }
    }

    const deniedCategories: string[] = [];
    for (const category of ctx.dataCategories) {
      const allowed = await this.checkSingleCategory(ctx, category);
      if (!allowed) deniedCategories.push(category);
    }

    if (deniedCategories.length > 0) {
      const config = readExternalAccessEnforcementConfig();
      const failClosed = config.failClosed && !config.shadowMode;
      const reasonCode =
        ctx.action === EXTERNAL_ACCESS_ACTION.EXPORT
          ? EXTERNAL_ACCESS_DENY_REASON.EXPORT_DENIED
          : ctx.action === EXTERNAL_ACCESS_ACTION.USE_FOR_AI
            ? EXTERNAL_ACCESS_DENY_REASON.AI_DENIED
            : ctx.action === EXTERNAL_ACCESS_ACTION.SHARE
              ? EXTERNAL_ACCESS_DENY_REASON.SHARE_DENIED
              : EXTERNAL_ACCESS_DENY_REASON.MCP_DENIED;

      if (failClosed) {
        await this.recordSkipped(ctx, reasonCode, deniedCategories);
      }
      this.metrics.record({
        channel: ctx.channel,
        action: ctx.action,
        outcome: failClosed ? 'deny' : 'shadow_would_deny',
      });
      return {
        mayProceed: !failClosed,
        decision: failClosed
          ? AUTHORIZATION_DECISION_OUTCOME.DENY
          : AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY,
        enforced: failClosed,
        isShadowMode: config.shadowMode && !failClosed,
        isAuthorizationDeny: true,
        reasonCode,
        reasonCodes: deniedCategories,
        correlationId: ctx.correlationId,
        auditEventId: null,
        deniedCategories,
      };
    }

    this.metrics.record({ channel: ctx.channel, action: ctx.action, outcome: 'allow' });
    return {
      mayProceed: true,
      decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW,
      enforced: false,
      isShadowMode: false,
      isAuthorizationDeny: false,
      reasonCode: 'POLICY_MATCH',
      reasonCodes: ['POLICY_MATCH'],
      correlationId: ctx.correlationId,
      auditEventId: null,
    };
  }

  private async checkSingleCategory(
    ctx: ExternalAccessGateContext,
    dataCategory: string,
  ): Promise<boolean> {
    const base = {
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId ?? ctx.organizationId,
      dataCategory,
      purpose: ctx.purpose,
      processingPath: ctx.processingPath,
      serviceIdentity: ctx.serviceIdentity,
      correlationId: `${ctx.correlationId}:${dataCategory}`,
    };

    if (ctx.action === EXTERNAL_ACCESS_ACTION.USE_FOR_AI && this.healthEnforcement) {
      if (dataCategory === 'HEALTH_SIGNALS' || dataCategory === 'DTC_CODES') {
        return this.healthEnforcement.mayUseForAi(base);
      }
    }

    if (ctx.action === EXTERNAL_ACCESS_ACTION.EXPORT && this.healthEnforcement) {
      if (dataCategory === 'HEALTH_SIGNALS' || dataCategory === 'DTC_CODES') {
        return this.healthEnforcement.mayExport(base);
      }
    }

    if (ctx.action === EXTERNAL_ACCESS_ACTION.USE_FOR_AI && this.behaviorEnforcement) {
      if (dataCategory === 'DRIVING_BEHAVIOR') {
        return this.behaviorEnforcement.mayUseForAi(base);
      }
    }

    if (ctx.action === EXTERNAL_ACCESS_ACTION.EXPORT && this.tripLocationEnforcement) {
      if (dataCategory === 'GPS_LOCATION' || dataCategory === 'TRIP_DATA') {
        const result = await this.tripLocationEnforcement.assertExport(base);
        return result.mayProceed;
      }
    }

    if (ctx.action === EXTERNAL_ACCESS_ACTION.READ && dataCategory === 'GPS_LOCATION' && this.liveGpsEnforcement) {
      const allowed = await this.liveGpsEnforcement.isVehicleGpsReadAllowed({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId!,
        purpose: ctx.purpose as never,
        serviceIdentity: ctx.serviceIdentity as never,
        correlationId: ctx.correlationId,
        supportAccess: ctx.supportAccess,
      });
      return allowed;
    }

    const decision = await this.authorizationDecision.decide(this.toDecisionRequest(ctx, dataCategory));
    return (
      decision.decision === AUTHORIZATION_DECISION_OUTCOME.ALLOW ||
      decision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY
    );
  }

  private toDecisionRequest(
    ctx: ExternalAccessGateContext,
    dataCategory: string,
  ): AuthorizationDecisionRequest {
    const isPartner =
      ctx.action === EXTERNAL_ACCESS_ACTION.SHARE ||
      ctx.processorType === EXTERNAL_PARTNER_PROCESSOR;

    return {
      organizationId: ctx.organizationId,
      sourceSystem: isPartner
        ? POLICY_RESOLVER_SOURCE_SYSTEM.PARTNER_ACCESS
        : POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
      dataCategory: normalizeDataCategories([dataCategory])[0],
      purpose: ctx.purpose,
      action: ctx.action as AuthorizationDecisionRequest['action'],
      processorType: (ctx.processorType ??
        POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE) as AuthorizationDecisionRequest['processorType'],
      serviceIdentity: ctx.serviceIdentity,
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: ctx.resourceId ?? ctx.vehicleId ?? ctx.organizationId,
      vehicleId: ctx.vehicleId ?? null,
      customerId: ctx.customerId ?? null,
      bookingId: ctx.bookingId ?? null,
      correlationId: ctx.correlationId,
      actorType: AuthorizationActorType.SYSTEM,
    };
  }

  private async checkBulkExportPermission(organizationId: string): Promise<boolean> {
    const raw = process.env.DATA_AUTH_BULK_EXPORT_ORG_ALLOWLIST?.trim();
    if (!raw) return false;
    return raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .includes(organizationId);
  }

  private buildDeny(reasonCode: string, reasonCodes: string[]): ExternalAccessGateResult {
    return {
      mayProceed: false,
      decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
      enforced: true,
      isShadowMode: false,
      isAuthorizationDeny: true,
      reasonCode,
      reasonCodes,
      correlationId: 'n/a',
      auditEventId: null,
    };
  }

  private async recordSkipped(
    ctx: ExternalAccessGateContext,
    reasonCode: string,
    deniedCategories: string[],
  ): Promise<void> {
    try {
      await this.auditService.recordIngestionSkipped({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId ?? ctx.organizationId,
        sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
        dataCategory: deniedCategories[0] ?? 'UNKNOWN',
        purpose: ctx.purpose,
        ingestionPath: `${ctx.processingPath}:${ctx.action}`,
        serviceIdentity: ctx.serviceIdentity,
        correlationId: ctx.correlationId,
        reasonCode,
        reasonCodes: deniedCategories,
        policyVersion: null,
        matchedPolicyId: null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record external-access skip channel=${ctx.channel}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
