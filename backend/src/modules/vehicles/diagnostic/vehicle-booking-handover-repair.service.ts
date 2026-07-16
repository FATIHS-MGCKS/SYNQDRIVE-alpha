import { Injectable, Logger } from '@nestjs/common';
import { VehicleStatus } from '@prisma/client';
import { ActivityLogService } from '@modules/activity-log/activity-log.service';
import { PrismaService } from '@shared/database/prisma.service';
import { VehicleBookingHandoverDiagnosticService } from './vehicle-booking-handover-diagnostic.service';
import {
  appendRepairNote,
  buildOrgRepairContext,
  buildRepairAuditNote,
  canActivateBookingAfterPickup,
  canClearStaleRentedAfterReturn,
  canClearStaleReserved,
  canCompleteBookingAfterReturn,
  chunkRepairItems,
  DEFAULT_VBH_REPAIR_BATCH_SIZE,
  handoverByKind,
  isVehicleOperationalBlocked,
} from './vehicle-booking-handover-repair.util';
import {
  VBH_REPAIR_SCRIPT_VERSION,
  type VbhRepairAction,
  type VbhRepairActionId,
  type VbhRepairAuditLogEntry,
  type VbhRepairBookingRow,
  type VbhRepairHandoverRow,
  type VbhRepairOrgContext,
  type VbhRepairReport,
  type VbhRepairRunOptions,
  type VbhRepairSkipped,
  type VbhRepairUnresolved,
  type VbhRepairVehicleRow,
} from './vehicle-booking-handover-repair.types';

@Injectable()
export class VehicleBookingHandoverRepairService {
  private readonly logger = new Logger(VehicleBookingHandoverRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly diagnostic: VehicleBookingHandoverDiagnosticService,
    private readonly activityLog: ActivityLogService,
  ) {}

  async runRepair(options: VbhRepairRunOptions = {}): Promise<VbhRepairReport> {
    const apply = options.apply === true;
    const batchSize = options.batchSize ?? DEFAULT_VBH_REPAIR_BATCH_SIZE;
    const referenceNow = options.referenceNow ?? new Date();

    const orgIds = options.organizationId
      ? [options.organizationId]
      : (await this.prisma.organization.findMany({ select: { id: true } })).map((o) => o.id);

    const diagnosticBefore = await this.diagnostic.runDiagnostic({
      organizationId: options.organizationId,
      vehicleId: options.vehicleId,
      referenceNow,
      includeFindings: false,
    });

    const actions: VbhRepairAction[] = [];
    const unresolved: VbhRepairUnresolved[] = [];
    const skipped: VbhRepairSkipped[] = [];
    const auditLog: VbhRepairAuditLogEntry[] = [];
    let vehiclesScanned = 0;
    let bookingsScanned = 0;
    let errorCount = 0;

    const audit = (
      level: VbhRepairAuditLogEntry['level'],
      message: string,
      meta: Partial<VbhRepairAuditLogEntry> = {},
    ) => {
      auditLog.push({
        at: new Date().toISOString(),
        level,
        scriptVersion: VBH_REPAIR_SCRIPT_VERSION,
        message,
        ...meta,
      });
    };

    audit('info', `Repair started (dryRun=${!apply}, apply=${apply}, batchSize=${batchSize})`);

    for (const organizationId of orgIds) {
      const ctx = await this.loadOrgContext(organizationId, options.vehicleId);
      vehiclesScanned += ctx.vehicles.length;
      bookingsScanned += ctx.bookings.length;

      const planned = this.planRepairs(ctx, referenceNow, unresolved, skipped);
      actions.push(...planned);

      if (!apply) {
        audit('info', `Dry-run: planned ${planned.length} action(s) for org ${organizationId}`);
        continue;
      }

      for (const batch of chunkRepairItems(planned, batchSize)) {
        for (const action of batch) {
          try {
            const result = await this.applyAction(action);
            if (result.skipped) {
              action.skipped = true;
              action.skipReason = result.reason;
              skipped.push({
                organizationId: action.organizationId,
                vehicleId: action.vehicleId,
                bookingId: action.bookingId,
                ruleId: action.ruleId,
                reason: result.reason,
              });
              audit('skip', result.reason, {
                actionId: action.actionId,
                ruleId: action.ruleId,
                vehicleId: action.vehicleId,
                bookingId: action.bookingId,
                before: action.before,
                after: action.after,
                reason: action.reason,
              });
              continue;
            }

            action.applied = true;
            audit('action', action.description, {
              actionId: action.actionId,
              ruleId: action.ruleId,
              vehicleId: action.vehicleId,
              bookingId: action.bookingId,
              before: action.before,
              after: action.after,
              reason: action.reason,
            });
          } catch (err: unknown) {
            errorCount += 1;
            const message = err instanceof Error ? err.message : String(err);
            audit('error', `Failed ${action.actionId} on vehicle ${action.vehicleId}: ${message}`, {
              actionId: action.actionId,
              ruleId: action.ruleId,
              vehicleId: action.vehicleId,
              bookingId: action.bookingId,
            });
            this.logger.error(
              `Repair action failed: ${action.actionId} vehicle=${action.vehicleId}`,
              err as Error,
            );
          }
        }
      }
    }

    const diagnosticAfter = apply
      ? await this.diagnostic.runDiagnostic({
          organizationId: options.organizationId,
          vehicleId: options.vehicleId,
          referenceNow,
          includeFindings: false,
        })
      : undefined;

    const byAction: Partial<Record<VbhRepairActionId, number>> = {};
    for (const action of actions) {
      byAction[action.actionId] = (byAction[action.actionId] ?? 0) + 1;
    }

    return {
      mode: 'repair',
      dryRun: !apply,
      apply,
      scriptVersion: VBH_REPAIR_SCRIPT_VERSION,
      generatedAt: new Date().toISOString(),
      referenceNow: referenceNow.toISOString(),
      organizationId: options.organizationId ?? null,
      organizationCount: orgIds.length,
      vehiclesScanned,
      bookingsScanned,
      summary: {
        planned: actions.length,
        applied: actions.filter((a) => a.applied).length,
        skipped: skipped.length,
        unresolved: unresolved.length,
        errors: errorCount,
        byAction,
      },
      actions,
      unresolved,
      skipped,
      auditLog,
      diagnosticBefore,
      diagnosticAfter,
    };
  }

