import { BillingQuantityEventType, type Prisma } from '@prisma/client';
const VEHICLE_PROVISION_TYPES: ReadonlySet<BillingQuantityEventType> = new Set([
  BillingQuantityEventType.VEHICLE_CONNECTED,
  BillingQuantityEventType.VEHICLE_INCLUDED,
]);

const VEHICLE_DEPROVISION_TYPES: ReadonlySet<BillingQuantityEventType> = new Set([
  BillingQuantityEventType.VEHICLE_DISCONNECTED,
  BillingQuantityEventType.VEHICLE_EXCLUDED,
]);

export type VehicleLicenseQuantityStateAt = {
  subscriptionItemId: string;
  /** Net vehicle-specific license count from quantity ledger at `asOf` (0 or 1 for SaaS per-vehicle). */
  netVehicleLicenseCount: number;
  provisionedAtBoundary: boolean;
  alreadyDeprovisionedBeforeBoundary: boolean;
};

export async function resolveVehicleLicenseQuantityStateAt(
  tx: Prisma.TransactionClient,
  input: {
    organizationId: string;
    vehicleId: string;
    subscriptionItemId: string;
    asOf: Date;
  },
): Promise<VehicleLicenseQuantityStateAt> {
  const rows = await tx.billingQuantityEvent.findMany({
    where: {
      organizationId: input.organizationId,
      vehicleId: input.vehicleId,
      subscriptionItemId: input.subscriptionItemId,
    },
    orderBy: [{ effectiveAt: 'asc' }, { createdAt: 'asc' }],
    select: {
      eventType: true,
      delta: true,
      effectiveAt: true,
      createdAt: true,
    },
  });

  let net = 0;
  for (const row of rows) {
    if (row.effectiveAt > input.asOf) break;
    if (VEHICLE_PROVISION_TYPES.has(row.eventType)) net += 1;
    else if (VEHICLE_DEPROVISION_TYPES.has(row.eventType)) net -= 1;
    else net += row.delta;
  }

  return {
    subscriptionItemId: input.subscriptionItemId,
    netVehicleLicenseCount: net,
    provisionedAtBoundary: net > 0,
    alreadyDeprovisionedBeforeBoundary: net <= 0 && rows.some(
      (row) =>
        row.effectiveAt <= input.asOf &&
        VEHICLE_DEPROVISION_TYPES.has(row.eventType),
    ),
  };
}
