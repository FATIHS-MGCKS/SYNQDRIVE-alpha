export type CoreAppServiceClientSummary = {
  id: string;
  clientId: string;
  displayName: string;
  productSlug: string;
  status: 'ACTIVE' | 'DISABLED';
  allowedScopes: string[];
  credentialVersion: number;
  createdAt: string;
  updatedAt: string;
  activeGrantCount: number;
};

export type CoreAppServiceClientListDto = {
  contractVersion: string;
  items: CoreAppServiceClientSummary[];
};

export type CoreAppServiceClientCreatedDto = {
  contractVersion: string;
  client: CoreAppServiceClientSummary;
  clientSecret: string;
};

export type CoreAppServiceOrgGrant = {
  id: string;
  organizationId: string;
  status: 'ACTIVE' | 'REVOKED';
  grantVersion: number;
};

export type CoreAppServiceOrgGrantListDto = {
  contractVersion: string;
  serviceClientId: string;
  items: CoreAppServiceOrgGrant[];
};