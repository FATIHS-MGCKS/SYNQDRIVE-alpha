import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthorizationActorType } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { RedisService } from '@shared/redis/redis.service';
import { AuthorizationDecisionService } from '../authorization-decision-engine/authorization-decision.service';
import { DataAuthorizationsService } from '../data-authorizations.service';
import { DataAuthorizationEnforcementService } from '../data-authorization-enforcement.service';
import { DataAuthorizationDeniedException } from '../data-authorization.exceptions';
import {
  fleetMapCacheKey,
  LIVE_GPS_DATA_CATEGORY,
  LIVE_GPS_PURPOSE,
  type LiveGpsPurpose,
  type LiveGpsServiceIdentity,
} from './live-gps-enforcement.constants';
import { LiveGpsAccessDeniedException } from './live-gps-enforcement.exceptions';

export interface LiveGpsReadContext {
  organizationId: string;
  vehicleId: string;
  purpose: LiveGpsPurpose;
  serviceIdentity: LiveGpsServiceIdentity;
  correlationId: string;
  actorUserId?: string | null;
  actorType?: AuthorizationActorType;
  sourceType?: string;
  /** Master-admin / support reads require explicit SUPPORT_ACCESS purpose. */
  supportAccess?: boolean;
}

export interface GpsCoordinatePayload {
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lng?: number | null;
}

@Injectable()
export class LiveGpsEnforcementService {
  private readonly logger = new Logger(LiveGpsEnforcementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly dataAuthorizations: DataAuthorizationsService,
    private readonly enforcement: DataAuthorizationEnforcementService,
    private readonly authorizationDecision: AuthorizationDecisionService,
  ) {}

  /**
   * Full authorization decision gate — throws before any GPS data may be returned.
   */
  async assertVehicleGpsRead(ctx: LiveGpsReadContext): Promise<void> {
    this.validateContext(ctx);
    await this.assertTenantVehicle(ctx.organizationId, ctx.vehicleId);

    if (
      ctx.supportAccess &&
      ctx.serviceIdentity !== 'synqdrive-master-admin-support'
    ) {
      throw new LiveGpsAccessDeniedException('SUPPORT_IDENTITY_REQUIRED', ctx.correlationId);
    }

    await this.dataAuthorizations.ensureDimoTelemetryAuthorization(ctx.organizationId);

    try {
      await this.enforcement.assertDataAuthorization({
        orgId: ctx.organizationId,
        vehicleId: ctx.vehicleId,
        sourceType: ctx.sourceType ?? 'DIMO',
        dataCategory: LIVE_GPS_DATA_CATEGORY,
        purpose: ctx.purpose,
        processorType: 'SYNQDRIVE',
        processorId: ctx.serviceIdentity,
        correlationId: ctx.correlationId,
        trackAccess: true,
      });
    } catch (error) {
      if (error instanceof DataAuthorizationDeniedException) {
        const reasonCode =
          (error.details?.blockingReasons as string[] | undefined)?.[0] ??
          'DATA_AUTHORIZATION_DENIED';
        this.logger.warn(
          `GPS access denied org=${ctx.organizationId} vehicle=${ctx.vehicleId} reason=${reasonCode} correlation=${ctx.correlationId}`,
        );
        throw new LiveGpsAccessDeniedException(reasonCode, ctx.correlationId);
      }
      throw error;
    }
  }

  async isVehicleGpsReadAllowed(ctx: LiveGpsReadContext): Promise<boolean> {
    try {
      await this.assertVehicleGpsRead(ctx);
      return true;
    } catch (error) {
      if (error instanceof LiveGpsAccessDeniedException) return false;
      if (error instanceof NotFoundException) return false;
      throw error;
    }
  }

