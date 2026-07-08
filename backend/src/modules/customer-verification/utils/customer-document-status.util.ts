import {
  Customer,
  CustomerDocument,
  CustomerDocumentType,
  CustomerVerificationCheck,
  CustomerVerificationCheckKind,
  CustomerVerificationCheckStatus,
  CustomerVerificationProvider,
  CustomerVerificationStatus,
} from '@prisma/client';
import type { ProofOfAddressEligibilityStatus } from '../types/customer-verification-eligibility.types';
import type {
  CustomerDocumentDomainStatusDto,
  CustomerDocumentDomainStatusValue,
  CustomerDocumentStatusSource,
  MissingUploadSlotDto,
} from '../types/customer-document-status.types';
import {
  computeDocumentCategoryStatus,
  ID_DOCUMENT_TYPES,
  LICENSE_DOCUMENT_TYPES,
  mergeKindCustomerStatus,
  POA_DOCUMENT_TYPES,
} from './customer-verification-status.util';

const SLOT_DEFINITIONS: MissingUploadSlotDto[] = [
  {
    slot: 'id-front',
    label: 'Personalausweis – Vorderseite',
    documentType: 'ID_FRONT',
  },
  {
    slot: 'id-back',
    label: 'Personalausweis – Rückseite',
    documentType: 'ID_BACK',
  },
  {
    slot: 'license-front',
    label: 'Führerschein – Vorderseite',
    documentType: 'LICENSE_FRONT',
  },
  {
    slot: 'license-back',
    label: 'Führerschein – Rückseite',
    documentType: 'LICENSE_BACK',
  },
  {
    slot: 'proof-of-address',
    label: 'Adressnachweis',
    documentType: 'PROOF_OF_ADDRESS',
  },
];

export function documentTypeToVerificationKind(
  type: CustomerDocumentType,
): CustomerVerificationCheckKind | null {
  switch (type) {
    case 'ID_FRONT':
    case 'ID_BACK':
      return 'ID_DOCUMENT';
    case 'LICENSE_FRONT':
    case 'LICENSE_BACK':
      return 'DRIVING_LICENSE';
    case 'PROOF_OF_ADDRESS':
      return 'PROOF_OF_ADDRESS';
    default:
      return null;
  }
}

export function mapCheckStatusToDomainStatus(
  status: CustomerVerificationCheckStatus,
): CustomerDocumentDomainStatusValue {
  switch (status) {
    case 'VERIFIED':
      return 'VERIFIED';
    case 'REJECTED':
    case 'FAILED':
      return 'REJECTED';
    case 'EXPIRED':
    case 'KYC_EXPIRED':
      return 'EXPIRED';
    case 'REQUIRES_REVIEW':
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'AWAITING_USER':
      return 'PENDING_REVIEW';
    default:
      return 'NOT_SUBMITTED';
  }
}

export function mapCustomerVerificationStatusToDomain(
  status: CustomerVerificationStatus,
): CustomerDocumentDomainStatusValue {
  switch (status) {
    case 'VERIFIED':
      return 'VERIFIED';
    case 'REJECTED':
      return 'REJECTED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'PENDING_REVIEW':
      return 'PENDING_REVIEW';
    default:
      return 'NOT_SUBMITTED';
  }
}

function isGermanCountry(country?: string | null): boolean {
  if (!country?.trim()) return false;
  const normalized = country.trim().toLowerCase();
  return normalized === 'de' || normalized === 'deutschland' || normalized === 'germany';
}

export function extractCountryFromJson(
  ...sources: Array<Record<string, unknown> | null | undefined>
): string | undefined {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const country =
      (typeof source.country === 'string' && source.country) ||
      (typeof source.documentCountry === 'string' && source.documentCountry) ||
      (typeof source.nationality === 'string' && source.nationality) ||
      undefined;
    if (country?.trim()) return country.trim();
  }
  return undefined;
}

export function buildIdDocumentDisplayName(
  customer: Customer,
  country?: string | null,
): string {
  const resolvedCountry = country ?? customer.country;
  const idType = customer.idType?.trim() || 'Personalausweis';
  if (!isGermanCountry(resolvedCountry)) return idType;
  if (idType.toLowerCase().includes('reisepass')) return 'Deutscher Reisepass';
  if (idType.toLowerCase().includes('personalausweis')) return 'Deutscher Personalausweis';
  return `Deutscher ${idType}`;
}

