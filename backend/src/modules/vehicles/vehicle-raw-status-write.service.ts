import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ActivityAction, ActivityEntity, Prisma, Vehicle, VehicleStatus } from '@prisma/client';
import { AuditService } from '@modules/activity-log/audit.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  ADMIN_WRITABLE_VEHICLE_STATUSES,
  BOOKING_HANDOVER_COMPAT_RENTED_STATUS,
  NON_PERSISTABLE_DERIVED_VEHICLE_STATUSES,
  type VehicleRawStatusWriteDomain,
  WORKFLOW_WRITABLE_VEHICLE_STATUSES,
} from './vehicle-operational-status.constants';

export type VehicleRawStatusTx = Prisma.TransactionClient;

export interface VehicleRawStatusWriteContext {
  organizationId: string;
  vehicleId: string;
  actorUserId?: string | null;
  route?: string;
  meta?: Record<string, unknown>;
}

export interface VehicleRawStatusWriteResult {
  vehicle: Vehicle;
  previousStatus: VehicleStatus;
  nextStatus: VehicleStatus;
  changed: boolean;
}

@Injectable()
export class VehicleRawStatusWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Manual vehicle administration — only base operational states.
   * Never RESERVED or ACTIVE_RENTED (RENTED).
   */
  async applyAdminOperationalStatus(
    ctx: VehicleRawStatusWriteContext & { status: VehicleStatus },
    tx?: VehicleRawStatusTx,
  ): Promise<VehicleRawStatusWriteResult> {
    this.assertDomainStatus('ADMIN_MANUAL', ctx.status);
    return this.persistStatus(ctx, ctx.status, 'ADMIN_MANUAL', tx);
  }

  /**
   * Booking handover pickup — writes compatibility RENTED after booking → ACTIVE.
   * Canonical ACTIVE_RENTED remains derived from booking + handover protocol.
   */
  async applyHandoverPickup(
    ctx: VehicleRawStatusWriteContext & {
      bookingId: string;
      currentStationId?: string | null;
    },
    tx: VehicleRawStatusTx,
  ): Promise<VehicleRawStatusWriteResult> {
    const data: Prisma.VehicleUpdateInput = {
      status: BOOKING_HANDOVER_COMPAT_RENTED_STATUS,
      ...(ctx.currentStationId
        ? { currentStation: { connect: { id: ctx.currentStationId } } }
        : {}),
    };
    return this.persistVehicleUpdate(
      ctx,
      data,
      BOOKING_HANDOVER_COMPAT_RENTED_STATUS,
      'BOOKING_HANDOVER',
      tx,
      {
        handoverKind: 'PICKUP',
        bookingId: ctx.bookingId,
        compatibilityNote:
          'Raw RENTED is a legacy compatibility hint; canonical ACTIVE_RENTED is derived from ACTIVE booking + pickup protocol.',
      },
    );
  }

  /**
   * Booking handover return — releases vehicle when no other ACTIVE booking
   * and maintenance/out-of-service is not blocking the flip.
   */
  async applyHandoverReturn(
    ctx: VehicleRawStatusWriteContext & {
      bookingId: string;
      currentStationId?: string | null;
      blockedByMaintenance: boolean;
      otherActiveBookings: number;
    },
    tx: VehicleRawStatusTx,
  ): Promise<VehicleRawStatusWriteResult | null> {
    if (ctx.currentStationId && (ctx.blockedByMaintenance || ctx.otherActiveBookings > 0)) {
      await this.persistStationOnly(ctx, ctx.currentStationId, tx, {
        handoverKind: 'RETURN',
        bookingId: ctx.bookingId,
        statusSkipped: true,
        blockedByMaintenance: ctx.blockedByMaintenance,
        otherActiveBookings: ctx.otherActiveBookings,
      });
      return null;
    }

    if (ctx.blockedByMaintenance || ctx.otherActiveBookings > 0) {
      return null;
    }

    const data: Prisma.VehicleUpdateInput = {
      status: VehicleStatus.AVAILABLE,
      ...(ctx.currentStationId
        ? { currentStation: { connect: { id: ctx.currentStationId } } }
        : {}),
    };
    return this.persistVehicleUpdate(
      ctx,
      data,
      VehicleStatus.AVAILABLE,
      'BOOKING_HANDOVER',
      tx,
      { handoverKind: 'RETURN', bookingId: ctx.bookingId },
    );
  }

  /**
   * Booking cancel / no-show — releases vehicle unless maintenance-blocked.
   */
  async applyBookingLifecycleRelease(
    ctx: VehicleRawStatusWriteContext & {
      bookingId: string;
      reason: 'CANCEL' | 'NO_SHOW';
    },
    tx?: VehicleRawStatusTx,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    const vehicle = await client.vehicle.findFirst({
      where: { id: ctx.vehicleId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const result = await client.vehicle.updateMany({
      where: {
        id: ctx.vehicleId,
        organizationId: ctx.organizationId,
        status: {
          notIn: [VehicleStatus.IN_SERVICE, VehicleStatus.OUT_OF_SERVICE],
        },
      },
      data: { status: VehicleStatus.AVAILABLE },
    });

    if (result.count > 0) {
      void this.recordAudit({
        ...ctx,
        domain: 'BOOKING_LIFECYCLE',
        previousStatus: vehicle.status,
        nextStatus: VehicleStatus.AVAILABLE,
        meta: {
          ...(ctx.meta ?? {}),
          bookingId: ctx.bookingId,
          lifecycleReason: ctx.reason,
        },
      });
    }

    return result.count;
  }

  /** Workflow maintenance domain — same base states as admin manual. */
  async applyWorkflowMaintenanceStatus(
    ctx: VehicleRawStatusWriteContext & { status: VehicleStatus },
  ): Promise<VehicleRawStatusWriteResult> {
    this.assertDomainStatus('WORKFLOW_MAINTENANCE', ctx.status);
    return this.persistStatus(ctx, ctx.status, 'WORKFLOW_MAINTENANCE');
  }

  private async persistStatus(
    ctx: VehicleRawStatusWriteContext,
    nextStatus: VehicleStatus,
    domain: VehicleRawStatusWriteDomain,
    tx?: VehicleRawStatusTx,
  ): Promise<VehicleRawStatusWriteResult> {
    return this.persistVehicleUpdate(
      ctx,
      { status: nextStatus },
      nextStatus,
      domain,
      tx,
    );
  }

  private async persistVehicleUpdate(
    ctx: VehicleRawStatusWriteContext,
    data: Prisma.VehicleUpdateInput,
    nextStatus: VehicleStatus,
    domain: VehicleRawStatusWriteDomain,
    tx?: VehicleRawStatusTx,
    extraMeta?: Record<string, unknown>,
  ): Promise<VehicleRawStatusWriteResult> {
    const client = tx ?? this.prisma;
    const existing = await client.vehicle.findFirst({
      where: { id: ctx.vehicleId, organizationId: ctx.organizationId },
    });
    if (!existing) {
      throw new NotFoundException('Vehicle not found');
    }

    const previousStatus = existing.status;
    const changed = previousStatus !== nextStatus;

    const vehicle = await client.vehicle.update({
      where: { id: ctx.vehicleId },
      data,
    });

    if (changed) {
      void this.recordAudit({
        ...ctx,
        domain,
        previousStatus,
        nextStatus,
        meta: { ...(ctx.meta ?? {}), ...(extraMeta ?? {}) },
      });
    }

    return { vehicle, previousStatus, nextStatus, changed };
  }

  private async persistStationOnly(
    ctx: VehicleRawStatusWriteContext,
    currentStationId: string,
    tx: VehicleRawStatusTx,
    extraMeta: Record<string, unknown>,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const existing = await client.vehicle.findFirst({
      where: { id: ctx.vehicleId, organizationId: ctx.organizationId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('Vehicle not found');
    }

    await client.vehicle.update({
      where: { id: ctx.vehicleId },
      data: { currentStation: { connect: { id: currentStationId } } },
    });

    void this.recordAudit({
      ...ctx,
      domain: 'BOOKING_HANDOVER',
      previousStatus: null,
      nextStatus: null,
      meta: { ...(ctx.meta ?? {}), ...extraMeta, stationOnly: true },
    });
  }

  private assertDomainStatus(
    domain: VehicleRawStatusWriteDomain,
    status: VehicleStatus,
  ): void {
    if (NON_PERSISTABLE_DERIVED_VEHICLE_STATUSES.has(status)) {
      throw new BadRequestException(
        `Vehicle status '${status}' is derived only and must not be persisted. RESERVED is computed by the operational state engine from booking context.`,
      );
    }

    const allowed =
      domain === 'WORKFLOW_MAINTENANCE'
        ? WORKFLOW_WRITABLE_VEHICLE_STATUSES
        : ADMIN_WRITABLE_VEHICLE_STATUSES;

    if (!allowed.has(status)) {
      throw new BadRequestException(
        `Vehicle status '${status}' cannot be set via ${domain}. Allowed: ${[...allowed].join(', ')}.`,
      );
    }
  }

  private recordAudit(input: {
    organizationId: string;
    vehicleId: string;
    actorUserId?: string | null;
    route?: string;
    domain: VehicleRawStatusWriteDomain;
    previousStatus: VehicleStatus | null;
    nextStatus: VehicleStatus | null;
    meta?: Record<string, unknown>;
  }): void {
    const statusPart =
      input.previousStatus != null && input.nextStatus != null
        ? `${input.previousStatus} → ${input.nextStatus}`
        : 'station update';

    void this.audit.record({
      actorUserId: input.actorUserId ?? undefined,
      actorOrganizationId: input.organizationId,
      action: ActivityAction.UPDATE,
      entity: ActivityEntity.VEHICLE,
      entityId: input.vehicleId,
      route: input.route,
      description: `Vehicle raw status write (${input.domain}): ${statusPart}`,
      changeSummary: statusPart,
      metaJson: {
        domain: input.domain,
        previousStatus: input.previousStatus,
        nextStatus: input.nextStatus,
        ...(input.meta ?? {}),
      },
    });
  }
}
