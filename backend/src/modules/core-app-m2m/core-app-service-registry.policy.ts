import { ProductSlug } from '@prisma/client';
import { RETIRED_PLATFORM_PRODUCT_SLUGS } from '@modules/products/retired-platform-product-slugs';
import { CORE_APP_M2M_KNOWN_SCOPES } from './core-app-m2m.constants';

/**
 * First-class platform products that may be bound to a service client record.
 * Same catalog/entitlement model for RENTAL, FLEET, and VYMOD — no Fleet/VYMOD-only assumptions.
 *
 * Co-located Rental in SYNQDRIVE-alpha continues to use user JWT + existing guards;
 * M2M is for separate application backends (Fleet, VYMOD, and future split deploys), not
 * mandatory for in-process Rental domain code.
 */
const ELIGIBLE_SERVICE_CLIENT_PRODUCT_SLUGS = new Set<ProductSlug>([
  ProductSlug.RENTAL,
  ProductSlug.FLEET,
  ProductSlug.VYMOD,
]);

const KNOWN_SCOPE_SET = new Set<string>(CORE_APP_M2M_KNOWN_SCOPES);

export function isEligibleServiceClientProductSlug(slug: ProductSlug): boolean {
  if (RETIRED_PLATFORM_PRODUCT_SLUGS.has(slug)) {
    return false;
  }
  return ELIGIBLE_SERVICE_CLIENT_PRODUCT_SLUGS.has(slug);
}

/** @deprecated Use isEligibleServiceClientProductSlug — alias kept for PR1 review continuity */
export const isEligibleExternalAppProductSlug = isEligibleServiceClientProductSlug;

export function validateCoreAppM2mScopeDefinitions(scopes: string[]): string[] {
  const invalid = scopes.filter((s) => !KNOWN_SCOPE_SET.has(s));
  return invalid;
}

export function normalizeClientId(clientId: string): string {
  return clientId.trim();
}