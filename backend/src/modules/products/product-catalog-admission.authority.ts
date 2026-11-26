import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  OrgProductStatus,
  OrganizationProductVehicleAccessMode,
  Prisma,
  ProductCatalogStatus,
  ProductSlug,
} from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';

/** Typed denial reasons for catalog-gated admission (P2A). */
export const PRODUCT_CATALOG_ADMISSION_DENIAL_REASON = {
  CATALOG_DISABLED: 'CATALOG_DISABLED',
  CATALOG_STATUS_UNKNOWN: 'CATALOG_STATUS_UNKNOWN',
} as const;

export type ProductCatalogAdmissionDenialReason =
  (typeof PRODUCT_CATALOG_ADMISSION_DENIAL_REASON)[keyof typeof PRODUCT_CATALOG_ADMISSION_DENIAL_REASON];

export const PRODUCT_CATALOG_ADMISSION_OPERATION = {
  ORGANIZATION_PRODUCT_NEW: 'ORGANIZATION_PRODUCT_NEW',
  ORGANIZATION_PRODUCT_REACTIVATION: 'ORGANIZATION_PRODUCT_REACTIVATION',
  VEHICLE_PRODUCT_GRANT: 'VEHICLE_PRODUCT_GRANT',
  VEHICLE_ACCESS_MODE_BROADEN: 'VEHICLE_ACCESS_MODE_BROADEN',
} as const;

export type ProductCatalogAdmissionOperation =
  (typeof PRODUCT_CATALOG_ADMISSION_OPERATION)[keyof typeof PRODUCT_CATALOG_ADMISSION_OPERATION];

export type LockedProductCatalogRow = {
  id: string;
  slug: ProductSlug;
  catalogStatus: ProductCatalogStatus;
};

type CatalogAdmissionDb = {
  $queryRaw: PrismaTypes.TransactionClient['$queryRaw'];
};

export class ProductCatalogAdmissionDeniedError extends ForbiddenException {
  constructor(
    public readonly reason: ProductCatalogAdmissionDenialReason,
    public readonly productSlug: ProductSlug,
    public readonly operation: ProductCatalogAdmissionOperation,
  ) {
    super({
      statusCode: 403,
      error: 'PRODUCT_CATALOG_ADMISSION_DENIED',
      message: `Product catalog admission denied for ${productSlug} (${operation})`,
      reason,
      productSlug,
      operation,
    });
  }
}

/**
 * Row-level lock on the platform `products` catalog row for the slug until transaction commit.
 * Reuse for P2B catalog status transitions to serialize with admission writes.
 */
export async function lockProductCatalogRowBySlug(
  tx: CatalogAdmissionDb,
  productSlug: ProductSlug,
): Promise<LockedProductCatalogRow | null> {
  const rows = await tx.$queryRaw<LockedProductCatalogRow[]>(Prisma.sql`
    SELECT id, slug, catalog_status AS "catalogStatus"
    FROM products
    WHERE slug = ${productSlug}::"ProductSlug"
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

export async function assertProductCatalogRowAdmissionAllowed(
  tx: CatalogAdmissionDb,
  productSlug: ProductSlug,
  operation: ProductCatalogAdmissionOperation,
): Promise<LockedProductCatalogRow> {
  const locked = await lockProductCatalogRowBySlug(tx, productSlug);
  if (!locked) {
    throw new NotFoundException(`Product with slug "${productSlug}" not found`);
  }
  assertProductCatalogAdmissionAllowed(locked.catalogStatus, operation, productSlug);
  return locked;
}

export function assertProductCatalogAdmissionAllowed(
  catalogStatus: ProductCatalogStatus,
  operation: ProductCatalogAdmissionOperation,
  productSlug: ProductSlug,
): void {
  if (catalogStatus === ProductCatalogStatus.ACTIVE) {
    return;
  }
  if (catalogStatus === ProductCatalogStatus.DISABLED) {
    throw new ProductCatalogAdmissionDeniedError(
      PRODUCT_CATALOG_ADMISSION_DENIAL_REASON.CATALOG_DISABLED,
      productSlug,
      operation,
    );
  }
  throw new ProductCatalogAdmissionDeniedError(
    PRODUCT_CATALOG_ADMISSION_DENIAL_REASON.CATALOG_STATUS_UNKNOWN,
    productSlug,
    operation,
  );
}

export function isOrganizationProductAdmissionReactivation(
  currentStatus: OrgProductStatus,
  targetStatus: OrgProductStatus = OrgProductStatus.ACTIVE,
): boolean {
  return currentStatus !== targetStatus && targetStatus === OrgProductStatus.ACTIVE;
}

export function isOrganizationProductAdmissionCreate(existing: { status: OrgProductStatus } | null): boolean {
  return existing == null;
}

export function isVehicleAccessScopeBroadening(
  from: OrganizationProductVehicleAccessMode,
  to: OrganizationProductVehicleAccessMode,
): boolean {
  return (
    from === OrganizationProductVehicleAccessMode.SELECTED_VEHICLES &&
    to === OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE
  );
}