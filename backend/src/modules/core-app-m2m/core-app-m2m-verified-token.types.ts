import type { ProductSlug } from '@prisma/client';

export type CoreAppM2mVerifiedToken = {
  clientId: string;
  organizationId: string;
  productSlug: ProductSlug;
  scopes: string[];
  credentialVersion: number;
  grantVersion: number;
};

export const CORE_APP_M2M_REQUEST_AUTH_KEY = 'coreAppM2mAuth' as const;