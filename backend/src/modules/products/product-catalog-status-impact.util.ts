import {
  OrgProductStatus,
  ProductCatalogStatus,
  ProductSlug,
  Prisma,
  VehicleProductGrantStatus,
} from '@prisma/client';

export type ProductCatalogStatusImpactSnapshot = {
  productSlug: ProductSlug;
  productId: string;
  currentCatalogStatus: ProductCatalogStatus;
  requestedTargetCatalogStatus: ProductCatalogStatus | null;
  organizationAssignmentsTotal: number;
  organizationProductsByStatus: Record<
    'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'CANCELLED' | 'OTHER',
    number
  >;
  activeVehicleGrants: number;
  admissionAfterTarget: {
    newOrganizationProductAssignments: 'ALLOWED' | 'BLOCKED';
    organizationProductReactivation: 'ALLOWED' | 'BLOCKED';
    newVehicleProductGrants: 'ALLOWED' | 'BLOCKED';
    vehicleAccessBroadening: 'ALLOWED' | 'BLOCKED';
  };
  guarantees: {
    existingOrganizationProductsPreserved: true;
    existingVehicleGrantsPreserved: true;
    runtimeEntitlementsForExistingAssignmentsPreserved: true;
    billingAndSubscriptionsUnchanged: true;
    businessLaunchReadinessUnchanged: true;
  };
  previewGeneratedAt: string;
  previewMayBeStaleBeforeWrite: true;
};

function admissionForTarget(target: ProductCatalogStatus | null): ProductCatalogStatusImpactSnapshot['admissionAfterTarget'] {
  const blocked =
    target === ProductCatalogStatus.DISABLED
      ? ('BLOCKED' as const)
      : target === ProductCatalogStatus.ACTIVE
        ? ('ALLOWED' as const)
        : ('ALLOWED' as const);
  const allowed = blocked === 'BLOCKED' ? 'BLOCKED' : 'ALLOWED';
  return {
    newOrganizationProductAssignments: allowed,
    organizationProductReactivation: allowed,
    newVehicleProductGrants: allowed,
    vehicleAccessBroadening: allowed,
  };
}

export async function buildProductCatalogStatusImpactSnapshot(
  db: Prisma.TransactionClient | { organizationProduct: Prisma.TransactionClient['organizationProduct']; vehicleProductGrant: Prisma.TransactionClient['vehicleProductGrant'] },
  input: {
    productId: string;
    productSlug: ProductSlug;
    currentCatalogStatus: ProductCatalogStatus;
    requestedTargetCatalogStatus?: ProductCatalogStatus | null;
  },
): Promise<ProductCatalogStatusImpactSnapshot> {
  const statusGroups = await db.organizationProduct.groupBy({
    by: ['status'],
    where: { productId: input.productId },
    _count: { _all: true },
  });

  const byStatus: ProductCatalogStatusImpactSnapshot['organizationProductsByStatus'] = {
    ACTIVE: 0,
    TRIAL: 0,
    SUSPENDED: 0,
    CANCELLED: 0,
    OTHER: 0,
  };

  let total = 0;
  for (const row of statusGroups) {
    const count = row._count._all;
    total += count;
    const key = row.status;
    if (key === OrgProductStatus.ACTIVE) byStatus.ACTIVE += count;
    else if (key === OrgProductStatus.TRIAL) byStatus.TRIAL += count;
    else if (key === OrgProductStatus.SUSPENDED) byStatus.SUSPENDED += count;
    else if (key === OrgProductStatus.CANCELLED) byStatus.CANCELLED += count;
    else byStatus.OTHER += count;
  }

  const activeVehicleGrants = await db.vehicleProductGrant.count({
    where: {
      productSlug: input.productSlug,
      status: VehicleProductGrantStatus.ACTIVE,
    },
  });

  const target = input.requestedTargetCatalogStatus ?? null;
  const admissionBasis = target ?? input.currentCatalogStatus;

  return {
    productSlug: input.productSlug,
    productId: input.productId,
    currentCatalogStatus: input.currentCatalogStatus,
    requestedTargetCatalogStatus: target,
    organizationAssignmentsTotal: total,
    organizationProductsByStatus: byStatus,
    activeVehicleGrants,
    admissionAfterTarget: admissionForTarget(admissionBasis),
    guarantees: {
      existingOrganizationProductsPreserved: true,
      existingVehicleGrantsPreserved: true,
      runtimeEntitlementsForExistingAssignmentsPreserved: true,
      billingAndSubscriptionsUnchanged: true,
      businessLaunchReadinessUnchanged: true,
    },
    previewGeneratedAt: new Date().toISOString(),
    previewMayBeStaleBeforeWrite: true,
  };
}