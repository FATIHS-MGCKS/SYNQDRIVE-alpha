import { Injectable, Logger } from '@nestjs/common';
import { AuthorizationActorType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from '../authorization-decision-engine/authorization-decision.constants';
import type { AuthorizationDecisionRequest } from '../authorization-decision-engine/authorization-decision.types';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import {
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_SOURCE_SYSTEM,
} from '../policy-resolver/policy-resolver.constants';
import { normalizeDataCategories } from '../data-authorization-risk.util';
import { readVehicleHealthEnforcementConfig } from './vehicle-health-enforcement.config';
import { VehicleHealthEnforcementMetricsService } from './vehicle-health-enforcement.metrics';
import type {
  VehicleHealthGateContext,
  VehicleHealthGateResult,
} from './vehicle-health-enforcement.types';
import {
  VEHICLE_HEALTH_ACTION,
  VEHICLE_HEALTH_OBSERVATION_SOURCE,
} from './vehicle-health-enforcement.constants';
import { HealthAccessDeniedException } from './vehicle-health-enforcement.exceptions';

/**
 * Vehicle health / DTC / technical observation authorization.
 * Separates raw INGEST from derived DERIVE; READ/EXPORT/USE_FOR_AI are explicit.
 */
@Injectable()
export class VehicleHealthEnforcementService {
  private readonly logger = new Logger(VehicleHealthEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly auditService: DataAuthorizationAuditService,
    private readonly metrics: VehicleHealthEnforcementMetricsService,
  ) {}

  async evaluate(ctx: VehicleHealthGateContext): Promise<VehicleHealthGateResult> {
    return this.evaluateMutating(ctx, this.kindForAction(ctx.action));
  }

  async mayIngest(ctx: Omit<VehicleHealthGateContext, 'action'>): Promise<boolean> {
    return (await this.evaluate({ ...ctx, action: VEHICLE_HEALTH_ACTION.INGEST })).mayProceed;
  }

  async mayDerive(ctx: Omit<VehicleHealthGateContext, 'action'>): Promise<boolean> {
    return (await this.evaluate({ ...ctx, action: VEHICLE_HEALTH_ACTION.DERIVE })).mayProceed;
  }

  async isReadAllowed(ctx: Omit<VehicleHealthGateContext, 'action'>): Promise<boolean> {
    return (await this.evaluate({ ...ctx, action: VEHICLE_HEALTH_ACTION.READ })).mayProceed;
  }

  async mayUseForAi(ctx: Omit<VehicleHealthGateContext, 'action'>): Promise<boolean> {
    return (await this.evaluate({ ...ctx, action: VEHICLE_HEALTH_ACTION.USE_FOR_AI })).mayProceed;
  }

  async mayExport(ctx: Omit<VehicleHealthGateContext, 'action'>): Promise<boolean> {
    return (await this.evaluate({ ...ctx, action: VEHICLE_HEALTH_ACTION.EXPORT })).mayProceed;
  }

  async assertExport(
    ctx: Omit<VehicleHealthGateContext, 'action'>,
  ): Promise<VehicleHealthGateResult> {
    return this.evaluate({ ...ctx, action: VEHICLE_HEALTH_ACTION.EXPORT });
  }

  async assertRead(ctx: Omit<VehicleHealthGateContext, 'action'>): Promise<void> {
    const allowed = await this.isReadAllowed(ctx);
    if (!allowed) {
      throw new HealthAccessDeniedException('HEALTH_READ_DENIED', ctx.correlationId);
    }
  }

  async assertUseForAi(ctx: Omit<VehicleHealthGateContext, 'action'>): Promise<void> {
    const allowed = await this.mayUseForAi(ctx);
    if (!allowed) {
      throw new HealthAccessDeniedException('HEALTH_AI_DENIED', ctx.correlationId);
    }
  }

  async resolveOrganizationId(vehicleId: string): Promise<string | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    return vehicle?.organizationId ?? null;
  }

  /** Empty DTC summary when READ denied — no silent leak of fault data. */
  emptyDtcSummary() {
    return {
      activeCount: 0,
      monitoringCount: 0,
      hasStaleData: false,
      lastSuccessfulCheckAt: null,
      accessDenied: true,
    };
  }

  /** Minimal health AI response when USE_FOR_AI denied. */
  emptyAiHealthCare() {
    return {
      aiStatus: 'NO_RECENT_DATA' as const,
      summaryText: 'Gesundheitsauswertung nicht autorisiert.',
      reasons: ['HEALTH_AI_DENIED'],
      accessDenied: true,
    };
  }

  private async evaluateMutating(
    ctx: VehicleHealthGateContext,
    kind: 'ingest' | 'derive' | 'read' | 'export' | 'use_for_ai',
  ): Promise<VehicleHealthGateResult> {
    const config = readVehicleHealthEnforcementConfig();

    if (!ctx.organizationId?.trim() || !ctx.vehicleId?.trim()) {
      this.recordMetric(ctx, 'scope_mismatch');
      return this.scopeDeny(ctx, ['SCOPE_MISMATCH']);
    }

    const tenantOk = await this.prisma.vehicle.findFirst({
      where: { id: ctx.vehicleId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!tenantOk) {
      this.recordMetric(ctx, 'scope_mismatch');
      return this.scopeDeny(ctx, ['TENANT_MISMATCH']);
    }

    const decision = await this.authorizationDecision.decide(this.toDecisionRequest(ctx));

    const isAllow = decision.decision === AUTHORIZATION_DECISION_OUTCOME.ALLOW;
    const isPolicyShadow =
      decision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY;

    if (isAllow || isPolicyShadow) {
      this.recordMetric(ctx, isPolicyShadow ? 'shadow_would_deny' : 'allow');
      return {
        mayProceed: true,
        decision: decision.decision,
        enforced: decision.enforced,
        isShadowMode: decision.isShadowMode,
        shouldRetry: false,
        isAuthorizationDeny: false,
        reasonCode: decision.reasonCode,
        reasonCodes: decision.reasonCodes,
        correlationId: decision.correlationId,
        auditEventId: decision.auditEventId,
      };
    }

    const resolverError =
      decision.reasonCodes.includes(AUTHORIZATION_DECISION_REASON.RESOLVER_ERROR) ||
      decision.reasonCodes.includes(AUTHORIZATION_DECISION_REASON.DATABASE_ERROR);
    if (resolverError) {
      this.recordMetric(ctx, 'resolver_error');
    }

    const failClosed = config.failClosed && !config.shadowMode;
    const mayProceed = !failClosed;

    if (!mayProceed) {
      await this.recordSkipped(ctx, decision, kind);
      this.recordMetric(ctx, 'skipped');
    } else {
      this.recordMetric(ctx, 'deny');
      this.logger.warn(
        `Health ${kind} shadow DENY path=${ctx.processingPath} org=${ctx.organizationId} vehicle=${ctx.vehicleId} reason=${decision.reasonCode}`,
      );
    }

    return {
      mayProceed,
      decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
      enforced: failClosed,
      isShadowMode: config.shadowMode && !failClosed,
      shouldRetry: false,
      isAuthorizationDeny: true,
      reasonCode: decision.reasonCode,
      reasonCodes: decision.reasonCodes,
      correlationId: decision.correlationId,
      auditEventId: decision.auditEventId,
    };
  }

  private toDecisionRequest(ctx: VehicleHealthGateContext): AuthorizationDecisionRequest {
    return {
      organizationId: ctx.organizationId,
      sourceSystem: mapObservationSource(ctx.observationSource),
      dataCategory: normalizeDataCategories([ctx.dataCategory])[0],
      purpose: ctx.purpose,
      action: ctx.action,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
      serviceIdentity: ctx.serviceIdentity,
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: ctx.vehicleId,
      vehicleId: ctx.vehicleId,
      correlationId: ctx.correlationId,
      effectiveTimestamp: ctx.effectiveTimestamp ?? null,
      actorType: AuthorizationActorType.SYSTEM,
    };
  }

  private scopeDeny(ctx: VehicleHealthGateContext, reasonCodes: string[]): VehicleHealthGateResult {
    return {
      mayProceed: false,
      decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
      enforced: true,
      isShadowMode: false,
      shouldRetry: false,
      isAuthorizationDeny: true,
      reasonCode: reasonCodes[0] ?? 'SCOPE_MISMATCH',
      reasonCodes,
      correlationId: ctx.correlationId,
      auditEventId: null,
    };
  }

  private async recordSkipped(
    ctx: VehicleHealthGateContext,
    decision: Awaited<ReturnType<AuthorizationDecisionService['decide']>>,
    kind: string,
  ): Promise<void> {
    try {
      await this.auditService.recordIngestionSkipped({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        sourceSystem: mapObservationSource(ctx.observationSource),
        dataCategory: ctx.dataCategory,
        purpose: ctx.purpose,
        ingestionPath: `${ctx.processingPath}:${kind}`,
        serviceIdentity: ctx.serviceIdentity,
        correlationId: decision.correlationId,
        reasonCode: decision.reasonCode,
        reasonCodes: decision.reasonCodes,
        policyVersion: decision.policyVersion,
        matchedPolicyId: decision.matchedPolicyId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record health skip audit path=${ctx.processingPath}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private recordMetric(
    ctx: VehicleHealthGateContext,
    outcome: Parameters<VehicleHealthEnforcementMetricsService['record']>[0]['outcome'],
  ): void {
    this.metrics.record({
      path: ctx.processingPath,
      action: ctx.action,
      dataCategory: ctx.dataCategory,
      outcome,
    });
  }

  private kindForAction(
    action: VehicleHealthGateContext['action'],
  ): 'ingest' | 'derive' | 'read' | 'export' | 'use_for_ai' {
    switch (action) {
      case AUTHORIZATION_DECISION_ACTION.DERIVE:
        return 'derive';
      case AUTHORIZATION_DECISION_ACTION.READ:
        return 'read';
      case AUTHORIZATION_DECISION_ACTION.EXPORT:
        return 'export';
      case AUTHORIZATION_DECISION_ACTION.USE_FOR_AI:
        return 'use_for_ai';
      default:
        return 'ingest';
    }
  }
}

function mapObservationSource(
  source?: VehicleHealthGateContext['observationSource'],
): (typeof POLICY_RESOLVER_SOURCE_SYSTEM)[keyof typeof POLICY_RESOLVER_SOURCE_SYSTEM] {
  if (source === VEHICLE_HEALTH_OBSERVATION_SOURCE.MANUAL) {
    return POLICY_RESOLVER_SOURCE_SYSTEM.MANUAL_UPLOAD;
  }
  return POLICY_RESOLVER_SOURCE_SYSTEM.DIMO;
}
