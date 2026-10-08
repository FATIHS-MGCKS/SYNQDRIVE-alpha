/**
 * Internal admission contract for trusted attestation issuance (no public HTTP surface).
 * Callers must not be trusted for tenant identity — the issuer resolves the revision and verifies scope.
 */
export type M3_3HvH4A3IssuerAdmissionRequestV1 = {
  organizationId: string;
  vehicleId: string;
  revisionId: string;
  /** Trusted workflow identity (e.g. reconciliation job name + deployment id), not an end-user id alone. */
  requestedBy: string;
  correlationId: string;
};

export type M3_3HvH4A3IssuerAdmissionRevisionScopeV1 = {
  id: string;
  organizationId: string;
  vehicleId: string;
};
