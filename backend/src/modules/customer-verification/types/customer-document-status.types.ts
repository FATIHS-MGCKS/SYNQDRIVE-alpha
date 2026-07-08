import {
  CustomerDocumentType,
  CustomerVerificationProvider,
} from '@prisma/client';

export type CustomerDocumentDomainStatusValue =
  | 'VERIFIED'
  | 'PENDING_REVIEW'
  | 'NOT_SUBMITTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'NOT_REQUIRED';

export type CustomerDocumentStatusSource =
  | 'verification_check'
  | 'customer_document'
  | 'legacy_read_model'
  | 'policy';

export type CustomerDocumentDomainStatusDto = {
  status: CustomerDocumentDomainStatusValue;
  provider?: CustomerVerificationProvider;
  checkedByName?: string;
  checkedByUserId?: string;
  submittedAt?: string;
  verifiedAt?: string;
  expiresAt?: string;
  documentNumber?: string;
  documentCountry?: string;
  displayName: string;
  source: CustomerDocumentStatusSource;
  rejectedReason?: string;
};

export type MissingUploadSlotDto = {
  slot: string;
  label: string;
  documentType: CustomerDocumentType;
};

export type CustomerDocumentVerificationStatusDto = {
  customerId: string;
  idDocument: CustomerDocumentDomainStatusDto;
  drivingLicense: CustomerDocumentDomainStatusDto;
  proofOfAddress: CustomerDocumentDomainStatusDto;
  missingUploadSlots: MissingUploadSlotDto[];
};
