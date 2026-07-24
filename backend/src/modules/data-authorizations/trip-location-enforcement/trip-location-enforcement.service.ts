import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { AuthorizationActorType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import {
  AUTHORIZATION_DECISION_ACTION,
  AUTHORIZATION_DECISION_OUTCOME,
  AUTHORIZATION_DECISION_REASON,
} from '../authorization-decision-engine/authorization-decision.constants';
import type { AuthorizationDecisionRequest } from '../authorization-decision-engine/authorization-decision.types';
import { LiveGpsEnforcementService, type LiveGpsReadContext } from '../live-gps-enforcement/live-gps-enforcement.service';
import { LIVE_GPS_DATA_CATEGORY } from '../live-gps-enforcement/live-gps-enforcement.constants';
import { DataAuthorizationAuditService } from '../privacy-domain/audit-log/data-authorization-audit.service';
import {
  POLICY_RESOLVER_PROCESSOR_TYPE,
  POLICY_RESOLVER_RESOURCE_TYPE,
  POLICY_RESOLVER_SOURCE_SYSTEM,
} from '../policy-resolver/policy-resolver.constants';
import { normalizeDataCategories } from '../data-authorization-risk.util';
import { readTripLocationEnforcementConfig } from './trip-location-enforcement.config';
import { TripLocationEnforcementMetricsService } from './trip-location-enforcement.metrics';
import type {
  TripCoordinateSummary,
  TripLocationGateContext,
  TripLocationGateResult,
} from './trip-location-enforcement.types';
import {
  TRIP_LOCATION_ACTION,
  TRIP_LOCATION_PURPOSE,
} from './trip-location-enforcement.constants';

/**
 * Trip + location history authorization — INGEST, DERIVE, READ, EXPORT.
 * No legacy OrgDataAuthorization fallback for mutate/derive paths.
 */
@Injectable()
export class TripLocationEnforcementService {
  private readonly logger = new Logger(TripLocationEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationDecision: AuthorizationDecisionService,
    @Inject(forwardRef(() => LiveGpsEnforcementService))
    private readonly liveGpsEnforcement: LiveGpsEnforcementService,
    private readonly auditService: DataAuthorizationAuditService,
    private readonly metrics: TripLocationEnforcementMetricsService,
  ) {}

  async evaluate(ctx: TripLocationGateContext): Promise<TripLocationGateResult> {
    if (ctx.action === AUTHORIZATION_DECISION_ACTION.READ) {
      return this.evaluateRead(ctx);
    }
    if (ctx.action === AUTHORIZATION_DECISION_ACTION.EXPORT) {
      return this.evaluateMutating(ctx, 'export');
    }
    if (ctx.action === AUTHORIZATION_DECISION_ACTION.DERIVE) {
      return this.evaluateMutating(ctx, 'derive');
    }
    return this.evaluateMutating(ctx, 'ingest');
  }

  async mayIngest(ctx: Omit<TripLocationGateContext, 'action'>): Promise<boolean> {
    const result = await this.evaluate({ ...ctx, action: TRIP_LOCATION_ACTION.INGEST });
    return result.mayProceed;
  }

  async mayDerive(ctx: Omit<TripLocationGateContext, 'action'>): Promise<boolean> {
    const result = await this.evaluate({ ...ctx, action: TRIP_LOCATION_ACTION.DERIVE });
    return result.mayProceed;
  }

  async isReadAllowed(ctx: Omit<TripLocationGateContext, 'action'>): Promise<boolean> {
    const result = await this.evaluate({ ...ctx, action: TRIP_LOCATION_ACTION.READ });
    return result.mayProceed;
  }

  async assertRead(ctx: Omit<TripLocationGateContext, 'action'>): Promise<void> {
    await this.liveGpsEnforcement.assertVehicleGpsRead(this.toLiveGpsReadContext(ctx));
  }

  async assertExport(ctx: Omit<TripLocationGateContext, 'action'>): Promise<TripLocationGateResult> {
    return this.evaluate({ ...ctx, action: TRIP_LOCATION_ACTION.EXPORT });
  }

  async assertCustomerScope(organizationId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found in organization');
    }
  }

  async assertBookingScope(
    organizationId: string,
    bookingId: string,
    vehicleId: string,
  ): Promise<void> {
    const booking = await this.prisma.booking.findFirst({
      where: {
        id: bookingId,
        organizationId,
        vehicleId,
      },
      select: { id: true },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found for vehicle in organization');
    }
  }

  async applyTripSummaryGate<T extends TripCoordinateSummary>(
    organizationId: string,
    trips: T[],
    correlationPrefix: string,
  ): Promise<T[]> {
    if (trips.length === 0) return trips;
    const vehicleIds = [...new Set(trips.map((t) => t.vehicleId).filter(Boolean) as string[])];
    const allowedByVehicle = new Map<string, boolean>();
    await Promise.all(
      vehicleIds.map(async (vehicleId) => {
        const allowed = await this.isReadAllowed({
          organizationId,
          vehicleId,
          dataCategory: LIVE_GPS_DATA_CATEGORY,
          purpose: TRIP_LOCATION_PURPOSE.TRIPS,
          processingPath: 'trip-list-read',
          serviceIdentity: 'synqdrive-trips-list',
          correlationId: `${correlationPrefix}:${vehicleId}`,
        });
        allowedByVehicle.set(vehicleId, allowed);
      }),
    );
    return trips.map((trip) => {
      const vehicleId = trip.vehicleId;
      if (!vehicleId || allowedByVehicle.get(vehicleId)) return trip;
      return {
        ...trip,
        startLatitude: null,
        startLongitude: null,
        endLatitude: null,
        endLongitude: null,
        speedingSectionsJson: null,
      };
    });
  }

  redactEnergyEvents<T extends { startLatitude?: number | null; startLongitude?: number | null }>(
    events: T[],
    allowed: boolean,
  ): T[] {
    if (allowed) return events;
    return events.map((e) => ({
      ...e,
      startLatitude: null,
      startLongitude: null,
    }));
  }

  redactDrivingEvents<T extends { latitude?: number | null; longitude?: number | null }>(
    events: T[],
    allowed: boolean,
  ): T[] {
    if (allowed) return events;
    return events.map((e) => ({
      ...e,
      latitude: null,
      longitude: null,
    }));
  }

  private async evaluateRead(ctx: TripLocationGateContext): Promise<TripLocationGateResult> {
    const allowed = await this.liveGpsEnforcement.isVehicleGpsReadAllowed(
      this.toLiveGpsReadContext(ctx),
    );
    this.metrics.record({
      path: ctx.processingPath,
      action: ctx.action,
      dataCategory: ctx.dataCategory,
      outcome: allowed ? 'allow' : 'deny',
    });
    return {
      mayProceed: allowed,
      decision: allowed ? AUTHORIZATION_DECISION_OUTCOME.ALLOW : AUTHORIZATION_DECISION_OUTCOME.DENY,
      enforced: !allowed,
      isShadowMode: false,
      shouldRetry: false,
      isAuthorizationDeny: !allowed,
      reasonCode: allowed ? 'POLICY_MATCH' : 'NO_MATCHING_POLICY',
      reasonCodes: allowed ? ['POLICY_MATCH'] : ['NO_MATCHING_POLICY'],
      correlationId: ctx.correlationId,
      auditEventId: null,
    };
  }

  private async evaluateMutating(
    ctx: TripLocationGateContext,
    kind: 'ingest' | 'derive' | 'export',
  ): Promise<TripLocationGateResult> {
    const config = readTripLocationEnforcementConfig();

    if (!ctx.organizationId?.trim() || !ctx.vehicleId?.trim()) {
      this.recordMetric(ctx, 'scope_mismatch');
      return this.scopeDeny(ctx, ['SCOPE_MISMATCH']);
    }

    if (ctx.customerId) {
      const customerOk = await this.prisma.customer.findFirst({
        where: { id: ctx.customerId, organizationId: ctx.organizationId },
        select: { id: true },
      });
      if (!customerOk) {
        this.recordMetric(ctx, 'scope_mismatch');
        return this.scopeDeny(ctx, ['TENANT_MISMATCH']);
      }
    }

    if (ctx.bookingId) {
      const bookingOk = await this.prisma.booking.findFirst({
        where: {
          id: ctx.bookingId,
          organizationId: ctx.organizationId,
          vehicleId: ctx.vehicleId,
        },
        select: { id: true },
      });
      if (!bookingOk) {
        this.recordMetric(ctx, 'scope_mismatch');
        return this.scopeDeny(ctx, ['SCOPE_MISMATCH']);
      }
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
        `Trip ${kind} shadow DENY path=${ctx.processingPath} org=${ctx.organizationId} vehicle=${ctx.vehicleId} reason=${decision.reasonCode}`,
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

  private toDecisionRequest(ctx: TripLocationGateContext): AuthorizationDecisionRequest {
    const sourceSystem =
      ctx.sourceSystem === 'HIGH_MOBILITY'
        ? POLICY_RESOLVER_SOURCE_SYSTEM.HIGH_MOBILITY
        : POLICY_RESOLVER_SOURCE_SYSTEM.DIMO;

    return {
      organizationId: ctx.organizationId,
      sourceSystem,
      dataCategory: normalizeDataCategories([ctx.dataCategory])[0],
      purpose: ctx.purpose,
      action: ctx.action,
      processorType: POLICY_RESOLVER_PROCESSOR_TYPE.SYNQDRIVE,
      serviceIdentity: ctx.serviceIdentity,
      resourceType: POLICY_RESOLVER_RESOURCE_TYPE.VEHICLE,
      resourceId: ctx.vehicleId,
      vehicleId: ctx.vehicleId,
      bookingId: ctx.bookingId ?? null,
      customerId: ctx.customerId ?? null,
      correlationId: ctx.correlationId,
      effectiveTimestamp: ctx.effectiveTimestamp ?? null,
      actorType: AuthorizationActorType.SYSTEM,
    };
  }

  private toLiveGpsReadContext(ctx: Omit<TripLocationGateContext, 'action'>): LiveGpsReadContext {
    return {
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      purpose: ctx.purpose as LiveGpsReadContext['purpose'],
      serviceIdentity: ctx.serviceIdentity as LiveGpsReadContext['serviceIdentity'],
      correlationId: ctx.correlationId,
      sourceType: ctx.sourceSystem === 'HIGH_MOBILITY' ? 'HIGH_MOBILITY' : 'DIMO',
    };
  }

  private scopeDeny(ctx: TripLocationGateContext, reasonCodes: string[]): TripLocationGateResult {
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
    ctx: TripLocationGateContext,
    decision: Awaited<ReturnType<AuthorizationDecisionService['decide']>>,
    kind: string,
  ): Promise<void> {
    try {
      await this.auditService.recordIngestionSkipped({
        organizationId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        sourceSystem: ctx.sourceSystem ?? POLICY_RESOLVER_SOURCE_SYSTEM.DIMO,
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
        `Failed to record trip ${kind} skip audit path=${ctx.processingPath}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private recordMetric(
    ctx: TripLocationGateContext,
    outcome: Parameters<TripLocationEnforcementMetricsService['record']>[0]['outcome'],
  ): void {
    this.metrics.record({
      path: ctx.processingPath,
      action: ctx.action,
      dataCategory: ctx.dataCategory,
      outcome,
    });
  }
}
