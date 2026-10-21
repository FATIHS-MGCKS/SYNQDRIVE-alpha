import { Injectable, Logger } from '@nestjs/common';
import { BillingQuantityEventSource } from '@prisma/client';
import { BillableVehiclesService } from './billable-vehicles.service';
import { BillingQuantityService } from './billing-quantity.service';
import { buildQuantityIdempotencyKey } from './domain/billing-quantity-ledger';
import {
  BillingVehicleRegistryOffboardProjection,
  type RegistryOffboardBillingProjectionResult,
} from './registry-lifecycle/billing-vehicle-registry-offboard.projection';
import type { ValidatedVehicleOffboardedRegistryEvent } from './registry-lifecycle/validate-vehicle-offboarded-registry-event';

@Injectable()
export class BillingQuantityVehicleIntegration {
  private readonly logger = new Logger(BillingQuantityVehicleIntegration.name);

  constructor(
    private readonly quantity: BillingQuantityService,
    private readonly billableVehicles: BillableVehiclesService,
    private readonly registryOffboardProjection: BillingVehicleRegistryOffboardProjection,
  ) {}

  async onVehicleProvisioned(input: {
    organizationId: string;
    vehicleId: string;
    actorUserId?: string | null;
    effectiveAt?: Date;
    idempotencyKey?: string;
    retroactiveAuthorized?: boolean;
  }) {
    const baseItem = await this.quantity.resolveBaseSubscriptionItem(input.organizationId);
    if (!baseItem) {
      this.logger.debug({
        msg: 'billing.quantity.vehicle_provision_skipped_no_base_plan',
        organizationId: input.organizationId,
        vehicleId: input.vehicleId,
      });
      return null;
    }

    const billable = await this.billableVehicles.getBillableConnectedVehiclesForOrganization(
      input.organizationId,
      input.effectiveAt ?? new Date(),
    );
    if (!billable.billableVehicles.some((vehicle) => vehicle.id === input.vehicleId)) {
      return null;
    }

    return this.quantity.recordVehicleLicenseAdded({
      organizationId: input.organizationId,
      subscriptionId: baseItem.subscriptionId,
      subscriptionItemId: baseItem.id,
      vehicleId: input.vehicleId,
      effectiveAt: input.effectiveAt,
      source: BillingQuantityEventSource.API,
      actorUserId: input.actorUserId,
      reason: 'Vehicle provisioned for billing',
      idempotencyKey:
        input.idempotencyKey ??
        buildQuantityIdempotencyKey([
          'vehicle',
          'connected',
          input.organizationId,
          input.vehicleId,
          (input.effectiveAt ?? new Date()).toISOString(),
        ]),
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }

  async onVehicleOffboardedLifecycleEvent(
    event: ValidatedVehicleOffboardedRegistryEvent,
  ): Promise<RegistryOffboardBillingProjectionResult> {
    return this.registryOffboardProjection.onVehicleOffboardedLifecycleEvent(event);
  }

  async onVehicleRemoved(input: {
    organizationId: string;
    vehicleId: string;
    actorUserId?: string | null;
    effectiveAt?: Date;
    idempotencyKey?: string;
    retroactiveAuthorized?: boolean;
  }) {
    const baseItem = await this.quantity.resolveBaseSubscriptionItem(input.organizationId);
    if (!baseItem) return null;

    const billable = await this.billableVehicles.getBillableConnectedVehiclesForOrganization(
      input.organizationId,
      input.effectiveAt ?? new Date(),
    );
    const wasBillable = billable.billableVehicles.some((vehicle) => vehicle.id === input.vehicleId);
    if (!wasBillable) {
      return null;
    }

    return this.quantity.recordVehicleLicenseRemoved({
      organizationId: input.organizationId,
      subscriptionId: baseItem.subscriptionId,
      subscriptionItemId: baseItem.id,
      vehicleId: input.vehicleId,
      effectiveAt: input.effectiveAt,
      source: BillingQuantityEventSource.API,
      actorUserId: input.actorUserId,
      reason: 'Vehicle removed from billing',
      idempotencyKey:
        input.idempotencyKey ??
        buildQuantityIdempotencyKey([
          'vehicle',
          'disconnected',
          input.organizationId,
          input.vehicleId,
          (input.effectiveAt ?? new Date()).toISOString(),
        ]),
      retroactiveAuthorized: input.retroactiveAuthorized,
    });
  }
}
