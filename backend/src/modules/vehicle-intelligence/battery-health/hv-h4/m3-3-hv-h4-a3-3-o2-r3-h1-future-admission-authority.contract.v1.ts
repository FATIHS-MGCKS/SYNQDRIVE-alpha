/**
 * Future internal admission authority (design-only — not implemented in R3/R3-H1).
 *
 * Distinct from tenant/revision scope matching (`assertM3_3HvH4A3IssuerAdmissionMatchesRevisionV1`),
 * which only proves caller-supplied org/vehicle/revisionId align with the revision row.
 *
 * `requestedBy` on the scope-gate request is audit metadata only — not authenticated identity.
 */

/** Authenticated workload identity established by the trusted issuer process boundary (not caller string). */
export type M3_3HvH4A3AuthenticatedInternalWorkflowIdentityV1 = {
  /** Stable workload id, e.g. `battery-hv-a3-attestation-issuer@production`. */
  workloadId: string;
  /** Deployment/build attestation surface (not a DB password). */
  deploymentRevision: string;
};

/**
 * Allowlisted issuer workloads permitted to enqueue issuance work.
 * Evaluated only inside the trusted issuer process — never from API HTTP handlers.
 */
export type M3_3HvH4A3IssuerWorkloadAllowlistEntryV1 = {
  workloadId: string;
  /** Optional org scope ceiling — empty means platform-internal operator only. */
  allowedOrganizationIds?: readonly string[];
};

/** Future admission envelope (not wired to queues or Nest in R3-H1). */
export type M3_3HvH4A3FutureInternalAdmissionAuthorityRequestV1 = {
  authenticatedWorkflow: M3_3HvH4A3AuthenticatedInternalWorkflowIdentityV1;
  organizationId: string;
  vehicleId: string;
  revisionId: string;
  /** Audit-only correlation — must not be treated as authorization proof. */
  correlationId: string;
};

export type M3_3HvH4A3FutureInternalAdmissionAuthorityEvaluatorV1 = {
  /**
   * Verify workload is allowlisted and authenticated by process boundary
   * (mTLS, signed internal job token, or equivalent — TBD at integration slice).
   */
  assertWorkflowAuthorized: (
    request: M3_3HvH4A3FutureInternalAdmissionAuthorityRequestV1,
    allowlist: readonly M3_3HvH4A3IssuerWorkloadAllowlistEntryV1[],
  ) => void;
  /**
   * Independently verify revision tenant scope (same rule as scope gate).
   */
  assertRevisionTenantScope: (
    request: Pick<
      M3_3HvH4A3FutureInternalAdmissionAuthorityRequestV1,
      'organizationId' | 'vehicleId' | 'revisionId'
    >,
    revision: { id: string; organizationId: string; vehicleId: string },
  ) => void;
};
