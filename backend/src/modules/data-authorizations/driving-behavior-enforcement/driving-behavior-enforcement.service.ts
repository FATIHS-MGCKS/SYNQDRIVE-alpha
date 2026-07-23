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
import { readDrivingBehaviorEnforcementConfig } from './driving-behavior-enforcement.config';
import { DrivingBehaviorEnforcementMetricsService } from './driving-behavior-enforcement.metrics';
import type {
  DrivingBehaviorGateContext,
  DrivingBehaviorGateResult,
} from './driving-behavior-enforcement.types';
import {
  DRIVING_BEHAVIOR_ACTION,
  DRIVING_BEHAVIOR_DERIVE_PURPOSES,
  DRIVING_BEHAVIOR_PROFILING_PURPOSES,
} from './driving-behavior-enforcement.constants';
import { DrivingBehaviorAccessDeniedException } from './driving-behavior-enforcement.exceptions';

/**
 * Driving behavior / misuse / profiling authorization.
 * Separates technical DERIVE from explicit PROFILE; READ/EXPORT/USE_FOR_AI/NOTIFY are distinct.
 * Profiling cannot be implied by general telemetry (FLEET_ANALYTICS) policies.
 */
@Injectable()
export class DrivingBehaviorEnforcementService {
  private readonly logger = new Logger(DrivingBehaviorEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecision: AuthorizationDecisionService,
    private readonly auditService: DataAuthorizationAuditService,
    private readonly metrics: DrivingBehaviorEnforcementMetricsService,
  ) {}

  async evaluate(ctx: DrivingBehaviorGateContext): Promise<DrivingBehaviorGateResult> {
    return this.evaluateMutating(ctx, this.kindForAction(ctx.action));
  }

  async mayDerive(ctx: Omit<DrivingBehaviorGateContext, 'action'>): Promise<boolean> {
    if (!DRIVING_BEHAVIOR_DERIVE_PURPOSES.has(ctx.purpose)) {
      this.recordMetric(
        { ...ctx, action: DRIVING_BEHAVIOR_ACTION.DERIVE },
        'purpose_mismatch',
        DRIVING_BEHAVIOR_ACTION.DERIVE,
      );
      return false;
    }
    return (await this.evaluate({ ...ctx, action: DRIVING_BEHAVIOR_ACTION.DERIVE })).mayProceed;
  }

  async mayProfile(ctx: Omit<DrivingBehaviorGateContext, 'action'>): Promise<boolean> {
    if (!DRIVING_BEHAVIOR_PROFILING_PURPOSES.has(ctx.purpose)) {
      this.recordMetric(
        { ...ctx, action: DRIVING_BEHAVIOR_ACTION.PROFILE },
        'purpose_mismatch',
        DRIVING_BEHAVIOR_ACTION.PROFILE,
      );
      return false;
    }
    return (await this.evaluate({ ...ctx, action: DRIVING_BEHAVIOR_ACTION.PROFILE })).mayProceed;
  }

  async isReadAllowed(ctx: Omit<DrivingBehaviorGateContext, 'action'>): Promise<boolean> {
    return (await this.evaluate({ ...ctx, action: DRIVING_BEHAVIOR_ACTION.READ })).mayProceed;
  }

  async mayUseForAi(ctx: Omit<DrivingBehaviorGateContext, 'action'>): Promise<boolean> {
    return (await this.evaluate({ ...ctx, action: DRIVING_BEHAVIOR_ACTION.USE_FOR_AI })).mayProceed;
  }

  async mayExport(ctx: Omit<DrivingBehaviorGateContext, 'action'>): Promise<boolean> {
    return (await this.evaluate({ ...ctx, action: DRIVING_BEHAVIOR_ACTION.EXPORT })).mayProceed;
  }

  async mayNotify(ctx: Omit<DrivingBehaviorGateContext, 'action'>): Promise<boolean> {
    return (await this.evaluate({ ...ctx, action: DRIVING_BEHAVIOR_ACTION.NOTIFY })).mayProceed;
  }

  async assertRead(ctx: Omit<DrivingBehaviorGateContext, 'action'>): Promise<void> {
    const allowed = await this.isReadAllowed(ctx);
    if (!allowed) {
      throw new DrivingBehaviorAccessDeniedException('BEHAVIOR_READ_DENIED', ctx.correlationId);
    }
  }

  emptyDriverScoreSummary(subjectType: string, subjectId: string) {
    return {
      subjectType,
      subjectId,
      tripCount: 0,
      scoredTripCount: 0,
      totalDistanceKm: 0,
      drivingStressScore: null,
      stressLevel: null,
      assignmentCoveragePct: 0,
      hasEnoughData: false,
      dataConfidence: 'none' as const,
      accessDenied: true,
    };
  }

  redactBehaviorEvents<T extends { latitude?: number | null; longitude?: number | null }>(
    events: T[],
    allowed: boolean,
  ): T[] {
    if (allowed) return events;
    return events.map((e) => ({ ...e, latitude: null, longitude: null }));
  }