  /**
   * Batch gate for fleet surfaces — returns vehicle IDs authorized for GPS read.
   */
  async filterAuthorizedVehicleIds(
    organizationId: string,
    vehicleIds: string[],
    purpose: LiveGpsPurpose,
    serviceIdentity: LiveGpsServiceIdentity,
    correlationPrefix: string,
  ): Promise<Set<string>> {
    const allowed = new Set<string>();
    await Promise.all(
      vehicleIds.map(async (vehicleId) => {
        const ok = await this.isVehicleGpsReadAllowed({
          organizationId,
          vehicleId,
          purpose,
          serviceIdentity,
          correlationId: `${correlationPrefix}:${vehicleId}`,
        });
        if (ok) allowed.add(vehicleId);
      }),
    );
    return allowed;
  }

  redactCoordinates<T extends GpsCoordinatePayload>(payload: T): T {
    return {
      ...payload,
      latitude: null,
      longitude: null,
      lat: null,
      lng: null,
    };
  }

  applyCoordinateGate<T extends GpsCoordinatePayload>(
    payload: T,
    allowed: boolean,
  ): T {
    if (allowed) return payload;
    return this.redactCoordinates(payload);
  }

  async applyFleetMapGate<T extends GpsCoordinatePayload & { id: string }>(
    organizationId: string,
    vehicles: T[],
    correlationPrefix = 'fleet-map',
  ): Promise<T[]> {
    if (vehicles.length === 0) return vehicles;
    const allowed = await this.filterAuthorizedVehicleIds(
      organizationId,
      vehicles.map((v) => v.id),
      LIVE_GPS_PURPOSE.LIVE_MAP,
      'synqdrive-fleet-map',
      correlationPrefix,
    );
    return vehicles.map((v) =>
      this.applyCoordinateGate(v, allowed.has(v.id)),
    );
  }

  async applyVehicleListGate<T extends GpsCoordinatePayload & { id: string }>(
    organizationId: string,
    vehicles: T[],
    correlationPrefix = 'vehicles-list',
  ): Promise<T[]> {
    if (vehicles.length === 0) return vehicles;
    const allowed = await this.filterAuthorizedVehicleIds(
      organizationId,
      vehicles.map((v) => v.id),
      LIVE_GPS_PURPOSE.LIVE_MAP,
      'synqdrive-vehicles-list',
      correlationPrefix,
    );
    return vehicles.map((v) =>
      this.applyCoordinateGate(v, allowed.has(v.id)),
    );
  }

  async applyConnectivityGate<T extends GpsCoordinatePayload & { vehicleId: string }>(
    organizationId: string,
    items: T[],
    correlationPrefix = 'fleet-connectivity',
  ): Promise<T[]> {
    if (items.length === 0) return items;
    const allowed = await this.filterAuthorizedVehicleIds(
      organizationId,
      items.map((i) => i.vehicleId),
      LIVE_GPS_PURPOSE.TECHNICAL_OVERVIEW,
      'synqdrive-fleet-connectivity',
      correlationPrefix,
    );
    return items.map((item) =>
      this.applyCoordinateGate(item, allowed.has(item.vehicleId)),
    );
  }

  async invalidateOrgGpsCaches(organizationId: string): Promise<void> {
    if (!organizationId) return;
    this.authorizationDecision.invalidateOrganizationCache(organizationId);
    try {
      await this.redis.del(fleetMapCacheKey(organizationId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Fleet-map cache invalidate failed org=${organizationId}: ${message}`);
    }
  }

  private validateContext(ctx: LiveGpsReadContext): void {
    if (!ctx.organizationId?.trim()) {
      throw new LiveGpsAccessDeniedException('MISSING_ORGANIZATION');
    }
    if (!ctx.vehicleId?.trim()) {
      throw new LiveGpsAccessDeniedException('MISSING_VEHICLE');
    }
    if (!ctx.purpose?.trim()) {
      throw new LiveGpsAccessDeniedException('MISSING_PURPOSE', ctx.correlationId);
    }
    if (!ctx.serviceIdentity?.trim()) {
      throw new LiveGpsAccessDeniedException('MISSING_PROCESSOR_IDENTITY', ctx.correlationId);
    }
    if (!ctx.correlationId?.trim()) {
      throw new LiveGpsAccessDeniedException('MISSING_CORRELATION_ID');
    }
  }

  private async assertTenantVehicle(organizationId: string, vehicleId: string): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
  }
}
