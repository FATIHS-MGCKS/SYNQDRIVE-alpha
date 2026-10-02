import { Injectable, Logger } from '@nestjs/common';
import {
  BillingBillableVehicleAssignmentStatus,
  BillingQuantityEventSource,
  BillingQuantityEventType,
  type Prisma,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { BillableVehiclesService } from '../billable-vehicles.service';
import { BillingQuantityService } from '../billing-quantity.service';
import { resolveBaseSubscriptionItemAsOf } from '../domain/billing-base-subscription-item-as-of';
import { listEffectivelyBillableAssignmentsAt } from '../domain/billing-assignment-event-time';
import { wasVehicleBillableAtOffboardBoundary } from '../domain/billing-vehicle-offboard-boundary';
import { resolveVehicleLicenseQuantityStateAt } from '../domain/billing-vehicle-license-quantity-state';
import { computeQuantityTransition } from '../domain/billing-quantity-ledger';
import { assertRegistryOffboardQuantityEventSemantics } from './assert-registry-offboard-idempotency';
import { RegistryBillingPermanentIntegrityError } from './registry-billing-permanent-integrity.error';
import {
  buildRegistryOffboardBillingIdempotencyKey,
  type ValidatedVehicleOffboardedRegistryEvent,
} from './validate-vehicle-offboarded-registry-event';

export type RegistryOffboardBillingProjectionResult = {
  outcome: 'quantity_decrement' | 'noop';
  quantityEventId?: string;
  quantityCreated: boolean;
};

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

    return this.prisma.$transaction(async (tx) => {
      const baseItem = await resolveBaseSubscriptionItemAsOf(tx, event.organizationId, event.occurredAt);
      if (!baseItem) {
        this.logger.debug({
          msg: 'billing.registry_offboard.noop_no_base_plan',
          organizationId: event.organizationId,
          vehicleId: event.vehicleId,
          eventId: event.eventId,
        });
        return { outcome: 'noop', quantityCreated: false };
      }

      const existingQuantity = await tx.billingQuantityEvent.findUnique({
        where: { idempotencyKey },
      });
      if (existingQuantity) {
        assertRegistryOffboardQuantityEventSemantics(event, existingQuantity, baseItem.id);
        return {
          outcome: 'quantity_decrement',
          quantityEventId: existingQuantity.id,
          quantityCreated: false,
        };
      }

      await tx.$executeRaw`SELECT id FROM billing_subscription_items WHERE id = ${baseItem.id} FOR UPDATE`;

      const policyContext = await this.billableVehicles.buildEventTimePolicyContext(
        event.organizationId,
        event.occurredAt,
        tx,
      );

      if (policyContext.organizationId !== event.organizationId) {
        throw new RegistryBillingPermanentIntegrityError(
          'REGISTRY_BILLING_CROSS_TENANT',
          'registry_billing_cross_tenant_organization',
        );
      }

      const vehicleRow = policyContext.vehicles.find((v) => v.id === event.vehicleId);
      if (!vehicleRow || vehicleRow.organizationId !== event.organizationId) {
        throw new RegistryBillingPermanentIntegrityError(
          'REGISTRY_BILLING_CROSS_TENANT',
          'registry_billing_cross_tenant_vehicle',
        );
      }

      const scopedAssignments = policyContext.assignments.filter(
        (assignment) =>
          assignment.vehicleId === event.vehicleId &&
          assignment.subscriptionItemId === baseItem.id &&
          assignment.organizationId === event.organizationId,
      );

      const effectiveBillable = listEffectivelyBillableAssignmentsAt(
        scopedAssignments,
        event.occurredAt,
      );

      if (effectiveBillable.length > 1) {
        throw new RegistryBillingPermanentIntegrityError(
          'MULTIPLE_EFFECTIVE_BILLING_ASSIGNMENTS',
          'multiple_effective_billing_assignments',
        );
      }

      const licenseState = await resolveVehicleLicenseQuantityStateAt(tx, {
        organizationId: event.organizationId,
        vehicleId: event.vehicleId,
        subscriptionItemId: baseItem.id,
        asOf: event.occurredAt,
      });

      if (licenseState.alreadyDeprovisionedBeforeBoundary) {
        return { outcome: 'noop', quantityCreated: false };
      }

      const wasBillable = wasVehicleBillableAtOffboardBoundary(policyContext, event.vehicleId);

      if (effectiveBillable.length === 1) {
        await this.endExplicitAssignmentAtOffboard(tx, event, effectiveBillable[0]!.id);
      }

      if (!wasBillable) {
        return { outcome: 'noop', quantityCreated: false };
      }

      if (!licenseState.provisionedAtBoundary) {
        return { outcome: 'noop', quantityCreated: false };
      }

      const timeline = await this.loadTimeline(tx, baseItem.id);
      const recordedAt = new Date();
      const { quantityAfter } = computeQuantityTransition(timeline, {
        effectiveAt: event.occurredAt,
        recordedAt,
        delta: -1,
      });
      if (quantityAfter < 0) {
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
        recordedAt,
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

  private async endExplicitAssignmentAtOffboard(
    tx: Prisma.TransactionClient,
    event: ValidatedVehicleOffboardedRegistryEvent,
    assignmentId: string,
  ): Promise<void> {
    const current = await tx.billingBillableVehicleAssignment.findUnique({
      where: { id: assignmentId },
    });
    if (
      !current ||
      current.organizationId !== event.organizationId ||
      current.vehicleId !== event.vehicleId
    ) {
      return;
    }
    if (current.status === BillingBillableVehicleAssignmentStatus.ENDED) {
      return;
    }
    await tx.billingBillableVehicleAssignment.update({
      where: { id: assignmentId },
      data: {
        status: BillingBillableVehicleAssignmentStatus.ENDED,
        billableUntil: event.occurredAt,
        reasonCode: 'REGISTRY_OFFBOARDED',
        reasonNote: `Registry offboard (${event.reason})`,
      },
    });
  }

  private async loadTimeline(
    tx: Prisma.TransactionClient,
    subscriptionItemId: string,
  ) {
    const rows = await tx.billingQuantityEvent.findMany({
      where: { subscriptionItemId },
      orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        effectiveAt: true,
        createdAt: true,
        delta: true,
      },
    });
    return rows.map((row, index) => ({
      effectiveAt: row.effectiveAt,
      recordedAt: row.createdAt,
      delta: row.delta,
      tieBreaker: index,
    }));
  }
}
