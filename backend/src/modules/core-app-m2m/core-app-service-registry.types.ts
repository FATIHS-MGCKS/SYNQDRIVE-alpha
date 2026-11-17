import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  ProductSlug,
} from '@prisma/client';

export const CoreAppServiceRegistryFailureCode = {
  RUNTIME_DISABLED: 'RUNTIME_DISABLED',
  CLIENT_NOT_FOUND: 'CLIENT_NOT_FOUND',
  CLIENT_DISABLED: 'CLIENT_DISABLED',
  ORG_GRANT_NOT_FOUND: 'ORG_GRANT_NOT_FOUND',
  ORG_GRANT_REVOKED: 'ORG_GRANT_REVOKED',
  ORG_GRANT_ORG_MISMATCH: 'ORG_GRANT_ORG_MISMATCH',
  PRODUCT_SLUG_RETIRED: 'PRODUCT_SLUG_RETIRED',
  PRODUCT_SLUG_UNSUPPORTED: 'PRODUCT_SLUG_UNSUPPORTED',
  INVALID_SCOPE: 'INVALID_SCOPE',
} as const;

export type CoreAppServiceRegistryFailureCode =
  (typeof CoreAppServiceRegistryFailureCode)[keyof typeof CoreAppServiceRegistryFailureCode];

export type CoreAppServiceRegistryValidationSuccess = {
  ok: true;
  clientId: string;
  productSlug: ProductSlug;
  organizationId: string;
  clientStatus: CoreAppServiceClientStatus;
  grantStatus: CoreAppServiceGrantStatus;
  allowedScopes: string[];
};

export type CoreAppServiceRegistryValidationFailure = {
  ok: false;
  code: CoreAppServiceRegistryFailureCode;
  message: string;
};

export type CoreAppServiceRegistryValidationResult =
  | CoreAppServiceRegistryValidationSuccess
  | CoreAppServiceRegistryValidationFailure;