  private async loadOrgContext(
    organizationId: string,
    vehicleId?: string,
  ): Promise<VbhRepairOrgContext> {
    const vehicleWhere: { organizationId: string; id?: string } = { organizationId };
    if (vehicleId) vehicleWhere.id = vehicleId;

    const vehicles = await this.prisma.vehicle.findMany({
      where: vehicleWhere,
      select: {
        id: true,
        organizationId: true,
        licensePlate: true,
        status: true,
      },
    });

    const vehicleIds = vehicles.map((v) => v.id);
    const bookings =
      vehicleIds.length === 0
        ? []
        : await this.prisma.booking.findMany({
            where: { organizationId, vehicleId: { in: vehicleIds } },
            select: {
              id: true,
              organizationId: true,
              vehicleId: true,
              status: true,
              startDate: true,
              endDate: true,
              completedAt: true,
              notes: true,
            },
          });

    const bookingIds = bookings.map((b) => b.id);
    const handovers =
      bookingIds.length === 0
        ? []
        : await this.prisma.bookingHandoverProtocol.findMany({
            where: { organizationId, bookingId: { in: bookingIds } },
            select: {
              id: true,
              organizationId: true,
              bookingId: true,
              vehicleId: true,
              kind: true,
              performedAt: true,
              odometerKm: true,
            },
          });

    return buildOrgRepairContext({
      organizationId,
      vehicles: vehicles as VbhRepairVehicleRow[],
      bookings: bookings as VbhRepairBookingRow[],
      handovers: handovers as VbhRepairHandoverRow[],
    });
  }

