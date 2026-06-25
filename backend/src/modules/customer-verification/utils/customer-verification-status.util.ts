import {
  CustomerDocument,
  CustomerDocumentStatus,
  CustomerDocumentType,
  CustomerVerificationCheck,
  CustomerVerificationCheckKind,
  CustomerVerificationCheckStatus,
  CustomerVerificationStatus,
} from '@prisma/client';
import type {
  DocumentEligibilityStatus,
  ProofOfAddressEligibilityStatus,
} from '../types/customer-verification-eligibility.types';

export const ID_DOCUMENT_TYPES: CustomerDocumentType[] = ['ID_FRONT', 'ID_BACK'];
export const LICENSE_DOCUMENT_TYPES: CustomerDocumentType[] = [
  'LICENSE_FRONT',
  'LICENSE_BACK',
];
export const POA_DOCUMENT_TYPES: CustomerDocumentType[] = ['PROOF_OF_ADDRESS'];

export function documentTypesForKind(
  kind: CustomerVerificationCheckKind,
): CustomerDocumentType[] {
  switch (kind) {
    case 'ID_DOCUMENT':
      return ID_DOCUMENT_TYPES;
    case 'DRIVING_LICENSE':
      return LICENSE_DOCUMENT_TYPES;
    case 'PROOF_OF_ADDRESS':
      return POA_DOCUMENT_TYPES;
    default:
      return [];
  }
}

export function computeDocumentCategoryStatus(
  docs: CustomerDocument[],
  types: CustomerDocumentType[],
  expiryDate: Date | null,
  refDate: Date = new Date(),
): CustomerVerificationStatus {
  if (expiryDate && expiryDate < refDate) return 'EXPIRED';

  const latestByType = new Map<CustomerDocumentType, CustomerDocument>();
  for (const doc of docs) {
    if (!types.includes(doc.type)) continue;
    const prev = latestByType.get(doc.type);
    if (!prev || doc.createdAt > prev.createdAt) latestByType.set(doc.type, doc);
  }

  const relevant = Array.from(latestByType.values());
  if (relevant.length === 0) return 'NOT_SUBMITTED';

  if (relevant.some((d) => d.status === 'REJECTED')) return 'REJECTED';
  if (relevant.some((d) => d.status === 'EXPIRED')) return 'EXPIRED';

  const allTypesPresent = types.every((type) => latestByType.has(type));
  if (allTypesPresent && relevant.every((d) => d.status === 'VERIFIED')) {
    return 'VERIFIED';
  }

  if (
    relevant.some((d) =>
      (['UPLOADED', 'PENDING_REVIEW'] as CustomerDocumentStatus[]).includes(
        d.status,
      ),
    )
  ) {
    return 'PENDING_REVIEW';
  }

  return 'NOT_SUBMITTED';
}

export function mapCheckStatusToCustomerStatus(
  status: CustomerVerificationCheckStatus,
): CustomerVerificationStatus {
  switch (status) {
    case 'VERIFIED':
      return 'VERIFIED';
    case 'REJECTED':
    case 'FAILED':
      return 'REJECTED';
    case 'EXPIRED':
    case 'KYC_EXPIRED':
      return 'EXPIRED';
    case 'NOT_STARTED':
    case 'ABANDONED':
      return 'NOT_SUBMITTED';
    default:
      return 'PENDING_REVIEW';
  }
}

export function mergeKindCustomerStatus(
  latestCheck: CustomerVerificationCheck | null,
  documentStatus: CustomerVerificationStatus,
): CustomerVerificationStatus {
  if (!latestCheck) return documentStatus;

  if (latestCheck.status === 'VERIFIED') return 'VERIFIED';
  if (['REJECTED', 'FAILED'].includes(latestCheck.status)) return 'REJECTED';
  if (['EXPIRED', 'KYC_EXPIRED'].includes(latestCheck.status)) return 'EXPIRED';
  if (documentStatus === 'VERIFIED') return 'VERIFIED';
  return mapCheckStatusToCustomerStatus(latestCheck.status);
}

