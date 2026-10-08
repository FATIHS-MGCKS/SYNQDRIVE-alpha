/**
 * Tenant/revision scope gate request (not authenticated admission).
 * Callers must not be trusted for tenant identity — the issuer resolves the revision and verifies scope.
 */
export type M3_3HvH4A3IssuerAdmissionRequestV1 = {
  organizationId: string;
  vehicleId: string;
  revisionId: string;
  /**
   * Audit metadata only (e.g. workflow name). NOT authenticated workflow identity.
   * See `M3_3HvH4A3FutureInternalAdmissionAuthorityRequestV1` for future authorization contract.
   */
  requestedBy: string;
  /** Audit-only correlation id — not authorization proof. */
  correlationId: string;
};

export type M3_3HvH4A3IssuerAdmissionRevisionScopeV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
};
