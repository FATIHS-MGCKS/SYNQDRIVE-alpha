import { Injectable, NotFoundException } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import { DataAuthorizationDeniedException } from './data-authorization.exceptions';
import { DataAuthorizationEnforcementService } from './data-authorization-enforcement.service';
import { DataAuthorizationsService } from './data-authorizations.service';
import {
  GPS_PURPOSE_DATA_CATEGORY,
  GPS_SYSTEM_INGEST_CATEGORY,
  GPS_SYSTEM_INGEST_PURPOSE,
  GPS_SYSTEM_JOB_NAME,
  type GpsPositionAccessPurpose,
} from './gps-position-access.constants';

export interface VehicleGpsAccessRequest {
  organizationId: string;
  vehicleId: string;
  purpose: GpsPositionAccessPurpose;
  actorUserId?: string | null;
  route?: string;
  /** When true (default), increments consent accessCount. */
  trackAccess?: boolean;
  fromCache?: boolean;
}

export interface OrgFleetGpsAccessRequest {
  organizationId: string;
  purpose: Extract<GpsPositionAccessPurpose, 'FLEET_ANALYTICS'>;
  actorUserId?: string | null;
  route?: string;
  fromCache?: boolean;
}

export interface SystemGpsIngestRequest {
  organizationId: string;
  vehicleId: string;
  systemJob?: string;
  documentedPurpose?: string;
}

/**
 * Central gate for position-related reads and provider-backed GPS fetches.
 * Reuses {@link DataAuthorizationEnforcementService} — no parallel auth architecture.
 *
 * HTTP layers still enforce authentication, org scoping, and permissions via guards.
 * This service adds vehicle binding, data consent, purpose, audit, and minimization hooks.
 */
@Injectable()
export class GpsPositionAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataAuthorizations: DataAuthorizationsService,
    private readonly dataAuthEnforcement: DataAuthorizationEnforcementService,
    private readonly audit: AuditService,
  ) {}

  /** Single-vehicle user/API access (live-gps, telemetry DIMO fetch, trip route). */
  async assertVehicleGpsAccess(request: VehicleGpsAccessRequest): Promise<void> {
    await this.assertVehicleInOrg(request.organizationId, request.vehicleId);
    await this.dataAuthorizations.ensureDimoTelemetryAuthorization(request.organizationId);

    await this.dataAuthEnforcement.assertDataAuthorization({
      orgId: request.organizationId,
      vehicleId: request.vehicleId,
      sourceType: 'DIMO',
      dataCategory: GPS_PURPOSE_DATA_CATEGORY[request.purpose],
      purpose: request.purpose,
      processorType: 'SYNQDRIVE',
      trackAccess: request.trackAccess ?? true,
    });

    this.recordGpsAccessAudit({
      organizationId: request.organizationId,
      vehicleId: request.vehicleId,
      purpose: request.purpose,
      actorUserId: request.actorUserId,
      route: request.route,
      fromCache: request.fromCache ?? false,
      accessKind: 'vehicle',
    });
  }

  /** Org-wide fleet map read — must run before Redis cache lookup. */
  async assertOrgFleetGpsAccess(request: OrgFleetGpsAccessRequest): Promise<void> {
    await this.dataAuthorizations.ensureDimoTelemetryAuthorization(request.organizationId);

    await this.dataAuthEnforcement.assertOrganizationDataAuthorization({
      orgId: request.organizationId,
      sourceType: 'DIMO',
      dataCategory: GPS_PURPOSE_DATA_CATEGORY[request.purpose],
      purpose: request.purpose,
      processorType: 'SYNQDRIVE',
    });

    this.recordGpsAccessAudit({
      organizationId: request.organizationId,
      purpose: request.purpose,
      actorUserId: request.actorUserId,
      route: request.route,
      fromCache: request.fromCache ?? false,
      accessKind: 'org_fleet',
    });
  }

  /**
   * Background ingest (DIMO snapshot poll) — tenant + documented system purpose.
   * No user actor; audit uses INTERNAL_SYSTEM metadata.
   */
  async assertSystemGpsIngest(request: SystemGpsIngestRequest): Promise<void> {
    await this.assertVehicleInOrg(request.organizationId, request.vehicleId);
    await this.dataAuthorizations.ensureDimoTelemetryAuthorization(request.organizationId);

    await this.dataAuthEnforcement.assertDataAuthorization({
      orgId: request.organizationId,
      vehicleId: request.vehicleId,
      sourceType: 'DIMO',
      dataCategory: GPS_SYSTEM_INGEST_CATEGORY,
      purpose: GPS_SYSTEM_INGEST_PURPOSE,
      processorType: 'INTERNAL_SYSTEM',
      trackAccess: false,
    });

    void this.audit.record({
      actorOrganizationId: request.organizationId,
      action: ActivityAction.SYNC,
      entity: ActivityEntity.VEHICLE,
      entityId: request.vehicleId,
      description: 'System GPS ingest (DIMO snapshot)',
      route: request.systemJob ?? GPS_SYSTEM_JOB_NAME,
      metaJson: {
        systemJob: request.systemJob ?? GPS_SYSTEM_JOB_NAME,
        documentedPurpose: request.documentedPurpose ?? GPS_SYSTEM_INGEST_PURPOSE,
        dataCategory: GPS_SYSTEM_INGEST_CATEGORY,
        processorType: 'INTERNAL_SYSTEM',
      },
    });
  }

  private async assertVehicleInOrg(
    organizationId: string,
    vehicleId: string,
  ): Promise<void> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, organizationId },
      select: { id: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
  }

  private recordGpsAccessAudit(input: {
    organizationId: string;
    vehicleId?: string;
    purpose: GpsPositionAccessPurpose;
    actorUserId?: string | null;
    route?: string;
    fromCache: boolean;
    accessKind: 'vehicle' | 'org_fleet';
  }): void {
    void this.audit.record({
      actorUserId: input.actorUserId ?? undefined,
      actorOrganizationId: input.organizationId,
      action: ActivityAction.SYNC,
      entity: ActivityEntity.VEHICLE,
      entityId: input.vehicleId,
      description: `GPS position access (${input.purpose})`,
      route: input.route,
      metaJson: {
        purpose: input.purpose,
        accessKind: input.accessKind,
        fromCache: input.fromCache,
        dataCategory: GPS_PURPOSE_DATA_CATEGORY[input.purpose],
      },
    });
  }
}

export { DataAuthorizationDeniedException };