  async resolveOrganizationId(vehicleId: string): Promise<string | null> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { organizationId: true },
    });
    return vehicle?.organizationId ?? null;
  }

  private async evaluateMutating(
    ctx: DrivingBehaviorGateContext,
    kind: 'derive' | 'profile' | 'read' | 'export' | 'use_for_ai' | 'notify',
  ): Promise<DrivingBehaviorGateResult> {
    const config = readDrivingBehaviorEnforcementConfig();

    if (!ctx.organizationId?.trim() || !ctx.vehicleId?.trim()) {
      this.recordMetric(ctx, 'scope_mismatch', ctx.action);
      return this.scopeDeny(ctx, ['SCOPE_MISMATCH']);
    }

    const tenantOk = await this.prisma.vehicle.findFirst({
      where: { id: ctx.vehicleId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!tenantOk) {
      this.recordMetric(ctx, 'scope_mismatch', ctx.action);
      return this.scopeDeny(ctx, ['TENANT_MISMATCH']);
    }

    if (ctx.bookingId) {
      const booking = await this.prisma.booking.findFirst({
        where: {
          id: ctx.bookingId,
          organizationId: ctx.organizationId,
          vehicleId: ctx.vehicleId,
        },
        select: { id: true },
      });
      if (!booking) {
        this.recordMetric(ctx, 'scope_mismatch', ctx.action);
        return this.scopeDeny(ctx, ['SCOPE_MISMATCH']);
      }
    }

    const decision = await this.authorizationDecision.decide(this.toDecisionRequest(ctx));

    const isAllow = decision.decision === AUTHORIZATION_DECISION_OUTCOME.ALLOW;
    const isPolicyShadow =
      decision.decision === AUTHORIZATION_DECISION_OUTCOME.SHADOW_WOULD_DENY;

    if (isAllow || isPolicyShadow) {
      this.recordMetric(ctx, isPolicyShadow ? 'shadow_would_deny' : 'allow', ctx.action);
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
      this.recordMetric(ctx, 'resolver_error', ctx.action);
    }

    const failClosed = config.failClosed && !config.shadowMode;
    const mayProceed = !failClosed;

    if (!mayProceed) {
      await this.recordSkipped(ctx, decision, kind);
      this.recordMetric(ctx, 'skipped', ctx.action);
    } else {
      this.recordMetric(ctx, 'deny', ctx.action);
      this.logger.warn(
        `Driving behavior ${kind} shadow DENY path=${ctx.processingPath} org=${ctx.organizationId} vehicle=${ctx.vehicleId} reason=${decision.reasonCode}`,
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

  private toDecisionRequest(ctx: DrivingBehaviorGateContext): AuthorizationDecisionRequest {
    return {
      organizationId: ctx.organizationId,
      sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
      dataCategory: normalizeDataCategories([ctx.dataCategory])[0],
      purpose: ctx.purpose,
      action: ctx.action,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
      serviceIdentity: ctx.serviceIdentity,
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: ctx.vehicleId,
      vehicleId: ctx.vehicleId,
      customerId: ctx.customerId ?? null,
      bookingId: ctx.bookingId ?? null,
      correlationId: ctx.correlationId,
      effectiveTimestamp: ctx.effectiveTimestamp ?? null,
      actorType: AuthorizationActorType.SYSTEM,
    };
  }

  private scopeDeny(
    ctx: DrivingBehaviorGateContext,
    reasonCodes: string[],
  ): DrivingBehaviorGateResult {
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
    ctx: DrivingBehaviorGateContext,
    decision: Awaited<ReturnType<AuthorizationDecisionService['decide']>>,
    kind: string,
  ): Promise<void> {
    try {
      await this.auditService.recordIngestionSkipped({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        sourceSystem: POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
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
        `Failed to record driving-behavior skip audit path=${ctx.processingPath}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private recordMetric(
    ctx: DrivingBehaviorGateContext,
    outcome: Parameters<DrivingBehaviorEnforcementMetricsService['record']>[0]['outcome'],
    action: DrivingBehaviorGateContext['action'],
  ): void {
    this.metrics.record({
      path: ctx.processingPath,
      action,
      dataCategory: ctx.dataCategory,
      outcome,
    });
  }

  private kindForAction(
    action: DrivingBehaviorGateContext['action'],
  ): 'derive' | 'profile' | 'read' | 'export' | 'use_for_ai' | 'notify' {
    switch (action) {
      case AUTHORIZATION_DECISION_ACTION.PROFILE:
        return 'profile';
      case AUTHORIZATION_DECISION_ACTION.READ:
        return 'read';
      case AUTHORIZATION_DECISION_ACTION.EXPORT:
        return 'export';
      case AUTHORIZATION_DECISION_ACTION.USE_FOR_AI:
        return 'use_for_ai';
      case AUTHORIZATION_DECISION_ACTION.NOTIFY:
        return 'notify';
      default:
        return 'derive';
    }
  }
}
