import type { ProductSlug } from '@prisma/client';
import {
  CORE_APP_M2M_TOKEN_CONTRACT_VERSION,
  CORE_APP_M2M_TOKEN_TYPE,
} from './core-app-m2m-jwt.config';

export type CoreAppM2mTokenExchangeResponse = {
  contractVersion: typeof CORE_APP_M2M_TOKEN_CONTRACT_VERSION;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
  issuedAt: string;
};

export type CoreAppM2mServiceJwtClaims = {
  sub: string;
  token_type: typeof CORE_APP_M2M_TOKEN_TYPE;
  organizationId: string;
  productSlug: ProductSlug;
  scopes: string[];
  credentialVersion: number;
  grantVersion: number;
};