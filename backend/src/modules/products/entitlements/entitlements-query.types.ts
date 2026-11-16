import type { OrgProductPlan, OrgProductStatus, ProductSlug } from '@prisma/client';
import type {
  EntitlementCapabilities,
  ORGANIZATION_PRODUCT_EXPIRES_AT_POLICY,
} from './entitlements-policy';

export type OrganizationProductExpiresAtPolicy = typeof ORGANIZATION_PRODUCT_EXPIRES_AT_POLICY;

export const CORE_ENTITLEMENTS_CONTRACT_VERSION = 'core.entitlements.v1' as const;

/** Alpha P2: service authentication (M2M) is deferred to P3 — never report operational readiness. */
export function resolveCoreEntitlementsM2mProductionReady(): boolean {
  return false;
}

export type EntitlementProductRecordV1 = {
  contractVersion: typeof CORE_ENTITLEMENTS_CONTRACT_VERSION;
  organizationId: string;
  productSlug: ProductSlug;
  productId: string | null;
  productName: string | null;
  entitled: boolean;
  status: OrgProductStatus | null;
  plan: OrgProductPlan | null;
  activatedAt: string | null;
  expiresAt: string | null;
  /** Factual: expiresAt is set and before evaluation time (does not affect capabilities in P2). */
  licenseTermExpired: boolean;
  /**
   * Declared capabilities for consumers — not wired to all route guards (B2). `canAccessProductUi` is
   * **not** enforced by ProductLicenseGuard (ACTIVE-only, no TRIAL).
   */
  capabilities: EntitlementCapabilities;
  expiresAtPolicy: OrganizationProductExpiresAtPolicy;
};

export type EntitlementOrganizationListV1 = {
  contractVersion: typeof CORE_ENTITLEMENTS_CONTRACT_VERSION;
  organizationId: string;
  m2mProductionReady: boolean;
  products: EntitlementProductRecordV1[];
};