import { Injectable, Logger, Optional } from '@nestjs/common';
import { AuthorizationActorType, NotificationDeliveryOutboxStatus, NotificationStatus, Prisma } from '@prisma/client';
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
import { DrivingBehaviorEnforcementService } from '../driving-behavior-enforcement/driving-behavior-enforcement.service';
import { VehicleHealthEnforcementService } from '../vehicle-health-enforcement/vehicle-health-enforcement.service';
import {
  listEventTypesForDataCategory,
  resolveNotificationAuthGate,
} from './notification-authorization.registry';
import { readNotificationEnforcementConfig } from './notification-enforcement.config';
import {
  NOTIFICATION_AUTH_DENY_REASON,
  NOTIFICATION_ENFORCEMENT_PATH,
  NOTIFICATION_ENFORCEMENT_SERVICE_IDENTITY,
  NOTIFICATION_GATE_KIND,
} from './notification-enforcement.constants';
import { NotificationEnforcementMetricsService } from './notification-enforcement.metrics';
import type {
  NotificationAuthCache,
  NotificationAuthContext,
  NotificationAuthDecisionResult,
  NotificationAuthGateSpec,
} from './notification-enforcement.types';
import { buildNotificationAuthCacheKey } from './notification-enforcement.types';

/**
 * Central notification authorization — NOTIFY as explicit action.
 * Technical monitoring alerts are separated from user-facing privacy-gated notifications.
 */
@Injectable()
export class NotificationEnforcementService {
  private readonly logger = new Logger(NotificationEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly auditService: DataAuthorizationAuditService,
    private readonly metrics: NotificationEnforcementMetricsService,
    @Optional() private readonly healthEnforcement?: VehicleHealthEnforcementService,
    @Optional() private readonly behaviorEnforcement?: DrivingBehaviorEnforcementService,
  ) {}

  async checkIngest(
    ctx: NotificationAuthContext,
    cache?: NotificationAuthCache,
  ): Promise<NotificationAuthDecisionResult> {
    return this.checkPhase(ctx, 'ingest', cache);
  }

  async checkDelivery(
    ctx: NotificationAuthContext,
    cache?: NotificationAuthCache,
  ): Promise<NotificationAuthDecisionResult> {
    return this.checkPhase(ctx, 'delivery', cache);
  }

  async checkDeepLink(
    ctx: NotificationAuthContext,
    cache?: NotificationAuthCache,
  ): Promise<NotificationAuthDecisionResult> {
    return this.checkPhase(ctx, 'deep_link', cache);
  }

  /**
   * Revocation: resolve active notifications and cancel pending delivery for affected event types.
   */
  async handleRevocation(input: {
    organizationId: string;
    dataCategory: string;
    purpose?: string;
    vehicleId?: string;
    correlationId: string;
  }): Promise<{ resolvedCount: number; cancelledDeliveries: number }> {
    const eventTypes = listEventTypesForDataCategory(input.dataCategory);
    if (eventTypes.length === 0) {
      return { resolvedCount: 0, cancelledDeliveries: 0 };
    }

    const now = new Date();
    const where: Prisma.NotificationWhereInput = {
      organizationId: input.organizationId,
      eventType: { in: eventTypes },
      status: { in: [NotificationStatus.OPEN, NotificationStatus.ACKNOWLEDGED] },
      ...(input.vehicleId
        ? { entityType: 'VEHICLE', entityId: input.vehicleId }
        : {}),
    };

    const active = await this.prisma.notification.findMany({
      where,
      select: { id: true, eventType: true },
    });

    let cancelledDeliveries = 0;
    if (active.length > 0) {
      const ids = active.map((n) => n.id);
      await this.prisma.notification.updateMany({
        where: { id: { in: ids } },
        data: {
          status: NotificationStatus.RESOLVED,
          resolvedAt: now,
        },
      });

      const cancelled = await this.prisma.notificationDeliveryOutbox.updateMany({
        where: {
          notificationId: { in: ids },
          status: NotificationDeliveryOutboxStatus.PENDING,
        },
        data: {
          status: NotificationDeliveryOutboxStatus.SUPPRESSED,
          lastError: NOTIFICATION_AUTH_DENY_REASON.REVOKED,
          processedAt: now,
        },
      });
      cancelledDeliveries = cancelled.count;

      for (const row of active) {
        this.metrics.record({
          eventType: row.eventType,
          phase: 'revocation',
          outcome: 'revoked',
        });
      }

      this.logger.warn(
        `Notification revocation org=${input.organizationId} category=${input.dataCategory} ` +
          `resolved=${active.length} cancelledDeliveries=${cancelledDeliveries}`,
      );
    }

    return { resolvedCount: active.length, cancelledDeliveries };
  }

