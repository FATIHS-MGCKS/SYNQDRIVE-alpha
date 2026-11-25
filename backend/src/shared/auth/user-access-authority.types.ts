import type { AuthSessionClaims } from './auth-session-claims.types';

export const ACCESS_AUTHORITY_FAILURE_CODES = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_INACTIVE: 'USER_INACTIVE',
  SESSION_VERSION_MISMATCH: 'SESSION_VERSION_MISMATCH',
  SECURITY_VERSION_MISMATCH: 'SECURITY_VERSION_MISMATCH',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_BINDING_REQUIRED: 'SESSION_BINDING_REQUIRED',
  MEMBERSHIP_INVALID: 'MEMBERSHIP_INVALID',
  MEMBERSHIP_VERSION_MISMATCH: 'MEMBERSHIP_VERSION_MISMATCH',
  AUTHORITY_UNAVAILABLE: 'AUTHORITY_UNAVAILABLE',
} as const;

export type AccessJwtPayload = {
  sub: string;
  email?: string;
  name?: string;
  platformRole?: string;
  platformPermissions?: string[];
  membershipRole?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  sessionVersion?: number;
  membershipVersion?: number | null;
  membershipId?: string | null;
  tokenFamily?: string | null;
  securityVersion?: number;
};

export type ValidatedRequestUser = {
  id: string;
  email?: string;
  name?: string;
  platformRole: string;
  platformPermissions: string[];
  membershipRole: string | null;
  organizationId: string | null;
  organizationName: string | null;
  membershipId: string | null;
  sessionVersion: number;
  membershipVersion: number | null;
  tokenFamily: string | null;
  sessionClaims: AuthSessionClaims;
};