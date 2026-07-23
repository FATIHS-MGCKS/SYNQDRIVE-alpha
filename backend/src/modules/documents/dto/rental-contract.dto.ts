import type { RentalContract } from '@prisma/client';
import type { RentalContractLegalRefsSnapshot } from '../rental-contract-legal-snapshot.types';

export interface RentalContractLegalRefDto {
  slot: string;
  generatedDocumentId: string;
  legalDocumentId: string;
  documentType: string;
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

export interface RentalContractDto {
  id: string;
  organizationId: string;
  bookingId: string;
  contractNumber: string | null;
  status: string;
  generatedDocumentId: string | null;
  termsDocumentId: string | null;
  withdrawalDocumentId: string | null;
  privacyDocumentId: string | null;
  legalSnapshotFrozenAt: string | null;
  legalRefsSnapshot: RentalContractLegalRefsSnapshot | null;
  generatedAt: string | null;
  signedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toRentalContractDto(contract: RentalContract): RentalContractDto {
  const snapshot =
    contract.legalRefsSnapshot && typeof contract.legalRefsSnapshot === 'object'
      ? (contract.legalRefsSnapshot as unknown as RentalContractLegalRefsSnapshot)
      : null;

  return {
    id: contract.id,
    organizationId: contract.organizationId,
    bookingId: contract.bookingId,
    contractNumber: contract.contractNumber,
    status: contract.status,
    generatedDocumentId: contract.generatedDocumentId,
    termsDocumentId: contract.termsDocumentId,
    withdrawalDocumentId: contract.withdrawalDocumentId,
    privacyDocumentId: contract.privacyDocumentId,
    legalSnapshotFrozenAt: contract.legalSnapshotFrozenAt
      ? contract.legalSnapshotFrozenAt.toISOString()
      : null,
    legalRefsSnapshot: snapshot?.schemaVersion === 1 ? snapshot : null,
    generatedAt: contract.generatedAt ? contract.generatedAt.toISOString() : null,
    signedAt: contract.signedAt ? contract.signedAt.toISOString() : null,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
  };
}