  private planRepairs(
    ctx: VbhRepairOrgContext,
    now: Date,
    unresolved: VbhRepairUnresolved[],
    skipped: VbhRepairSkipped[],
  ): VbhRepairAction[] {
    const actions: VbhRepairAction[] = [];
    const actionKeys = new Set<string>();

    const pushAction = (action: VbhRepairAction) => {
      const key = `${action.actionId}:${action.vehicleId}:${action.bookingId ?? '-'}`;
      if (actionKeys.has(key)) return;
      actionKeys.add(key);
      actions.push(action);
    };

    for (const vehicle of ctx.vehicles) {
      const vehicleBookings = ctx.bookingsByVehicle.get(vehicle.id) ?? [];

      if (vehicle.status === VehicleStatus.RESERVED) {
        const gate = canClearStaleReserved(vehicle, vehicleBookings, now);
        if (gate.ok) {
          pushAction({
            actionId: 'clear_stale_reserved_vehicle_status',
            ruleId: 'raw_reserved_without_window',
            organizationId: ctx.organizationId,
            vehicleId: vehicle.id,
            description: 'Clear stale RESERVED vehicle status to AVAILABLE',
            reason: 'No ACTIVE booking and no reservation-window booking backs RESERVED',
            before: { vehicleStatus: vehicle.status },
            after: { vehicleStatus: VehicleStatus.AVAILABLE },
            applied: false,
          });
        } else {
          unresolved.push({
            organizationId: ctx.organizationId,
            vehicleId: vehicle.id,
            ruleId: 'raw_reserved_without_window',
            reason: gate.reason,
          });
        }
      }

      if (vehicle.status === VehicleStatus.RENTED) {
        const gate = canClearStaleRentedAfterReturn(
          vehicle,
          vehicleBookings,
          ctx.handoversByBooking,
        );
        if (gate.ok) {
          pushAction({
            actionId: 'clear_stale_rented_after_return',
            ruleId: 'raw_rented_after_completed_return',
            organizationId: ctx.organizationId,
            vehicleId: vehicle.id,
            bookingId: gate.bookingId,
            description: 'Release vehicle to AVAILABLE after completed RETURN',
            reason: 'COMPLETED booking with RETURN protocol and no ACTIVE booking',
            before: { vehicleStatus: vehicle.status, bookingId: gate.bookingId },
            after: { vehicleStatus: VehicleStatus.AVAILABLE, bookingId: gate.bookingId },
            applied: false,
          });
        } else if (gate.reason.includes('ACTIVE booking still exists')) {
          // Booking repair may handle this path.
          skipped.push({
            organizationId: ctx.organizationId,
            vehicleId: vehicle.id,
            ruleId: 'raw_rented_after_completed_return',
            reason: gate.reason,
          });
        } else {
          unresolved.push({
            organizationId: ctx.organizationId,
            vehicleId: vehicle.id,
            ruleId: 'raw_rented_after_completed_return',
            reason: gate.reason,
          });
        }
      }
    }

    for (const booking of ctx.bookings) {
      const handovers = ctx.handoversByBooking.get(booking.id) ?? [];

      if (handoverByKind(handovers, 'RETURN') && booking.status === 'ACTIVE') {
        const gate = canCompleteBookingAfterReturn(booking, handovers);
        if (gate.ok) {
          pushAction({
            actionId: 'complete_booking_after_return_protocol',
            ruleId: 'active_booking_with_return_protocol',
            organizationId: ctx.organizationId,
            vehicleId: booking.vehicleId,
            bookingId: booking.id,
            description: 'Complete ACTIVE booking after existing RETURN protocol',
            reason: 'RETURN protocol exists with prior PICKUP — mirror handover return transition',
            before: { bookingStatus: booking.status, completedAt: booking.completedAt?.toISOString() ?? null },
            after: {
              bookingStatus: 'COMPLETED',
              completedAt: gate.returnProtocol.performedAt.toISOString(),
            },
            applied: false,
          });
        } else {
          unresolved.push({
            organizationId: ctx.organizationId,
            vehicleId: booking.vehicleId,
            bookingId: booking.id,
            ruleId: 'active_booking_with_return_protocol',
            reason: gate.reason,
          });
        }
      }

      if (handoverByKind(handovers, 'PICKUP') && booking.status !== 'ACTIVE') {
        const gate = canActivateBookingAfterPickup(booking, handovers);
        if (gate.ok) {
          pushAction({
            actionId: 'activate_booking_after_pickup_protocol',
            ruleId: 'pickup_protocol_booking_not_active',
            organizationId: ctx.organizationId,
            vehicleId: booking.vehicleId,
            bookingId: booking.id,
            description: 'Activate CONFIRMED booking after existing PICKUP protocol',
            reason: 'PICKUP protocol exists without RETURN — mirror handover pickup transition',
            before: { bookingStatus: booking.status },
            after: { bookingStatus: 'ACTIVE' },
            applied: false,
          });
        } else if (booking.status !== 'COMPLETED' && booking.status !== 'CANCELLED' && booking.status !== 'NO_SHOW') {
          unresolved.push({
            organizationId: ctx.organizationId,
            vehicleId: booking.vehicleId,
            bookingId: booking.id,
            ruleId: 'pickup_protocol_booking_not_active',
            reason: gate.reason,
          });
        }
      }
    }

    return actions;
  }

