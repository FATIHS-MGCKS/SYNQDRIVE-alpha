import { ProductSlug } from '@prisma/client';
import { RETIRED_PLATFORM_PRODUCT_SLUGS } from '@modules/products/retired-platform-product-slugs';
import { CORE_APP_M2M_KNOWN_SCOPES } from './core-app-m2m.constants';

const ELIGIBLE_EXTERNAL_PRODUCT_SLUGS = new Set<ProductSlug>([
  ProductSlug.RENTAL,
  ProductSlug.FLEET,
  ProductSlug.VYMOD,
]);

const KNOWN_SCOPE_SET = new Set<string>(CORE_APP_M2M_KNOWN_SCOPES);

export function isEligibleExternalAppProductSlug(slug: ProductSlug): boolean {
  if (RETIRED_PLATFORM_PRODUCT_SLUGS.has(slug)) {
    return false;
  }
  return ELIGIBLE_EXTERNAL_PRODUCT_SLUGS.has(slug);
}

export function validateCoreAppM2mScopeDefinitions(scopes: string[]): string[] {
  const invalid = scopes.filter((s) => !KNOWN_SCOPE_SET.has(s));
  return invalid;
}

export function normalizeClientId(clientId: string): string {
  return clientId.trim();
}