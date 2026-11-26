import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  OrgProductStatus,
  Prisma,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import type { Prisma as PrismaTypes } from '@prisma/client';
import { isOrganizationProductOperationallyEntitled } from '../entitlements/entitlements-policy';
import {
  lockProductCatalogRowBySlug,
  type LockedProductCatalogRow,
} from '../product-catalog-admission.authority';

const GRANT_ELIGIBLE_REGISTRY_LIFECYCLES: VehicleRegistryLifecycle[] = [VehicleRegistryLifecycle.ACTIVE];

type TxWithRaw = PrismaTypes.TransactionClient;

export type LockedOrganizationProductRow = {
  id: string;
  status: OrgProductStatus;
};

export type LockedVehicleRow = {
  id: string;
  organizationId: string;
  registryLifecycle: VehicleRegistryLifecycle;
};

export type LockedVehicleProductGrantRow = {
  id: string;
  organizationId: string;
  vehicleId: string;
  productSlug: ProductSlug;
  status: VehicleProductGrantStatus;
  grantVersion: number;
  grantedAt: Date;
  grantedByUserId: string;
  revokedAt: Date | null;
  revokedByUserId: string | null;
};

/**
 * Canonical grant-tx lock order (matches catalog-gated org-product writers):
 * products → organization_products → vehicles → vehicle_product_grants
 */
export async function lockGrantMutationScope(
  tx: TxWithRaw,
  input: { organizationId: string; vehicleId: string; productSlug: ProductSlug },
): Promise<{
  catalog: LockedProductCatalogRow;
  organizationProduct: LockedOrganizationProductRow;
  vehicle: LockedVehicleRow;
  existingGrant: LockedVehicleProductGrantRow | null;
}> {
  const catalog = await lockProductCatalogRowBySlug(tx, input.productSlug);
  if (!catalog) {
    throw new NotFoundException(`Product with slug "${input.productSlug}" not found`);
  }

  const orgRows = await tx.$queryRaw<LockedOrganizationProductRow[]>(Prisma.sql`
    SELECT id, status
    FROM organization_products
    WHERE organization_id = ${input.organizationId}
      AND product_id = ${catalog.id}
    FOR UPDATE
  `);
  const organizationProduct = orgRows[0];
  if (!organizationProduct || !isOrganizationProductOperationallyEntitled(organizationProduct.status)) {
    throw new ForbiddenException(
      `Product license '${input.productSlug}' is not active for this organization`,
    );
  }

  const vehicleRows = await tx.$queryRaw<LockedVehicleRow[]>(Prisma.sql`
    SELECT id, organization_id AS "organizationId", registry_lifecycle AS "registryLifecycle"
    FROM vehicles
    WHERE id = ${input.vehicleId}
    FOR UPDATE
  `);
  const vehicle = vehicleRows[0];
  if (!vehicle) {
    throw new NotFoundException('Vehicle not found');
  }
  if (vehicle.organizationId !== input.organizationId) {
    throw new NotFoundException('Vehicle not found');
  }
  if (!GRANT_ELIGIBLE_REGISTRY_LIFECYCLES.includes(vehicle.registryLifecycle)) {
    throw new BadRequestException(
      'Vehicle registry lifecycle does not allow product grants',
    );
  }

  const grantRows = await tx.$queryRaw<LockedVehicleProductGrantRow[]>(Prisma.sql`
    SELECT
      id,
      organization_id AS "organizationId",
      vehicle_id AS "vehicleId",
      product_slug AS "productSlug",
      status,
      grant_version AS "grantVersion",
      granted_at AS "grantedAt",
      granted_by_user_id AS "grantedByUserId",
      revoked_at AS "revokedAt",
      revoked_by_user_id AS "revokedByUserId"
    FROM vehicle_product_grants
    WHERE vehicle_id = ${input.vehicleId}
      AND product_slug = ${input.productSlug}::"ProductSlug"
    FOR UPDATE
  `);

  return {
    catalog,
    organizationProduct,
    vehicle,
    existingGrant: grantRows[0] ?? null,
  };
}

export async function lockVehicleProductGrantRowForUpdate(
  tx: TxWithRaw,
  input: { organizationId: string; vehicleId: string; productSlug: ProductSlug },
): Promise<LockedVehicleProductGrantRow | null> {
  const grantRows = await tx.$queryRaw<LockedVehicleProductGrantRow[]>(Prisma.sql`
    SELECT
      id,
      organization_id AS "organizationId",
      vehicle_id AS "vehicleId",
      product_slug AS "productSlug",
      status,
      grant_version AS "grantVersion",
      granted_at AS "grantedAt",
      granted_by_user_id AS "grantedByUserId",
      revoked_at AS "revokedAt",
      revoked_by_user_id AS "revokedByUserId"
    FROM vehicle_product_grants
    WHERE vehicle_id = ${input.vehicleId}
      AND product_slug = ${input.productSlug}::"ProductSlug"
    FOR UPDATE
  `);
  const row = grantRows[0];
  if (row && row.organizationId !== input.organizationId) {
    throw new NotFoundException('Vehicle product grant not found');
  }
  return row ?? null;
}