  resolveGateSpec(eventType: string): NotificationAuthGateSpec {
    return resolveNotificationAuthGate(eventType);
  }

  isTechnicalMonitoring(eventType: string): boolean {
    return resolveNotificationAuthGate(eventType).gateKind === NOTIFICATION_GATE_KIND.TECHNICAL_MONITORING;
  }

  private async checkPhase(
    ctx: NotificationAuthContext,
    phase: 'ingest' | 'delivery' | 'deep_link',
    cache?: NotificationAuthCache,
  ): Promise<NotificationAuthDecisionResult> {
    const spec = resolveNotificationAuthGate(ctx.eventType);
    const cacheKey = buildNotificationAuthCacheKey(ctx);

    if (cache) {
      const cached = cache.get(cacheKey);
      if (cached) {
        this.metrics.record({ eventType: ctx.eventType, phase, outcome: 'cache_hit' });
        return { ...cached, fromCache: true };
      }
    }

    if (ctx.upstreamAllowed === false) {
      const blocked = this.buildDeny(
        spec,
        ctx,
        NOTIFICATION_AUTH_DENY_REASON.DERIVED_DATA_BLOCKED,
        [NOTIFICATION_AUTH_DENY_REASON.DERIVED_DATA_BLOCKED],
      );
      this.metrics.record({ eventType: ctx.eventType, phase, outcome: 'upstream_blocked' });
      if (cache) cache.set(cacheKey, blocked);
      return blocked;
    }

    if (!ctx.organizationId?.trim()) {
      const denied = this.buildDeny(spec, ctx, NOTIFICATION_AUTH_DENY_REASON.TENANT_MISMATCH, [
        'SCOPE_MISMATCH',
      ]);
      this.metrics.record({ eventType: ctx.eventType, phase, outcome: 'tenant_mismatch' });
      if (cache) cache.set(cacheKey, denied);
      return denied;
    }

    if (ctx.vehicleId) {
      const tenantOk = await this.prisma.vehicle.findFirst({
        where: { id: ctx.vehicleId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!tenantOk) {
        const denied = this.buildDeny(spec, ctx, NOTIFICATION_AUTH_DENY_REASON.TENANT_MISMATCH, [
          'TENANT_MISMATCH',
        ]);
        this.metrics.record({ eventType: ctx.eventType, phase, outcome: 'tenant_mismatch' });
        if (cache) cache.set(cacheKey, denied);
        return denied;
      }
    }

    const result = await this.evaluateGate(spec, ctx, phase);
    if (cache) cache.set(cacheKey, result);
    return result;
  }

  private async evaluateGate(
    spec: NotificationAuthGateSpec,
    ctx: NotificationAuthContext,
    phase: 'ingest' | 'delivery' | 'deep_link',
  ): Promise<NotificationAuthDecisionResult> {
    const processingPath =
      phase === 'delivery'
        ? NOTIFICATION_ENFORCEMENT_PATH.NOTIFICATION_DELIVERY
        : phase === 'deep_link'
          ? NOTIFICATION_ENFORCEMENT_PATH.NOTIFICATION_DEEP_LINK
          : spec.processingPath;

    const serviceIdentity =
      phase === 'delivery'
        ? NOTIFICATION_ENFORCEMENT_SERVICE_IDENTITY.NOTIFICATION_DELIVERY
        : phase === 'deep_link'
          ? NOTIFICATION_ENFORCEMENT_SERVICE_IDENTITY.NOTIFICATION_API
          : spec.serviceIdentity;

    if (
      spec.gateKind === NOTIFICATION_GATE_KIND.OPERATIONAL ||
      spec.gateKind === NOTIFICATION_GATE_KIND.TECHNICAL_MONITORING
    ) {
      const allow = this.buildAllow(spec, ctx, 'OPERATIONAL_ALLOW');
      this.metrics.record({ eventType: ctx.eventType, phase, outcome: 'allow' });
      return allow;
    }

    const config = readNotificationEnforcementConfig();
    let mayProceed = false;
    let decisionOutcome: (typeof AUTHORIZATION_DECISION_OUTCOME)[keyof typeof AUTHORIZATION_DECISION_OUTCOME] =
      AUTHORIZATION_DECISION_OUTCOME.ALLOW;
    let reasonCode = 'POLICY_MATCH';
    let reasonCodes: string[] = ['POLICY_MATCH'];
    let auditEventId: string | null = null;
    let correlationId = ctx.correlationId;
    let enforced = false;
    let isShadowMode = false;

    if (spec.gateKind === NOTIFICATION_GATE_KIND.HEALTH_ALERT && this.healthEnforcement) {
      mayProceed = await this.healthEnforcement.mayNotify({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId!,
        dataCategory: spec.dataCategory!,
        purpose: spec.purpose!,
        processingPath,
        serviceIdentity,
        correlationId: ctx.correlationId,
        effectiveTimestamp: ctx.effectiveTimestamp ?? null,
      });
    } else if (spec.gateKind === NOTIFICATION_GATE_KIND.DRIVING_ALERT && this.behaviorEnforcement) {
      mayProceed = await this.behaviorEnforcement.mayNotify({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId!,
        dataCategory: spec.dataCategory!,
        purpose: spec.purpose!,
        processingPath,
        serviceIdentity,
        correlationId: ctx.correlationId,
        bookingId: ctx.bookingId ?? undefined,
        customerId: ctx.customerId ?? undefined,
        effectiveTimestamp: ctx.effectiveTimestamp ?? null,
      });
    } else if (spec.dataCategory && spec.purpose) {
      const decision = await this.authorizationDecision.decide(
        this.toDecisionRequest(spec, ctx, processingPath, serviceIdentity),
      );
      mayProceed =
        decision.decision === AUTHORIZATION_DECISION_OUTCOME.ALLOW ||
        decision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY;
      decisionOutcome =
        decision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY
          ? AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY
          : decision.decision === AUTHORIZATION_DECISION_OUTCOME.ALLOW
            ? AUTHORIZATION_DECISION_OUTCOME.ALLOW
            : AUTHORIZATION_DECISION_OUTCOME.DENY;
      reasonCode = decision.reasonCode;
      reasonCodes = decision.reasonCodes;
      auditEventId = decision.auditEventId;
      correlationId = decision.correlationId;
      enforced = decision.enforced;
      isShadowMode = decision.isShadowMode;
    } else {
      mayProceed = true;
    }

    if (!mayProceed) {
      const failClosed = config.failClosed && !config.shadowMode;
      const denied = this.buildDeny(spec, ctx, reasonCode, reasonCodes, {
        decision: failClosed
          ? AUTHORIZATION_DECISION_OUTCOME.DENY
          : AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY,
        enforced: failClosed,
        isShadowMode: config.shadowMode && !failClosed,
        auditEventId,
        correlationId,
      });
      if (failClosed) {
        await this.recordSkipped(ctx, spec, denied, phase);
      }
      this.metrics.record({
        eventType: ctx.eventType,
        phase,
        outcome: failClosed ? 'deny' : 'shadow_would_deny',
      });
      this.logger.warn(
        `Notification ${phase} denied event=${ctx.eventType} org=${ctx.organizationId} reason=${reasonCode}`,
      );
      return denied;
    }

    const allow = this.buildAllow(spec, ctx, reasonCode, {
      decision: decisionOutcome,
      enforced,
      isShadowMode,
      auditEventId,
      correlationId,
    });
    this.metrics.record({
      eventType: ctx.eventType,
      phase,
      outcome: decisionOutcome === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY
        ? 'shadow_would_deny'
        : 'allow',
    });
    return allow;
  }

  private toDecisionRequest(
    spec: NotificationAuthGateSpec,
    ctx: NotificationAuthContext,
    processingPath: string,
    serviceIdentity: string,
  ): AuthorizationDecisionRequest {
    return {
      organizationId: ctx.organizationId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
      dataCategory: normalizeDataCategories([spec.dataCategory!])[0],
      purpose: spec.purpose!,
      action: AUTHORIZATION_DECISION_ACTION.NOTIFY,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
      serviceIdentity,
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: ctx.vehicleId ?? ctx.entityId ?? ctx.organizationId,
      vehicleId: ctx.vehicleId ?? null,
      customerId: ctx.customerId ?? null,
      bookingId: ctx.bookingId ?? null,
      correlationId: ctx.correlationId,
      effectiveTimestamp: ctx.effectiveTimestamp ?? null,
      actorType: AuthorizationActorType.SYSTEM,
    };
  }

  private buildAllow(
    spec: NotificationAuthGateSpec,
    ctx: NotificationAuthContext,
    reasonCode: string,
    extra?: Partial<NotificationAuthDecisionResult>,
  ): NotificationAuthDecisionResult {
    return {
      mayProceed: true,
      gateKind: spec.gateKind,
      decision: AUTHORIZATION_DECISION_OUTCOME.ALLOW,
      enforced: false,
      isShadowMode: false,
      isAuthorizationDeny: false,
      reasonCode,
      reasonCodes: [reasonCode],
      correlationId: ctx.correlationId,
      auditEventId: null,
      decisionEventId: extra?.auditEventId ?? null,
      fromCache: false,
      ...extra,
    };
  }

  private buildDeny(
    spec: NotificationAuthGateSpec,
    ctx: NotificationAuthContext,
    reasonCode: string,
    reasonCodes: string[],
    extra?: Partial<NotificationAuthDecisionResult>,
  ): NotificationAuthDecisionResult {
    return {
      mayProceed: false,
      gateKind: spec.gateKind,
      decision: AUTHORIZATION_DECISION_OUTCOME.DENY,
      enforced: true,
      isShadowMode: false,
      isAuthorizationDeny: true,
      reasonCode,
      reasonCodes,
      correlationId: extra?.correlationId ?? ctx.correlationId,
      auditEventId: extra?.auditEventId ?? null,
      decisionEventId: extra?.auditEventId ?? null,
      fromCache: false,
      ...extra,
    };
  }

  private async recordSkipped(
    ctx: NotificationAuthContext,
    spec: NotificationAuthGateSpec,
    result: NotificationAuthDecisionResult,
    phase: string,
  ): Promise<void> {
    try {
      await this.auditService.recordIngestionSkipped({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId ?? ctx.entityId ?? ctx.organizationId,
        sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
        dataCategory: spec.dataCategory ?? 'OPERATIONAL',
        purpose: spec.purpose ?? 'ALERTS',
        ingestionPath: `${spec.processingPath}:${phase}`,
        serviceIdentity: spec.serviceIdentity,
        correlationId: result.correlationId,
        reasonCode: result.reasonCode,
        reasonCodes: result.reasonCodes,
        policyVersion: null,
        matchedPolicyId: null,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record notification skip audit event=${ctx.eventType}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  extractVehicleIdFromCandidate(input: {
    entityType: string;
    entityId: string;
    actionTarget?: Record<string, unknown>;
    templateParams?: Record<string, unknown>;
  }): string | null {
    if (input.entityType === 'VEHICLE') return input.entityId;
    const target = input.actionTarget ?? {};
    if (typeof target.vehicleId === 'string') return target.vehicleId;
    const params = input.templateParams ?? {};
    if (typeof params.vehicleId === 'string') return params.vehicleId;
    return null;
  }
}
