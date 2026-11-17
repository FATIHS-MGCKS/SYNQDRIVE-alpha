import { OrgProductStatus } from '@prisma/client';

/**
 * Statuses that satisfy operational / route guards (ProductLicenseGuard, vehicle grants, vehicle access, VO-4 activation).
 * TRIAL is intentionally excluded — UI preview only via `resolveEntitlementCapabilities`.
 */
export const ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES: readonly OrgProductStatus[] = [
  OrgProductStatus.ACTIVE,
];

/** Alias for vehicle onboarding readiness / activation row locks (same ACTIVE-only semantics). */
export const ORGANIZATION_PRODUCT_VEHICLE_ACTIVATION_ENTITLEMENT_STATUSES =
  ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES;

/** Alias for explicit vehicle product grants (same ACTIVE-only semantics). */
export const ORGANIZATION_PRODUCT_VEHICLE_GRANT_ENTITLEMENT_STATUSES =
  ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES;

export function isOrganizationProductOperationallyEntitled(
  status: OrgProductStatus | null | undefined,
): boolean {
  return (
    status != null && (ORGANIZATION_PRODUCT_OPERATIONAL_ENTITLEMENT_STATUSES as OrgProductStatus[]).includes(status)
  );
}

/**
 * Central entitlement capability policy for core.entitlements.v1.
 *
 * canAccessProductUi — whether the org may use product-facing UI surfaces for this slug (declared).
 * canActivateVehicles — whether vehicle onboarding/activation may proceed (VO-aligned: ACTIVE only).
 *
 * TRIAL vehicle activation (B5): fail-closed here (ACTIVE only for activation), matching
 * product-entitlement.authority READINESS_PRODUCT_ENTITLEMENT_STATUSES.
 *
 * These capabilities are **not** wired to every Alpha route guard in P2-PR2; ProductLicenseGuard remains ACTIVE-only.
 */
export type EntitlementCapabilities = {
  canAccessProductUi: boolean;
  canActivateVehicles: boolean;
};

export function resolveEntitlementCapabilities(
  status: OrgProductStatus | null | undefined,
): EntitlementCapabilities {
  if (!status) {
    return { canAccessProductUi: false, canActivateVehicles: false };
  }

  switch (status) {
    case OrgProductStatus.ACTIVE:
      return { canAccessProductUi: true, canActivateVehicles: true };
    case OrgProductStatus.TRIAL:
      return { canAccessProductUi: true, canActivateVehicles: false };
    case OrgProductStatus.SUSPENDED:
    case OrgProductStatus.CANCELLED:
      return { canAccessProductUi: false, canActivateVehicles: false };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function isEntitledForAnyAccess(status: OrgProductStatus | null | undefined): boolean {
  return resolveEntitlementCapabilities(status).canAccessProductUi;
}

/**
 * Factual clock comparison only. Does not gate capabilities — see `ORGANIZATION_PRODUCT_EXPIRES_AT_POLICY`.
 */
export function isOrganizationProductLicenseTermExpired(
  expiresAt: Date | null | undefined,
  asOf: Date = new Date(),
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < asOf.getTime();
}

/**
 * Runtime enforcement of `OrganizationProduct.expiresAt` is undefined in existing authorities:
 * ProductLicenseGuard, VO-4 `assertOrganizationProductEntitled`, and billing legacy resolver
 * ignore `expiresAt` (status-only). Do not infer expiry-based denial here without owner decision.
 */
export const ORGANIZATION_PRODUCT_EXPIRES_AT_POLICY = 'NOT_ENFORCED_STATUS_ONLY_PARITY' as const;