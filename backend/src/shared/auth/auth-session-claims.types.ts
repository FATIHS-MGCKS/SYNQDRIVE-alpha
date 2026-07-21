export type AuthMethod = 'pwd' | 'totp' | 'recovery' | 'webauthn';

export const ASSURANCE_LEVEL_PASSWORD = 1;
export const ASSURANCE_LEVEL_MFA = 2;

export interface AuthSessionClaims {
  assuranceLevel: number;
  authenticatedAt: string;
  mfaAuthenticatedAt: string | null;
  authMethods: AuthMethod[];
  securityVersion: number;
}

export function buildPasswordOnlyClaims(securityVersion = 0): AuthSessionClaims {
  const now = new Date().toISOString();
  return {
    assuranceLevel: ASSURANCE_LEVEL_PASSWORD,
    authenticatedAt: now,
    mfaAuthenticatedAt: null,
    authMethods: ['pwd'],
    securityVersion,
  };
}

export function buildMfaClaims(
  input: {
    authenticatedAt?: string;
    mfaAuthenticatedAt?: string;
    authMethods?: AuthMethod[];
    securityVersion?: number;
  } = {},
): AuthSessionClaims {
  const now = new Date().toISOString();
  const mfaAt = input.mfaAuthenticatedAt ?? now;
  return {
    assuranceLevel: ASSURANCE_LEVEL_MFA,
    authenticatedAt: input.authenticatedAt ?? now,
    mfaAuthenticatedAt: mfaAt,
    authMethods: input.authMethods ?? ['pwd', 'totp'],
    securityVersion: input.securityVersion ?? 0,
  };
}

export function sessionClaimsFromJwt(decoded: Record<string, unknown>): AuthSessionClaims {
  return {
    assuranceLevel: Number(decoded.assuranceLevel ?? ASSURANCE_LEVEL_PASSWORD),
    authenticatedAt: String(decoded.authenticatedAt ?? new Date(0).toISOString()),
    mfaAuthenticatedAt:
      decoded.mfaAuthenticatedAt != null ? String(decoded.mfaAuthenticatedAt) : null,
    authMethods: Array.isArray(decoded.authMethods)
      ? (decoded.authMethods as AuthMethod[])
      : ['pwd'],
    securityVersion: Number(decoded.securityVersion ?? 0),
  };
}