export function buildLicenseDisplayName(
  customer: Customer,
  country?: string | null,
): string {
  const resolvedCountry = country ?? customer.country;
  if (isGermanCountry(resolvedCountry)) return 'Deutscher Führerschein';
  return 'Führerschein';
}

export function buildProofOfAddressDisplayName(): string {
  return 'Adressnachweis';
}

function latestDocumentByType(
  documents: CustomerDocument[],
  type: CustomerDocumentType,
): CustomerDocument | null {
  const relevant = documents.filter((doc) => doc.type === type);
  if (relevant.length === 0) return null;
  return relevant.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
}

function domainDocuments(
  documents: CustomerDocument[],
  types: CustomerDocumentType[],
): CustomerDocument[] {
  const latestByType = new Map<CustomerDocumentType, CustomerDocument>();
  for (const doc of documents) {
    if (!types.includes(doc.type)) continue;
    const prev = latestByType.get(doc.type);
    if (!prev || doc.createdAt > prev.createdAt) latestByType.set(doc.type, doc);
  }
  return Array.from(latestByType.values());
}

function pickSubmittedAt(docs: CustomerDocument[]): string | undefined {
  const submitted = docs
    .map((doc) => doc.createdAt)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return submitted?.toISOString();
}

function pickVerifiedAt(
  check: CustomerVerificationCheck | null,
  docs: CustomerDocument[],
): string | undefined {
  if (check?.completedAt) return check.completedAt.toISOString();
  const verifiedDoc = docs
    .filter((doc) => doc.status === 'VERIFIED' && doc.reviewedAt)
    .sort((a, b) => (b.reviewedAt?.getTime() ?? 0) - (a.reviewedAt?.getTime() ?? 0))[0];
  return verifiedDoc?.reviewedAt?.toISOString();
}

function pickRejectedReason(
  check: CustomerVerificationCheck | null,
  docs: CustomerDocument[],
): string | undefined {
  if (check?.decisionJson && typeof check.decisionJson === 'object' && !Array.isArray(check.decisionJson)) {
    const reason = (check.decisionJson as Record<string, unknown>).rejectedReason;
    if (typeof reason === 'string' && reason.trim()) return reason.trim();
  }
  const rejectedDoc = docs.find((doc) => doc.status === 'REJECTED' && doc.rejectedReason?.trim());
  return rejectedDoc?.rejectedReason?.trim() || undefined;
}

