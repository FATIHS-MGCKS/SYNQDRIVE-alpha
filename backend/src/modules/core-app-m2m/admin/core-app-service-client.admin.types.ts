import {
  CoreAppServiceClientStatus,
  CoreAppServiceGrantStatus,
  ProductSlug,
} from '@prisma/client';

export const CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT = 'core.app.service_client.admin.v1' as const;

export type CoreAppServiceClientSummaryV1 = {
  id: string;
  clientId: string;
  displayName: string;
  productSlug: ProductSlug;
  status: CoreAppServiceClientStatus;
  allowedScopes: string[];
  credentialVersion: number;
  createdAt: string;
  updatedAt: string;
  activeGrantCount: number;
};

export type CoreAppServiceClientDetailV1 = CoreAppServiceClientSummaryV1;

export type CoreAppServiceClientListV1 = {
  contractVersion: typeof CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT;
  items: CoreAppServiceClientSummaryV1[];
};

export type CoreAppServiceClientCreatedV1 = {
  contractVersion: typeof CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT;
  client: CoreAppServiceClientDetailV1;
  /** Plaintext credential — returned once only; never stored or logged. */
  clientSecret: string;
};

export type CoreAppServiceCredentialRotatedV1 = {
  contractVersion: typeof CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT;
  client: CoreAppServiceClientDetailV1;
  clientSecret: string;
};

export type CoreAppServiceOrgGrantV1 = {
  id: string;
  organizationId: string;
  status: CoreAppServiceGrantStatus;
  grantVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type CoreAppServiceOrgGrantListV1 = {
  contractVersion: typeof CORE_APP_SERVICE_CLIENT_ADMIN_CONTRACT;
  serviceClientId: string;
  items: CoreAppServiceOrgGrantV1[];
};

export type MasterAdminAuditContext = {
  correlationId: string;
  route?: string;
  ipAddress?: string;
  userAgent?: string;
  actorUserId: string;
};