import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  BillingBillableVehicleAssignmentStatus,
  BillingQuantityEventSource,
  BillingQuantityEventType,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillableVehiclesService } from '../billable-vehicles.service';
import { BillingQuantityService } from '../billing-quantity.service';
import { wasVehicleBillableAtOffboardBoundary } from '../domain/billing-vehicle-offboard-boundary';
import type { BillableVehiclePolicyAssignment } from '../domain/billable-vehicle-policy';
import {
  buildRegistryOffboardBillingIdempotencyKey,
  type ValidatedVehicleOffboardedRegistryEvent,
} from './validate-vehicle-offboarded-registry-event';

export type RegistryOffboardBillingProjectionResult = {
  outcome: 'quantity_decrement' | 'noop';
  quantityEventId?: string;
  quantityCreated: boolean;
};

function isWithinPeriod(
  from: Date,
  until: Date | null | undefined,
  asOf: Date,
): boolean {
  if (from > asOf) return false;
  if (until != null && until < asOf) return false;
  return true;
}

function isApprovedBillableAssignment(assignment: BillableVehiclePolicyAssignment): boolean {
  return (
    assignment.status === BillingBillableVehicleAssignmentStatus.ACTIVE &&
    assignment.approvedByUserId != null
  );
}

@Injectable()
export class BillingVehicleRegistryOffboardProjection {
  private readonly logger = new Logger(BillingVehicleRegistryOffboardProjection.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billableVehicles: BillableVehiclesService,
    private readonly quantity: BillingQuantityService,
  ) {}

  async onVehicleOffboardedLifecycleEvent(
    event: ValidatedVehicleOffboardedRegistryEvent,
  ): Promise<RegistryOffboardBillingProjectionResult> {
    const idempotencyKey = buildRegistryOffboardBillingIdempotencyKey(event.eventId);

    const existingQuantity = await this.prisma.billingQuantityEvent.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existingQuantity) {
      return {
        outcome: 'quantity_decrement',
        quantityEventId: existingQuantity.id,
        quantityCreated: false,
      };
    }

    const baseItem = await this.quantity.resolveBaseSubscriptionItem(event.organizationId);
    if (!baseItem) {
      this.logger.debug({
        msg: 'billing.registry_offboard.noop_no_base_plan',
        organizationId: event.organizationId,
        vehicleId: event.vehicleId,
        eventId: event.eventId,
      });
      return { outcome: 'noop', quantityCreated: false };
    }

    const policyContext = await this.billableVehicles.buildPolicyContext(
      event.organizationId,
      event.occurredAt,
    );

    if (policyContext.organizationId !== event.organizationId) {
      throw new ConflictException('registry_billing_cross_tenant_organization');
    }

    const vehicleRow = policyContext.vehicles.find((v) => v.id === event.vehicleId);
    if (!vehicleRow || vehicleRow.organizationId !== event.organizationId) {
      throw new ConflictException('registry_billing_cross_tenant_vehicle');
    }

    const scopedAssignments = policyContext.assignments.filter(
      (assignment) =>
        assignment.vehicleId === event.vehicleId &&
        assignment.subscriptionItemId === baseItem.id &&
        assignment.organizationId === event.organizationId,
    );

    const effectiveActiveBillable = scopedAssignments.filter(
      (assignment) =>
        isApprovedBillableAssignment(assignment) &&
        isWithinPeriod(assignment.billableFrom, assignment.billableUntil, event.occurredAt),
    );

    if (effectiveActiveBillable.length > 1) {
      throw new ConflictException('multiple_effective_billing_assignments');
    }

    const wasBillable = wasVehicleBillableAtOffboardBoundary(policyContext, event.vehicleId);

    return this.prisma.$transaction(async (tx) => {
      if (effectiveActiveBillable.length === 1) {
        const assignment = effectiveActiveBillable[0]!;
        const current = await tx.billingBillableVehicleAssignment.findUnique({
          where: { id: assignment.id },
        });
        if (
          current &&
          current.organizationId === event.organizationId &&
          current.vehicleId === event.vehicleId &&
          current.status === BillingBillableVehicleAssignmentStatus.ACTIVE
        ) {
          await tx.billingBillableVehicleAssignment.update({
            where: { id: assignment.id },
            data: {
              status: BillingBillableVehicleAssignmentStatus.ENDED,
              billableUntil: event.occurredAt,
              reasonCode: 'REGISTRY_OFFBOARDED',
              reasonNote: `Registry offboard (${event.reason})`,
            },
          });
        }
      }

      if (!wasBillable) {
        return { outcome: 'noop', quantityCreated: false };
      }

      const quantityResult = await this.quantity.recordEventInTransaction(tx, {
        organizationId: event.organizationId,
        subscriptionId: baseItem.subscriptionId,
        subscriptionItemId: baseItem.id,
        vehicleId: event.vehicleId,
        eventType: BillingQuantityEventType.VEHICLE_DISCONNECTED,
        delta: -1,
        effectiveAt: event.occurredAt,
        recordedAt: new Date(),
        source: BillingQuantityEventSource.SYSTEM,
        actorUserId: event.actorUserId,
        reason: `Registry VEHICLE_OFFBOARDED (${event.reason})`,
        idempotencyKey,
        retroactiveAuthorized: true,
      });

      return {
        outcome: 'quantity_decrement',
        quantityEventId: quantityResult.event.id,
        quantityCreated: quantityResult.created,
      };
    });
  }
}
