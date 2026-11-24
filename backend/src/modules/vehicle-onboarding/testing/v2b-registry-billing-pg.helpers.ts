import { BillingQuantityService } from '@modules/billing/billing-quantity.service';
import { BillingQuantityVehicleIntegration } from '@modules/billing/billing-quantity-vehicle.integration';
import { BillableVehiclesService } from '@modules/billing/billable-vehicles.service';
import { BillingVehicleRegistryOffboardProjection } from '@modules/billing/registry-lifecycle/billing-vehicle-registry-offboard.projection';
import { VehicleRegistryLifecycleOutboxProcessor } from '../registry-lifecycle/vehicle-registry-lifecycle-outbox.processor';
import { VehicleRegistryLifecycleOutboxRepository } from '../registry-lifecycle/vehicle-registry-lifecycle-outbox.repository';
import { BusinessType, PrismaClient, ProductSlug } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { ensureOrganizationProductEntitlement } from './org-product-test.harness';

export async function createRentalOrg(prisma: PrismaClient): Promise<string> {
  const id = randomUUID();
  await prisma.organization.create({
    data: { id, companyName: `V2B-PR5 ${id.slice(0, 8)}`, businessType: BusinessType.RENTAL, status: 'ACTIVE' },
  });
  await ensureOrganizationProductEntitlement(prisma, id, ProductSlug.RENTAL);
  return id;
}

export async function ensureBasePlan(prisma: PrismaClient, orgId: string, quantity = 0) {
  const fleet = await prisma.billingCatalogProduct.findUniqueOrThrow({ where: { key: 'FLEET' } });
  const subId = randomUUID();
  await prisma.billingSubscription.create({
    data: {
      id: subId,
      organizationId: orgId,
      status: 'ACTIVE',
      currency: 'EUR',
    },
  });
  const item = await prisma.billingSubscriptionItem.create({
    data: {
      subscriptionId: subId,
      organizationId: orgId,
      billingProductId: fleet.id,
      itemRole: 'BASE_PLAN',
      quantity,
      status: 'ACTIVE',
      validFrom: new Date('2020-01-01'),
    },
  });
  const fixtureCreatedAt = new Date('2020-01-01T00:00:00.000Z');
  await prisma.$executeRaw`
    UPDATE billing_subscriptions SET created_at = ${fixtureCreatedAt} WHERE id = ${subId}
  `;
  await prisma.$executeRaw`
    UPDATE billing_subscription_items SET created_at = ${fixtureCreatedAt} WHERE id = ${item.id}
  `;
  return item;
}

export function registryBillingProcessor(prisma: PrismaClient) {
  const projection = new BillingVehicleRegistryOffboardProjection(
    prisma as never,
    new BillableVehiclesService(prisma as never),
    new BillingQuantityService(prisma as never),
  );
  const billingQuantity = new BillingQuantityVehicleIntegration(
    new BillingQuantityService(prisma as never),
    new BillableVehiclesService(prisma as never),
    projection,
  );
  return new VehicleRegistryLifecycleOutboxProcessor(
    prisma as never,
    new VehicleRegistryLifecycleOutboxRepository(prisma as never),
    projection,
    billingQuantity,
  );
}