export function buildDomainStatus(params: {
  kind: CustomerVerificationCheckKind;
  customer: Customer;
  documents: CustomerDocument[];
  latestCheck: CustomerVerificationCheck | null;
  documentTypes: CustomerDocumentType[];
  expiryDate: Date | null;
  displayName: string;
  documentNumber?: string | null;
  proofOfAddressEligibility?: ProofOfAddressEligibilityStatus;
  userNames: Map<string, string>;
  refDate?: Date;
}): CustomerDocumentDomainStatusDto {
  const {
    kind,
    customer,
    documents,
    latestCheck,
    documentTypes,
    expiryDate,
    displayName,
    documentNumber,
    proofOfAddressEligibility,
    userNames,
    refDate = new Date(),
  } = params;

  const kindDocs = domainDocuments(documents, documentTypes);
  const documentCategoryStatus = computeDocumentCategoryStatus(
    documents,
    documentTypes,
    expiryDate,
    refDate,
  );
  const mergedStatus = mergeKindCustomerStatus(latestCheck, documentCategoryStatus);

  let status: CustomerDocumentDomainStatusValue;
  let source: CustomerDocumentStatusSource;
  let provider: CustomerVerificationProvider | undefined;

  if (
    kind === 'PROOF_OF_ADDRESS' &&
    proofOfAddressEligibility === 'not_required' &&
    !latestCheck &&
    kindDocs.length === 0
  ) {
    status = 'NOT_REQUIRED';
    source = 'policy';
  } else if (latestCheck && isAuthoritativeCheck(latestCheck)) {
    status = mapCheckStatusToDomainStatus(latestCheck.status);
    source = 'verification_check';
    provider = latestCheck.provider;
  } else if (kindDocs.length > 0) {
    status = mapCustomerVerificationStatusToDomain(documentCategoryStatus);
    source = 'customer_document';
    provider = latestCheck?.provider;
  } else {
    status = mapCustomerVerificationStatusToDomain(mergedStatus);
    source = latestCheck ? 'verification_check' : 'legacy_read_model';
    provider = latestCheck?.provider;
  }

  const extractedCountry = extractCountryFromJson(
    latestCheck?.extractedJson as Record<string, unknown> | undefined,
    latestCheck?.decisionJson as Record<string, unknown> | undefined,
  );

  const checkedByUserId =
    latestCheck?.checkedByUserId ??
    kindDocs.find((doc) => doc.reviewedByUserId)?.reviewedByUserId ??
    undefined;

  return {
    status,
    provider,
    checkedByName: checkedByUserId ? userNames.get(checkedByUserId) : undefined,
    checkedByUserId: checkedByUserId ?? undefined,
    submittedAt: pickSubmittedAt(kindDocs),
    verifiedAt: pickVerifiedAt(latestCheck, kindDocs),
    expiresAt: expiryDate?.toISOString(),
    documentNumber: documentNumber ?? undefined,
    documentCountry: extractedCountry ?? customer.country ?? undefined,
    displayName,
    source,
    rejectedReason: pickRejectedReason(latestCheck, kindDocs),
  };
}

function isAuthoritativeCheck(check: CustomerVerificationCheck): boolean {
  if (check.provider === 'DIDIT') return true;
  if (check.status === 'VERIFIED' || check.status === 'REJECTED' || check.status === 'EXPIRED') {
    return true;
  }
  if (check.decisionJson && typeof check.decisionJson === 'object' && !Array.isArray(check.decisionJson)) {
    return (check.decisionJson as Record<string, unknown>).manualReview === true;
  }
  return ['REQUIRES_REVIEW', 'PENDING', 'IN_PROGRESS', 'AWAITING_USER'].includes(check.status);
}

function slotBelongsToDomain(
  documentType: CustomerDocumentType,
  domain: 'idDocument' | 'drivingLicense' | 'proofOfAddress',
): boolean {
  if (domain === 'idDocument') return ID_DOCUMENT_TYPES.includes(documentType);
  if (domain === 'drivingLicense') return LICENSE_DOCUMENT_TYPES.includes(documentType);
  return POA_DOCUMENT_TYPES.includes(documentType);
}

function domainKeyForSlot(
  documentType: CustomerDocumentType,
): 'idDocument' | 'drivingLicense' | 'proofOfAddress' {
  if (ID_DOCUMENT_TYPES.includes(documentType)) return 'idDocument';
  if (LICENSE_DOCUMENT_TYPES.includes(documentType)) return 'drivingLicense';
  return 'proofOfAddress';
}

export function computeMissingUploadSlots(params: {
  idDocument: CustomerDocumentDomainStatusDto;
  drivingLicense: CustomerDocumentDomainStatusDto;
  proofOfAddress: CustomerDocumentDomainStatusDto;
  documents: CustomerDocument[];
}): MissingUploadSlotDto[] {
  const domainStatuses = {
    idDocument: params.idDocument,
    drivingLicense: params.drivingLicense,
    proofOfAddress: params.proofOfAddress,
  };

  return SLOT_DEFINITIONS.filter((slot) => {
    const domain = domainKeyForSlot(slot.documentType);
    const domainStatus = domainStatuses[domain];

    if (domainStatus.status === 'NOT_REQUIRED') return false;
    if (domainStatus.status === 'VERIFIED') return false;

    const doc = latestDocumentByType(params.documents, slot.documentType);
    if (doc && ['UPLOADED', 'PENDING_REVIEW'].includes(doc.status)) return false;
    if (domainStatus.status === 'PENDING_REVIEW' && doc) return false;

    if (doc?.status === 'VERIFIED') return false;

    return true;
  });
}
