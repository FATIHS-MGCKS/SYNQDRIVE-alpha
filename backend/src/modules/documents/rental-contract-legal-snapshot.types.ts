import { DOCUMENT_TYPE, type DocumentType } from './documents.constants';

export const RENTAL_CONTRACT_LEGAL_SLOT = {
  TERMS: 'TERMS',
  CONSUMER: 'CONSUMER',
  PRIVACY: 'PRIVACY',
} as const;

/** Mandatory legal texts frozen on every rental contract (Prompt 17). */
export const RENTAL_CONTRACT_MANDATORY_LEGAL_TYPES = [
  DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
  DOCUMENT_TYPE.CONSUMER_INFORMATION,
  DOCUMENT_TYPE.PRIVACY_POLICY,
] as const;

export type RentalContractMandatoryLegalType =
  (typeof RENTAL_CONTRACT_MANDATORY_LEGAL_TYPES)[number];

export const RENTAL_CONTRACT_SLOT_BY_DOCUMENT_TYPE: Record<
  RentalContractMandatoryLegalType,
  RentalContractLegalSlot
> = {
  [DOCUMENT_TYPE.TERMS_AND_CONDITIONS]: RENTAL_CONTRACT_LEGAL_SLOT.TERMS,
  [DOCUMENT_TYPE.CONSUMER_INFORMATION]: RENTAL_CONTRACT_LEGAL_SLOT.CONSUMER,
  [DOCUMENT_TYPE.PRIVACY_POLICY]: RENTAL_CONTRACT_LEGAL_SLOT.PRIVACY,
};

export type RentalContractLegalSlot =
  (typeof RENTAL_CONTRACT_LEGAL_SLOT)[keyof typeof RENTAL_CONTRACT_LEGAL_SLOT];

/** Verification-grade frozen legal reference on a rental contract. */
export interface RentalContractLegalRefSnapshot {
  slot: RentalContractLegalSlot;
  generatedDocumentId: string;
  legalDocumentId: string;
  documentType: DocumentType;
  legalVariant: string | null;
  versionLabel: string;
  language: string;
  jurisdictionCountry: string;
  checksum: string | null;
  validFrom: string | null;
  validUntil: string | null;
  validAtContractTime: boolean;
  snapshotAt: string;
  resolverVersion: string | null;
  selectionReason: string | null;
}

export interface RentalContractLegalRefsSnapshot {
  schemaVersion: 1;
  bookingId: string;
  organizationId: string;
  frozenAt: string;
  resolverVersion: string | null;
  refs: RentalContractLegalRefSnapshot[];
}

export interface RentalContractDownloadContext {
  organizationId: string;
  bookingId: string;
  rentalContractId: string;
  generatedDocumentId: string;
  legalRefsSnapshot: RentalContractLegalRefsSnapshot | null;
  legalSnapshotFrozenAt: string | null;
}
