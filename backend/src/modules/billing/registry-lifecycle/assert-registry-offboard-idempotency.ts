import { BillingQuantityEventType, type BillingQuantityEvent } from '@prisma/client';
import { RegistryBillingPermanentIntegrityError } from './registry-billing-permanent-integrity.error';
import type { ValidatedVehicleOffboardedRegistryEvent } from './validate-vehicle-offboarded-registry-event';

export function assertRegistryOffboardQuantityEventSemantics(
  event: ValidatedVehicleOffboardedRegistryEvent,
  existing: BillingQuantityEvent,
  expectedSubscriptionItemId: string,
): void {
  const mismatches: string[] = [];
  if (existing.organizationId !== event.organizationId) mismatches.push('organizationId');
  if (existing.vehicleId !== event.vehicleId) mismatches.push('vehicleId');
  if (existing.eventType !== BillingQuantityEventType.VEHICLE_DISCONNECTED) mismatches.push('eventType');
  if (existing.delta !== -1) mismatches.push('delta');
  if (existing.subscriptionItemId !== expectedSubscriptionItemId) mismatches.push('subscriptionItemId');
  if (existing.effectiveAt.getTime() !== event.occurredAt.getTime()) mismatches.push('effectiveAt');

  if (mismatches.length > 0) {
    throw new RegistryBillingPermanentIntegrityError(
      'BILLING_IDEMPOTENCY_SEMANTIC_COLLISION',
      `Registry offboard idempotency collision: ${mismatches.join(', ')}`,
    );
  }
}
