import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '@modules/activity-log/audit.service';
import {
  VehicleDetailAccessAuditAction,
  VehicleDetailAccessAuditService,
} from '@modules/activity-log/vehicle-detail-access-audit.service';
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
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  /** When true (default), increments consent accessCount. */
  trackAccess?: boolean;
  fromCache?: boolean;
}

export interface OrgFleetGpsAccessRequest {
  organizationId: string;
  purpose: Extract<GpsPositionAccessPurpose, 'FLEET_ANALYTICS'>;
  actorUserId?: string | null;
  route?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
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
 */
@Injectable()
export class GpsPositionAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataAuthorizations: DataAuthorizationsService,
    private readonly dataAuthEnforcement: DataAuthorizationEnforcementService,
    private readonly audit: AuditService,
    private readonly vehicleDetailAudit: VehicleDetailAccessAuditService,
  ) {}

  async assertVehicleGpsAccess(request: VehicleGpsAccessRequest): Promise<void> {
    await this.assertVehicleInOrg(request.organizationId, request.vehicleId);
    await this.dataAuthorizations.ensureDimoTelemetryAuthorization(request.organizationId);

    try {
      await this.dataAuthEnforcement.assertDataAuthorization({
        orgId: request.organizationId,
        vehicleId: request.vehicleId,
        sourceType: 'DIMO',
        dataCategory: GPS_PURPOSE_DATA_CATEGORY[request.purpose],
        purpose: request.purpose,
        processorType: 'SYNQDRIVE',
        trackAccess: request.trackAccess ?? true,
      });
    } catch (err) {
      if (err instanceof DataAuthorizationDeniedException) {
        this.recordAccessAudit(request, 'denied', 'DATA_AUTHORIZATION_DENIED');
      }
      throw err;
    }

    this.recordAccessAudit(request, 'allowed');
  }

  async assertOrgFleetGpsAccess(request: OrgFleetGpsAccessRequest): Promise<void> {
    await this.dataAuthorizations.ensureDimoTelemetryAuthorization(request.organizationId);

    try {
      await this.dataAuthEnforcement.assertOrganizationDataAuthorization({
        orgId: request.organizationId,
        sourceType: 'DIMO',
        dataCategory: GPS_PURPOSE_DATA_CATEGORY[request.purpose],
        purpose: request.purpose,
        processorType: 'SYNQDRIVE',
      });
    } catch (err) {
      if (err instanceof DataAuthorizationDeniedException) {
        this.recordFleetAudit(request, 'denied', 'DATA_AUTHORIZATION_DENIED');
      }
      throw err;
    }

    this.recordFleetAudit(request, 'allowed');
  }

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
      action: 'SYNC',
      entity: 'VEHICLE',
      entityId: request.vehicleId,
      description: 'System GPS ingest (DIMO snapshot)',
      route: request.systemJob ?? GPS_SYSTEM_JOB_NAME,
      metaJson: {
        auditAction: 'SYSTEM_GPS_INGEST',
        systemJob: request.systemJob ?? GPS_SYSTEM_JOB_NAME,
        documentedPurpose: request.documentedPurpose ?? GPS_SYSTEM_INGEST_PURPOSE,
        dataCategory: GPS_SYSTEM_INGEST_CATEGORY,
        processorType: 'INTERNAL_SYSTEM',
        outcome: 'allowed',
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

  private recordAccessAudit(
    request: VehicleGpsAccessRequest,
    outcome: 'allowed' | 'denied',
    errorClass?: string,
  ): void {
    this.vehicleDetailAudit.record({
      auditAction: this.auditActionForPurpose(request.purpose),
      organizationId: request.organizationId,
      vehicleId: request.vehicleId,
      actorUserId: request.actorUserId,
      purpose: request.purpose,
      route: request.route,
      requestId: request.requestId,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      outcome,
      errorClass,
      deduplicate: outcome === 'allowed',
      metadata: {
        dataCategory: GPS_PURPOSE_DATA_CATEGORY[request.purpose],
        accessKind: 'vehicle',
      },
    });
  }

  private recordFleetAudit(
    request: OrgFleetGpsAccessRequest,
    outcome: 'allowed' | 'denied',
    errorClass?: string,
  ): void {
    this.vehicleDetailAudit.record({
      auditAction: VehicleDetailAccessAuditAction.FLEET_MAP_READ,
      organizationId: request.organizationId,
      actorUserId: request.actorUserId,
      purpose: request.purpose,
      route: request.route,
      requestId: request.requestId,
      ipAddress: request.ipAddress,
      userAgent: request.userAgent,
      outcome,
      errorClass,
      deduplicate: outcome === 'allowed',
      metadata: {
        dataCategory: GPS_PURPOSE_DATA_CATEGORY[request.purpose],
        accessKind: 'org_fleet',
        fromCache: request.fromCache ?? false,
      },
    });
  }

  private auditActionForPurpose(
    purpose: GpsPositionAccessPurpose,
  ): (typeof VehicleDetailAccessAuditAction)[keyof typeof VehicleDetailAccessAuditAction] {
    switch (purpose) {
      case 'LIVE_MAP':
        return VehicleDetailAccessAuditAction.LIVE_GPS_READ;
      case 'TECHNICAL_OVERVIEW':
        return VehicleDetailAccessAuditAction.TELEMETRY_READ;
      case 'TRIPS':
        return VehicleDetailAccessAuditAction.TRIP_ROUTE_READ;
      case 'FLEET_ANALYTICS':
        return VehicleDetailAccessAuditAction.FLEET_MAP_READ;
      default:
        return VehicleDetailAccessAuditAction.TELEMETRY_READ;
    }
  }
}

export { DataAuthorizationDeniedException };