  private async applyAction(
    action: VbhRepairAction,
  ): Promise<{ skipped: true; reason: string } | { skipped: false }> {
    switch (action.actionId) {
      case 'clear_stale_reserved_vehicle_status':
        return this.applyClearStaleReserved(action);
      case 'clear_stale_rented_after_return':
        return this.applyClearStaleRentedAfterReturn(action);
      case 'complete_booking_after_return_protocol':
        return this.applyCompleteBookingAfterReturn(action);
      case 'activate_booking_after_pickup_protocol':
        return this.applyActivateBookingAfterPickup(action);
      default:
        throw new Error(`Unknown action ${action.actionId as string}`);
    }
  }

  private async applyClearStaleReserved(
    action: VbhRepairAction,
  ): Promise<{ skipped: true; reason: string } | { skipped: false }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: action.vehicleId, organizationId: action.organizationId },
      select: { id: true, status: true },
    });
    if (!vehicle) {
      return { skipped: true, reason: 'Vehicle no longer exists' };
    }
    if (vehicle.status !== action.before.vehicleStatus) {
      return { skipped: true, reason: 'Vehicle status changed since planning — idempotent skip' };
    }
    if (vehicle.status !== VehicleStatus.RESERVED) {
      return { skipped: true, reason: 'Vehicle is no longer RESERVED — already reconciled' };
    }

    const bookings = await this.prisma.booking.findMany({
      where: { organizationId: action.organizationId, vehicleId: action.vehicleId },
      select: { id: true, status: true, endDate: true },
    });
    const gate = canClearStaleReserved(
      { ...vehicle, organizationId: action.organizationId, licensePlate: null },
      bookings.map((b) => ({
        id: b.id,
        organizationId: action.organizationId,
        vehicleId: action.vehicleId,
        status: b.status,
        startDate: new Date(0),
        endDate: b.endDate,
        completedAt: null,
        notes: null,
      })),
      new Date(),
    );
    if (!gate.ok) {
      return { skipped: true, reason: `Unsafe to clear RESERVED: ${gate.reason}` };
    }

    await this.prisma.vehicle.update({
      where: { id: action.vehicleId },
      data: { status: VehicleStatus.AVAILABLE },
    });

    await this.logActivity(action);
    return { skipped: false };
  }

  private async applyClearStaleRentedAfterReturn(
    action: VbhRepairAction,
  ): Promise<{ skipped: true; reason: string } | { skipped: false }> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: action.vehicleId, organizationId: action.organizationId },
      select: { id: true, status: true },
    });
    if (!vehicle) {
      return { skipped: true, reason: 'Vehicle no longer exists' };
    }
    if (vehicle.status !== VehicleStatus.RENTED) {
      return { skipped: true, reason: 'Vehicle is no longer RENTED — already reconciled' };
    }

    const bookings = await this.prisma.booking.findMany({
      where: { organizationId: action.organizationId, vehicleId: action.vehicleId },
      select: {
        id: true,
        status: true,
        startDate: true,
        endDate: true,
        completedAt: true,
        notes: true,
      },
    });
    const handovers = await this.prisma.bookingHandoverProtocol.findMany({
      where: {
        organizationId: action.organizationId,
        bookingId: { in: bookings.map((b) => b.id) },
      },
      select: {
        id: true,
        organizationId: true,
        bookingId: true,
        vehicleId: true,
        kind: true,
        performedAt: true,
        odometerKm: true,
      },
    });
    const handoversByBooking = new Map<string, VbhRepairHandoverRow[]>();
    for (const handover of handovers) {
      const list = handoversByBooking.get(handover.bookingId) ?? [];
      list.push(handover as VbhRepairHandoverRow);
      handoversByBooking.set(handover.bookingId, list);
    }

    const gate = canClearStaleRentedAfterReturn(
      { ...vehicle, organizationId: action.organizationId, licensePlate: null },
      bookings as VbhRepairBookingRow[],
      handoversByBooking,
    );
    if (!gate.ok) {
      return { skipped: true, reason: `Unsafe to clear RENTED: ${gate.reason}` };
    }

    await this.prisma.vehicle.update({
      where: { id: action.vehicleId },
      data: { status: VehicleStatus.AVAILABLE },
    });

    await this.logActivity(action);
    return { skipped: false };
  }

  private async applyCompleteBookingAfterReturn(
    action: VbhRepairAction,
  ): Promise<{ skipped: true; reason: string } | { skipped: false }> {
    if (!action.bookingId) {
      return { skipped: true, reason: 'Missing bookingId' };
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: action.bookingId, organizationId: action.organizationId },
      select: {
        id: true,
        vehicleId: true,
        status: true,
        completedAt: true,
        notes: true,
      },
    });
    if (!booking) {
      return { skipped: true, reason: 'Booking no longer exists' };
    }
    if (booking.status === 'COMPLETED') {
      return { skipped: true, reason: 'Booking already COMPLETED — idempotent skip' };
    }
    if (booking.status !== 'ACTIVE') {
      return { skipped: true, reason: `Booking status is ${booking.status}, expected ACTIVE` };
    }

    const handovers = await this.prisma.bookingHandoverProtocol.findMany({
      where: { organizationId: action.organizationId, bookingId: booking.id },
      select: {
        id: true,
        organizationId: true,
        bookingId: true,
        vehicleId: true,
        kind: true,
        performedAt: true,
        odometerKm: true,
      },
    });
    const gate = canCompleteBookingAfterReturn(booking as VbhRepairBookingRow, handovers as VbhRepairHandoverRow[]);
    if (!gate.ok) {
      return { skipped: true, reason: gate.reason };
    }

    const kmDriven = Math.max(0, gate.returnProtocol.odometerKm - gate.pickupProtocol.odometerKm);
    const repairNote = buildRepairAuditNote(action.ruleId, action.before, action.after);

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'COMPLETED',
          completedAt: gate.returnProtocol.performedAt,
          kmDriven,
          notes: appendRepairNote(booking.notes, repairNote),
        },
      });

      const vehicle = await tx.vehicle.findFirst({
        where: { id: booking.vehicleId, organizationId: action.organizationId },
        select: { status: true },
      });
      const blocked = vehicle ? isVehicleOperationalBlocked(vehicle.status) : true;
      const otherActive = await tx.booking.count({
        where: {
          organizationId: action.organizationId,
          vehicleId: booking.vehicleId,
          status: 'ACTIVE',
          id: { not: booking.id },
        },
      });
      if (!blocked && otherActive === 0) {
        await tx.vehicle.update({
          where: { id: booking.vehicleId },
          data: { status: VehicleStatus.AVAILABLE },
        });
      }
    });

    await this.logActivity(action);
    return { skipped: false };
  }

  private async applyActivateBookingAfterPickup(
    action: VbhRepairAction,
  ): Promise<{ skipped: true; reason: string } | { skipped: false }> {
    if (!action.bookingId) {
      return { skipped: true, reason: 'Missing bookingId' };
    }

    const booking = await this.prisma.booking.findFirst({
      where: { id: action.bookingId, organizationId: action.organizationId },
      select: {
        id: true,
        vehicleId: true,
        status: true,
        notes: true,
      },
    });
    if (!booking) {
      return { skipped: true, reason: 'Booking no longer exists' };
    }
    if (booking.status === 'ACTIVE') {
      return { skipped: true, reason: 'Booking already ACTIVE — idempotent skip' };
    }

    const handovers = await this.prisma.bookingHandoverProtocol.findMany({
      where: { organizationId: action.organizationId, bookingId: booking.id },
      select: {
        id: true,
        organizationId: true,
        bookingId: true,
        vehicleId: true,
        kind: true,
        performedAt: true,
        odometerKm: true,
      },
    });
    const gate = canActivateBookingAfterPickup(booking as VbhRepairBookingRow, handovers as VbhRepairHandoverRow[]);
    if (!gate.ok) {
      return { skipped: true, reason: gate.reason };
    }

    const repairNote = buildRepairAuditNote(action.ruleId, action.before, action.after);

    await this.prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'ACTIVE',
          notes: appendRepairNote(booking.notes, repairNote),
        },
      });

      const vehicle = await tx.vehicle.findFirst({
        where: { id: booking.vehicleId, organizationId: action.organizationId },
        select: { status: true },
      });
      if (vehicle && !isVehicleOperationalBlocked(vehicle.status)) {
        await tx.vehicle.update({
          where: { id: booking.vehicleId },
          data: { status: VehicleStatus.RENTED },
        });
      }
    });

    await this.logActivity(action);
    return { skipped: false };
  }

  private async logActivity(action: VbhRepairAction): Promise<void> {
    await this.activityLog.log({
      organizationId: action.organizationId,
      action: 'UPDATE',
      entity: action.bookingId ? 'BOOKING' : 'VEHICLE',
      entityId: action.bookingId ?? action.vehicleId,
      description: `VBH repair ${action.actionId}: ${action.description}`,
      metaJson: {
        provenance: 'VBH_REPAIR',
        scriptVersion: VBH_REPAIR_SCRIPT_VERSION,
        actionId: action.actionId,
        ruleId: action.ruleId,
        reason: action.reason,
        before: action.before,
        after: action.after,
        vehicleId: action.vehicleId,
        bookingId: action.bookingId ?? null,
      },
    });
  }
}
