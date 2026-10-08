import type { Prisma } from '@prisma/client';
import {
  issueM3_3HvH4A3IntegrityAttestationIsolatedInTransactionV1,
  type M3_3HvH4A3IssueIntegrityAttestationIsolatedInputV1,
} from './m3-3-hv-h4-a3-3-o2-isolated-attestation-issuer.v1';
import type { M3_3HvH4A3IntegrityAttestationIssuerDbV1 } from './m3-3-hv-h4-a3-3-o2-isolated-attestation-issuer.types.v1';
import type {
  M3_3HvH4A3IssuerAdmissionRequestV1,
  M3_3HvH4A3IssuerAdmissionRevisionScopeV1,
} from './m3-3-hv-h4-a3-3-o2-r3-issuer-admission.types.v1';

export class M3_3HvH4A3IssuerAdmissionScopeMismatchError extends Error {
  readonly code = 'M3_3_HV_H4_A3_ISSUER_ADMISSION_SCOPE_MISMATCH';
}

export class M3_3HvH4A3IssuerAdmissionRevisionNotFoundError extends Error {
  readonly code = 'M3_3_HV_H4_A3_ISSUER_ADMISSION_REVISION_NOT_FOUND';
}

export class M3_3HvH4A3IssuerAdmissionRequestInvalidError extends Error {
  readonly code = 'M3_3_HV_H4_A3_ISSUER_ADMISSION_REQUEST_INVALID';
}

/** Pure scope gate — revision row is authoritative; never trust caller tenant fields without this check. */
export function assertM3_3HvH4A3IssuerAdmissionMatchesRevisionV1(
  request: M3_3HvH4A3IssuerAdmissionRequestV1,
  revision: M3_3HvH4A3IssuerAdmissionRevisionScopeV1,
): void {
  assertM3_3HvH4A3IssuerAdmissionRequestWellFormedV1(request);
  if (revision.id !== request.revisionId) {
    throw new M3_3HvH4A3IssuerAdmissionScopeMismatchError('revision id mismatch');
  }
  if (revision.organizationId !== request.organizationId) {
    throw new M3_3HvH4A3IssuerAdmissionScopeMismatchError('organization scope mismatch');
  }
  if (revision.vehicleId !== request.vehicleId) {
    throw new M3_3HvH4A3IssuerAdmissionScopeMismatchError('vehicle scope mismatch');
  }
}

export function assertM3_3HvH4A3IssuerAdmissionRequestWellFormedV1(
  request: M3_3HvH4A3IssuerAdmissionRequestV1,
): void {
  const fields: Array<keyof M3_3HvH4A3IssuerAdmissionRequestV1> = [
    'organizationId',
    'vehicleId',
    'revisionId',
    'requestedBy',
    'correlationId',
  ];
  for (const key of fields) {
    const value = request[key];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new M3_3HvH4A3IssuerAdmissionRequestInvalidError(`missing or empty ${key}`);
    }
  }
}

/**
 * Admitted issuance entry — resolves revision, verifies tenant/vehicle scope, then runs isolated issuer steps.
 * Intended for a separate trusted worker process only (not Nest API handlers).
 */
export async function issueM3_3HvH4A3IntegrityAttestationWithAdmissionV1(
  issuerDb: M3_3HvH4A3IntegrityAttestationIssuerDbV1,
  request: M3_3HvH4A3IssuerAdmissionRequestV1,
  issueInput?: Pick<M3_3HvH4A3IssueIntegrityAttestationIsolatedInputV1, 'attestedAt'>,
): Promise<{ attestationId: string }> {
  assertM3_3HvH4A3IssuerAdmissionRequestWellFormedV1(request);

  return issuerDb.$transaction(async (tx: Prisma.TransactionClient) => {
    const revision = await tx.batteryHvChargeSessionEvidenceRevision.findUnique({
      where: { id: request.revisionId },
      select: { id: true, organizationId: true, vehicleId: true },
    });
    if (!revision) {
      throw new M3_3HvH4A3IssuerAdmissionRevisionNotFoundError(request.revisionId);
    }
    assertM3_3HvH4A3IssuerAdmissionMatchesRevisionV1(request, revision);

    return issueM3_3HvH4A3IntegrityAttestationIsolatedInTransactionV1(tx, {
      revisionId: request.revisionId,
      attestedAt: issueInput?.attestedAt,
    });
  });
}
