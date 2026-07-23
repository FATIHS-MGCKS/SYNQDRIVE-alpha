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
  type PolicyResolverSourceSystem,
} from '../policy-resolver/policy-resolver.constants';
import { normalizeDataCategories } from '../data-authorization-risk.util';
import { readTelemetryIngestionEnforcementConfig } from './telemetry-ingestion-enforcement.config';
import { TelemetryIngestionEnforcementMetricsService } from './telemetry-ingestion-enforcement.metrics';
import type {
  TelemetryIngestGateContext,
  TelemetryIngestGateResult,
} from './telemetry-ingestion-enforcement.types';

/**
 * Central ingest authorization gate — runs INGEST decision before any raw persist.
 * No legacy OrgDataAuthorization fallback. Provider errors remain separate (throw upstream).
 */
@Injectable()
export class TelemetryIngestionEnforcementService {
  private readonly logger = new Logger(TelemetryIngestionEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly auditService: DataAuthorizationAuditService,
    private readonly metrics: TelemetryIngestionEnforcementMetricsService,
  ) {}

  async evaluateIngest(ctx: TelemetryIngestGateContext): Promise<TelemetryIngestGateResult> {
    const config = readTelemetryIngestionEnforcementConfig();

    if (!ctx.organizationId?.trim() || !ctx.vehicleId?.trim()) {
      this.recordMetric(ctx, 'scope_mismatch');
      return this.buildScopeDeny(ctx, ['SCOPE_MISMATCH']);
    }

    const tenantOk = await this.assertTenantVehicle(ctx.organizationId, ctx.vehicleId);
    if (!tenantOk) {
      this.recordMetric(ctx, 'scope_mismatch');
      return this.buildScopeDeny(ctx, ['TENANT_MISMATCH']);
    }

    const decisionRequest = this.toDecisionRequest(ctx);
    const decision = await this.authorizationDecision.decide(decisionRequest);

    const isPolicyShadow =
      decision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY;
    const isAllow = decision.decision === AUTHORIZATION_DECISION_OUTCOME.ALLOW;
    const isDeny = decision.decision === AUTHORIZATION_DECISION_OUTCOME.DENY;

    if (isAllow || isPolicyShadow) {
      this.recordMetric(
        ctx,
        isPolicyShadow ? 'shadow_would_deny' : 'allow',
      );
      return {
        mayPersist: true,
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

    if (isDeny) {
      const resolverError = decision.reasonCodes.includes(
        AUTHORIZATION_DECISION_REASON.RESOLVER_ERROR,
      ) || decision.reasonCodes.includes(AUTHORIZATION_DECISION_REASON.DATABASE_ERROR);

      if (resolverError) {
        this.recordMetric(ctx, 'resolver_error');
      }

      const failClosed = config.failClosed && !config.shadowMode;
      const mayPersist = !failClosed;

      if (!mayPersist) {
        await this.recordIngestionSkipped(ctx, decision);
        this.recordMetric(ctx, 'ingestion_skipped');
      } else {
        this.recordMetric(ctx, 'deny');
        this.logger.warn(
          `Ingest shadow DENY path=${ctx.ingestionPath} org=${ctx.organizationId} vehicle=${ctx.vehicleId} reason=${decision.reasonCode} correlation=${decision.correlationId}`,
        );
      }

      return {
        mayPersist,
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

    this.recordMetric(ctx, 'allow');
    return {
      mayPersist: true,
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

  /** Throws only on infrastructure errors — authorization DENY returns gate result via evaluateIngest. */
  async assertMayPersist(ctx: TelemetryIngestGateContext): Promise<TelemetryIngestGateResult> {
    return this.evaluateIngest(ctx);
  }

  private async assertTenantVehicle(
    organizationId: string,
    vehicleId: string,
  ): Promise<boolean> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    return !!vehicle;
  }

  private toDecisionRequest(ctx: TelemetryIngestGateContext): AuthorizationDecisionRequest {
    const sourceSystem = mapIngestSourceSystem(ctx.sourceSystem);
    const normalizedCategory = normalizeDataCategories([ctx.dataCategory])[0];

    return {
      organizationId: ctx.organizationId,
      sourceSystem,
      dataCategory: normalizedCategory,
      purpose: ctx.purpose,
      action: AUTHORIZATION_DECISION_ACTION.INGEST,
      processorType: mapIngestProcessorType(ctx.sourceSystem),
      serviceIdentity: ctx.serviceIdentity,
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: ctx.vehicleId,
      vehicleId: ctx.vehicleId,
      correlationId: ctx.correlationId,
      effectiveTimestamp: ctx.effectiveTimestamp ?? null,
      actorType: AuthorizationActorType.SYSTEM,
    };
  }

  private buildScopeDeny(
    ctx: TelemetryIngestGateContext,
    reasonCodes: string[],
  ): TelemetryIngestGateResult {
    return {
      mayPersist: false,
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

  private async recordIngestionSkipped(
    ctx: TelemetryIngestGateContext,
    decision: Awaited<ReturnType<AuthorizationDecisionService['decide']>>,
  ): Promise<void> {
    try {
      await this.auditService.recordIngestionSkipped({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        sourceSystem: mapIngestSourceSystem(ctx.sourceSystem),
        dataCategory: ctx.dataCategory,
        purpose: ctx.purpose,
        ingestionPath: ctx.ingestionPath,
        serviceIdentity: ctx.serviceIdentity,
        correlationId: decision.correlationId,
        reasonCode: decision.reasonCode,
        reasonCodes: decision.reasonCodes,
        policyVersion: decision.policyVersion,
        matchedPolicyId: decision.matchedPolicyId,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record INGESTION_SKIPPED audit path=${ctx.ingestionPath} correlation=${decision.correlationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private recordMetric(
    ctx: TelemetryIngestGateContext,
    outcome: Parameters<TelemetryIngestionEnforcementMetricsService['record']>[0]['outcome'],
  ): void {
    this.metrics.record({
      path: ctx.ingestionPath,
      sourceSystem: String(ctx.sourceSystem),
      dataCategory: ctx.dataCategory,
      outcome,
    });
  }
}

function mapIngestSourceSystem(
  source: TelemetryIngestGateContext['sourceSystem'],
): PolicyResolverSourceSystem {
  if (source === 'HIGH_MOBILITY') {
    return POLICY_RESOLVER_SOURCE_SYSTEM.HIGH_MOBILITY;
  }
  const key = source as keyof typeof POLICY_RESOLVER_SOURCE_SYSTEM;
  if (key in POLICY_RESOLVER_SOURCE_SYSTEM) {
    return POLICY_RESOLVER_SOURCE_SYSTEM[key];
  }
  return POLICY_RESOLVER_SOURCE_SYSTEM.API_INTEGRATION;
}

function mapIngestProcessorType(
  source: TelemetryIngestGateContext['sourceSystem'],
): AuthorizationDecisionRequest['processorType'] {
  if (source === POLICY_RESOLVER_SOURCE_SYSTEM.DIMO || source === 'HIGH_MOBILITY') {
    return POLICY_RESOLVER_PROCESSOR_TYPE.PROVIDER_PLATFORM;
  }
  return POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE;
}
