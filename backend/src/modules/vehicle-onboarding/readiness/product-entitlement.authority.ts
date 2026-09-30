import { OrgProductStatus, ProductSlug, Prisma } from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

/**
 * Aligns with ProductLicenseGuard: only ACTIVE organization product rows grant access.
 * (TRIAL/SUSPENDED/CANCELLED do not satisfy product license for readiness.)
 */
export const READINESS_PRODUCT_ENTITLEMENT_STATUSES: OrgProductStatus[] = [OrgProductStatus.ACTIVE];

/** Row lock mode for activation-time entitlement checks (blocks concurrent UPDATE/DELETE). */
export const ACTIVATION_PRODUCT_ENTITLEMENT_ROW_LOCK_MODE = 'FOR_UPDATE';

export type OrganizationProductEntitlementRow = {
  id: string;
  status: OrgProductStatus;
  productId: string;
};

type EntitlementDb = {
  $queryRaw: PrismaTypes.TransactionClient['$queryRaw'];
  organizationProduct: PrismaTypes.TransactionClient['organizationProduct'];
};

/**
 * Locks the ACTIVE OrganizationProduct row for (organizationId, ProductSlug) until commit.
 * Returns null when no ACTIVE row exists at lock time.
 */
export async function lockActiveOrganizationProductEntitlementRow(
  tx: EntitlementDb,
  organizationId: string,
  selectedProduct: ProductSlug,
): Promise<OrganizationProductEntitlementRow | null> {
  const candidate = await tx.organizationProduct.findFirst({
    where: {
      organizationId,
      product: { slug: selectedProduct },
      status: { in: READINESS_PRODUCT_ENTITLEMENT_STATUSES },
    },
    select: { id: true },
  });
  if (!candidate) {
    return null;
  }
  const rows = await tx.$queryRaw<OrganizationProductEntitlementRow[]>(Prisma.sql`
    SELECT id, status, product_id AS "productId"
    FROM organization_products
    WHERE id = ${candidate.id}
      AND status = 'ACTIVE'::"OrgProductStatus"
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

export async function assertOrganizationProductEntitled(
  db: EntitlementDb,
  organizationId: string,
  selectedProduct: ProductSlug,
): Promise<{ status: OrgProductStatus; productId: string }> {
  const row = await db.organizationProduct.findFirst({
    where: {
      organizationId,
      product: { slug: selectedProduct },
      status: { in: READINESS_PRODUCT_ENTITLEMENT_STATUSES },
    },
    include: { product: true },
  });
  if (!row) {
    throw new VehicleOnboardingError(
      'PRODUCT_ENTITLEMENT_NOT_ACTIVE',
      `Organization is not entitled to product ${selectedProduct}`,
      { selectedProduct },
    );
  }
  return { status: row.status, productId: row.productId };
}

export interface ActivationEntitlementLockOptions {
  /** Integration-test hook after entitlement row FOR UPDATE is acquired. */
  afterRowLock?: () => void | Promise<void>;
}

/**
 * Activation-safe entitlement check: row-level FOR UPDATE on ACTIVE OrganizationProduct
 * until the activation transaction commits.
 */
export async function assertOrganizationProductEntitledForActivation(
  tx: EntitlementDb,
  organizationId: string,
  selectedProduct: ProductSlug,
  opts?: ActivationEntitlementLockOptions,
): Promise<{ status: OrgProductStatus; productId: string }> {
  const locked = await lockActiveOrganizationProductEntitlementRow(tx, organizationId, selectedProduct);
  if (!locked) {
    throw new VehicleOnboardingError(
      'PRODUCT_ENTITLEMENT_NOT_ACTIVE',
      `Organization is not entitled to product ${selectedProduct}`,
      { selectedProduct },
    );
  }
  if (opts?.afterRowLock) {
    await opts.afterRowLock();
  }
  return { status: locked.status, productId: locked.productId };
}

export async function isOrganizationProductEntitled(
  db: EntitlementDb,
  organizationId: string,
  selectedProduct: ProductSlug,
): Promise<boolean> {
  try {
    await assertOrganizationProductEntitled(db, organizationId, selectedProduct);
    return true;
  } catch (e) {
    if (e instanceof VehicleOnboardingError && e.code === 'PRODUCT_ENTITLEMENT_NOT_ACTIVE') {
      return false;
    }
    throw e;
  }
}
