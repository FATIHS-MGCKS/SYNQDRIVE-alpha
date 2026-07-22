import type { DocumentType } from './documents.constants';

export const RENTAL_CONTRACT_ERROR_CODE = {
  MISSING_MANDATORY_LEGAL_TEXT: 'RENTAL_CONTRACT_MISSING_MANDATORY_LEGAL_TEXT',
  RESOLVER_CONFLICT: 'RENTAL_CONTRACT_LEGAL_RESOLVER_CONFLICT',
  TENANT_MISMATCH: 'RENTAL_CONTRACT_TENANT_MISMATCH',
  FROZEN_SNAPSHOT_EXISTS: 'RENTAL_CONTRACT_FROZEN_SNAPSHOT_EXISTS',
  GENERATED_DOCUMENT_MISSING: 'RENTAL_CONTRACT_GENERATED_DOCUMENT_MISSING',
  LEGAL_DOCUMENT_MISSING: 'RENTAL_CONTRACT_LEGAL_DOCUMENT_MISSING',
} as const;

export type RentalContractErrorCode =
  (typeof RENTAL_CONTRACT_ERROR_CODE)[keyof typeof RENTAL_CONTRACT_ERROR_CODE];

export class RentalContractLegalSnapshotError extends Error {
  readonly code: RentalContractErrorCode;

  constructor(
    code: RentalContractErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'RentalContractLegalSnapshotError';
    this.code = code;
  }
}

export class RentalContractMissingMandatoryLegalTextError extends RentalContractLegalSnapshotError {
  constructor(
    public readonly organizationId: string,
    public readonly bookingId: string,
    public readonly missingDocumentTypes: DocumentType[],
  ) {
    super(
      RENTAL_CONTRACT_ERROR_CODE.MISSING_MANDATORY_LEGAL_TEXT,
      `Missing mandatory legal texts for rental contract: ${missingDocumentTypes.join(', ')}`,
      { organizationId, bookingId, missingDocumentTypes },
    );
    this.name = 'RentalContractMissingMandatoryLegalTextError';
  }
}
