/** Persisted binding for step-up grants — derived from trusted MFA/session authority only. */
export type StepUpGrantBinding = {
  tokenFamily: string;
  organizationId: string | null;
  membershipId: string | null;
  sessionVersion: number;
  securityVersion: number;
  membershipVersion: number | null;
};

/** Request-local context for validating a bound grant (from AuthGuard-validated JWT user). */
export type StepUpGrantValidationContext = {
  tokenFamily: string;
  organizationId: string | null;
  membershipId: string | null;
  sessionVersion: number;
  membershipVersion: number | null;
};

/** Per-HTTP-request cache so combined guards do not double-consume one grant. */
export type StepUpGrantRequestCache = {
  consumedGrantId?: string;
  consumedTokenHash?: string;
};