export function normalizeVerificationStatus(
  customerStatus: CustomerVerificationStatus,
  options: {
    requireForConfirm: boolean;
    requireForPickup: boolean;
    hasAnySubmission: boolean;
  },
): DocumentEligibilityStatus {
  switch (customerStatus) {
    case 'VERIFIED':
      return 'verified';
    case 'REJECTED':
      return 'rejected';
    case 'EXPIRED':
      return 'expired';
    case 'PENDING_REVIEW':
      return 'requires_review';
    case 'NOT_SUBMITTED':
      if (!options.hasAnySubmission) return 'missing';
      return options.requireForPickup && !options.requireForConfirm
        ? 'pickup_required'
        : 'pending';
    default:
      return 'missing';
  }
}

export function normalizeInFlightCheckStatus(
  check: CustomerVerificationCheck | null,
): DocumentEligibilityStatus | null {
  if (!check) return null;
  switch (check.status) {
    case 'VERIFIED':
      return 'verified';
    case 'REJECTED':
    case 'FAILED':
      return 'rejected';
    case 'EXPIRED':
    case 'KYC_EXPIRED':
      return 'expired';
    case 'REQUIRES_REVIEW':
      return 'requires_review';
    case 'PENDING':
    case 'IN_PROGRESS':
    case 'AWAITING_USER':
    case 'NOT_STARTED':
      return 'pending';
    case 'ABANDONED':
      return 'missing';
    default:
      return 'requires_review';
  }
}

export function resolveDocumentEligibilityStatus(
  kind: CustomerVerificationCheckKind,
  latestCheck: CustomerVerificationCheck | null,
  documentStatus: CustomerVerificationStatus,
  options: {
    requireForConfirm: boolean;
    requireForPickup: boolean;
    hasAnySubmission: boolean;
  },
): DocumentEligibilityStatus {
  const fromCheck = normalizeInFlightCheckStatus(latestCheck);
  if (fromCheck === 'verified' || fromCheck === 'rejected' || fromCheck === 'expired') {
    return fromCheck;
  }

  const merged = mergeKindCustomerStatus(latestCheck, documentStatus);
  const normalized = normalizeVerificationStatus(merged, options);

  if (
    fromCheck === 'requires_review' ||
    fromCheck === 'pending' ||
    (latestCheck?.warnings &&
      Array.isArray(latestCheck.warnings) &&
      latestCheck.warnings.length > 0 &&
      merged !== 'VERIFIED')
  ) {
    if (fromCheck === 'pending') return 'pending';
    return 'requires_review';
  }

  if (
    normalized === 'missing' &&
    options.requireForPickup &&
    !options.requireForConfirm &&
    options.hasAnySubmission
  ) {
    return 'pickup_required';
  }

  return normalized;
}

export function resolveProofOfAddressStatus(
  latestCheck: CustomerVerificationCheck | null,
  poaDocumentStatus: CustomerVerificationStatus,
  hasPoaActivity: boolean,
): ProofOfAddressEligibilityStatus {
  if (!hasPoaActivity && !latestCheck) return 'not_required';

  const fromCheck = normalizeInFlightCheckStatus(latestCheck);
  if (fromCheck === 'verified') return 'verified';
  if (fromCheck === 'rejected') return 'rejected';
  if (fromCheck === 'requires_review') return 'requires_review';
  if (fromCheck === 'pending') return 'pending';

  if (poaDocumentStatus === 'VERIFIED') return 'verified';
  if (poaDocumentStatus === 'REJECTED') return 'rejected';
  if (poaDocumentStatus === 'PENDING_REVIEW') return 'pending';
  if (hasPoaActivity || latestCheck) return 'required';
  return 'not_required';
}

export function isDocumentStatusBlockingConfirm(
  status: DocumentEligibilityStatus,
): boolean {
  return status === 'rejected' || status === 'expired';
}

export function isDocumentStatusBlockingPickup(
  status: DocumentEligibilityStatus,
): boolean {
  return (
    status === 'missing' ||
    status === 'pending' ||
    status === 'requires_review' ||
    status === 'rejected' ||
    status === 'expired'
  );
}
