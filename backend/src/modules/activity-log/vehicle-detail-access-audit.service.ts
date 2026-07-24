import { Injectable, Logger } from '@nestjs/common';
import { ActivityAction, ActivityEntity } from '@prisma/client';
import { AuditService } from './audit.service';

export const VehicleDetailAccessAuditAction = {
  LIVE_GPS_READ: 'LIVE_GPS_READ',
  TELEMETRY_READ: 'TELEMETRY_READ',
  FLEET_MAP_READ: 'FLEET_MAP_READ',
  DEVICE_CONNECTION_READ: 'DEVICE_CONNECTION_READ',
  TRIP_ROUTE_READ: 'TRIP_ROUTE_READ',
  FILE_SUMMARY_READ: 'FILE_SUMMARY_READ',
  RENTAL_REQUIREMENTS_READ: 'RENTAL_REQUIREMENTS_READ',
  OPERATIONAL_STATUS_UPDATE: 'VEHICLE_OPERATIONAL_STATUS_UPDATE',
  CLEANING_STATUS_UPDATE: 'VEHICLE_CLEANING_STATUS_UPDATE',
  PERMISSION_DENIED: 'VEHICLE_PERMISSION_DENIED',
  DATA_AUTHORIZATION_DENIED: 'VEHICLE_DATA_AUTHORIZATION_DENIED',
} as const;

export type VehicleDetailAccessAuditActionCode =
  (typeof VehicleDetailAccessAuditAction)[keyof typeof VehicleDetailAccessAuditAction];

export interface VehicleDetailAccessAuditInput {
  auditAction: VehicleDetailAccessAuditActionCode;
  organizationId: string;
  vehicleId?: string;
  actorUserId?: string | null;
  purpose?: string;
  route?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
  outcome: 'allowed' | 'denied';
  errorClass?: string;
  level?: 'INFO' | 'WARN';
  metadata?: Record<string, unknown>;
  /** When true, suppress duplicate allowed-read rows within the dedup window. */
  deduplicate?: boolean;
}

export interface VehicleAccessAuditContext {
  actorUserId?: string | null;
  organizationId: string;
  vehicleId?: string;
  route?: string;
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

const DEDUP_WINDOW_MS = 60_000;

@Injectable()
export class VehicleDetailAccessAuditService {
  private readonly logger = new Logger(VehicleDetailAccessAuditService.name);
  private readonly recentAllowed = new Map<string, number>();

  constructor(private readonly audit: AuditService) {}

  static contextFromRequest(
    req: {
      user?: { id?: string; organizationId?: string };
      requestId?: string;
      ip?: string;
      connection?: { remoteAddress?: string };
      headers?: Record<string, string | string[] | undefined>;
      method?: string;
      route?: { path?: string };
    },
    organizationId: string,
    route?: string,
  ): VehicleAccessAuditContext {
    const base = AuditService.contextFromRequest(req);
    return {
      actorUserId: base.actorUserId,
      organizationId,
      route: route ?? base.route,
      requestId: req.requestId,
      ipAddress: base.ipAddress,
      userAgent: base.userAgent,
    };
  }

  record(input: VehicleDetailAccessAuditInput): void {
    if (input.outcome === 'allowed' && input.deduplicate) {
      const key = this.dedupKey(input);
      const now = Date.now();
      const last = this.recentAllowed.get(key);
      if (last != null && now - last < DEDUP_WINDOW_MS) {
        return;
      }
      this.recentAllowed.set(key, now);
      if (this.recentAllowed.size > 5_000) {
        this.pruneDedup(now);
      }
    }

    const level =
      input.level ??
      (input.outcome === 'denied' ? 'WARN' : 'INFO');

    void this.audit.record({
      actorUserId: input.actorUserId ?? undefined,
      actorOrganizationId: input.organizationId,
      action: input.outcome === 'denied' ? ActivityAction.AUTH_FAIL : ActivityAction.SYNC,
      entity: ActivityEntity.VEHICLE,
      entityId: input.vehicleId,
      description: this.buildDescription(input),
      route: input.route,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      level,
      metaJson: {
        auditAction: input.auditAction,
        purpose: input.purpose ?? null,
        outcome: input.outcome,
        errorClass: input.errorClass ?? null,
        requestId: input.requestId ?? null,
        organizationId: input.organizationId,
        vehicleId: input.vehicleId ?? null,
        recordedAt: new Date().toISOString(),
        ...(input.metadata ?? {}),
      },
    });
  }

  private buildDescription(input: VehicleDetailAccessAuditInput): string {
    const target = input.vehicleId ? `vehicle ${input.vehicleId}` : `org ${input.organizationId}`;
    if (input.outcome === 'denied') {
      return `Vehicle detail access denied (${input.auditAction}) for ${target}`;
    }
    return `Vehicle detail access (${input.auditAction}) for ${target}`;
  }

  private dedupKey(input: VehicleDetailAccessAuditInput): string {
    return [
      input.auditAction,
      input.organizationId,
      input.vehicleId ?? 'org',
      input.actorUserId ?? 'system',
      input.purpose ?? '',
    ].join(':');
  }

  private pruneDedup(now: number): void {
    for (const [key, ts] of this.recentAllowed.entries()) {
      if (now - ts > DEDUP_WINDOW_MS) {
        this.recentAllowed.delete(key);
      }
    }
  }
}
