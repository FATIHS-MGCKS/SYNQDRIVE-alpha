import {
  CustomerDocumentStatus,
  CustomerDocumentType,
  CustomerVerificationCheckKind,
  CustomerVerificationCheckStatus,
} from '@prisma/client';
import { parseIsoDate } from '../providers/didit/didit-decision.parser';
import { parseLicenseIssuedAtFromExtractedJson } from '@shared/utils/license-issued-at.util';
import {
  ID_DOCUMENT_TYPES,
  LICENSE_DOCUMENT_TYPES,
} from '../utils/customer-verification-status.util';

/** Source-of-truth hierarchy (highest trust first). */
export const CUSTOMER_FACT_TRUST_HIERARCHY = [
  'CUSTOMER_CANONICAL_VERIFIED',
  'KYC_VERIFIED',
  'MANUAL_DOCUMENT_VERIFIED',
  'OCR_UNVERIFIED',
] as const;

export type CustomerFactSourceType =
  | (typeof CUSTOMER_FACT_TRUST_HIERARCHY)[number]
  | 'NONE';

export type CustomerFactVerificationStatus =
  | 'VERIFIED'
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'EXPIRED'
  | 'MISSING';

export type CustomerEligibilityFactField =
  | 'dateOfBirth'
  | 'licenseIssuedAt'
  | 'licenseExpiry'
  | 'documentType';

export interface CustomerEligibilityFact<T = string | null> {
  field: CustomerEligibilityFactField;
  sourceType: CustomerFactSourceType;
  sourceId: string | null;
  verificationStatus: CustomerFactVerificationStatus;
  verifiedAt: string | null;
  verifiedBy: string | null;
  factualValue: T;
  evaluatedAt: string;
}

export interface ResolvedCustomerFact<T> {
  value: T | null;
  fact: CustomerEligibilityFact;
  isBinding: boolean;
  hasUnverifiedSuggestion: boolean;
}

/** Document lifecycle states that must not drive binding eligibility decisions. */
export const NON_BINDING_CUSTOMER_DOCUMENT_STATUSES: CustomerDocumentStatus[] = [
  'UPLOADED',
  'PENDING_REVIEW',
];

/** Extraction pipeline states treated as non-binding (aligned with OCR in-flight). */
export const NON_BINDING_EXTRACTION_LIFECYCLE_STATUSES = [
  'UPLOADED',
  'PENDING_REVIEW',
  'PROCESSING',
  'OCR_COMPLETED',
] as const;

export type NonBindingExtractionLifecycleStatus =
  (typeof NON_BINDING_EXTRACTION_LIFECYCLE_STATUSES)[number];

const PENDING_VERIFICATION_CHECK_STATUSES: CustomerVerificationCheckStatus[] = [
  'NOT_STARTED',
  'PENDING',
  'IN_PROGRESS',
  'AWAITING_USER',
  'REQUIRES_REVIEW',
];

export interface CustomerFactDocumentRef {
  id: string;
  type: CustomerDocumentType;
  status: CustomerDocumentStatus;
  extractedJson: unknown;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  uploadedByUserId: string | null;
  updatedAt: Date;
}

export interface CustomerFactCheckRef {
  id: string;
  kind: CustomerVerificationCheckKind;
  status: CustomerVerificationCheckStatus;
  extractedJson: unknown;
  completedAt: Date | null;
  checkedByUserId: string | null;
}

export interface CustomerFactResolutionInput {
  customer: {
    id: string;
    dateOfBirth: Date | null;
    licenseIssuedAt: Date | null;
    licenseExpiry: Date | null;
    idVerified: boolean;
    licenseVerified: boolean;
  };
  idCheck: CustomerFactCheckRef | null;
  licenseCheck: CustomerFactCheckRef | null;
  documents: CustomerFactDocumentRef[];
  evaluatedAt?: Date;
}

export function isNonBindingCustomerDocumentStatus(
  status: CustomerDocumentStatus,
): boolean {
  return NON_BINDING_CUSTOMER_DOCUMENT_STATUSES.includes(status);
}

export function isNonBindingExtractionLifecycleStatus(
  status: string,
): status is NonBindingExtractionLifecycleStatus {
  return (NON_BINDING_EXTRACTION_LIFECYCLE_STATUSES as readonly string[]).includes(
    status,
  );
}

export function isVerifiedVerificationCheckStatus(
  status: CustomerVerificationCheckStatus,
): boolean {
  return status === 'VERIFIED';
}

export function isPendingVerificationCheckStatus(
  status: CustomerVerificationCheckStatus,
): boolean {
  return PENDING_VERIFICATION_CHECK_STATUSES.includes(status);
}

export function parseDateOfBirthFromExtractedJson(
  extractedJson: unknown,
): Date | null {
  if (!extractedJson || typeof extractedJson !== 'object' || Array.isArray(extractedJson)) {
    return null;
  }
  const record = extractedJson as Record<string, unknown>;
  const candidates = [
    record.date_of_birth,
    record.dateOfBirth,
    record.birthDate,
    record.birth_date,
  ];
  for (const value of candidates) {
    if (typeof value === 'string') {
      const parsed = parseIsoDate(value);
      if (parsed) return parsed;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value;
    }
  }
  return null;
}

export function parseLicenseExpiryFromExtractedJson(
  extractedJson: unknown,
): Date | null {
  if (!extractedJson || typeof extractedJson !== 'object' || Array.isArray(extractedJson)) {
    return null;
  }
  const record = extractedJson as Record<string, unknown>;
  return parseIsoDate(
    typeof record.expiration_date === 'string'
      ? record.expiration_date
      : typeof record.licenseExpiry === 'string'
        ? record.licenseExpiry
        : typeof record.expiryDate === 'string'
          ? record.expiryDate
          : undefined,
  );
}

function toIsoDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function createFact<T extends string | null>(
  field: CustomerEligibilityFactField,
  sourceType: CustomerFactSourceType,
  sourceId: string | null,
  verificationStatus: CustomerFactVerificationStatus,
  verifiedAt: Date | null,
  verifiedBy: string | null,
  factualValue: T,
  evaluatedAt: Date,
): CustomerEligibilityFact<T> {
  return {
    field,
    sourceType,
    sourceId,
    verificationStatus,
    verifiedAt: verifiedAt ? verifiedAt.toISOString() : null,
    verifiedBy,
    factualValue,
    evaluatedAt: evaluatedAt.toISOString(),
  };
}

function latestDocumentByTypes(
  documents: CustomerFactDocumentRef[],
  types: CustomerDocumentType[],
  statusFilter?: CustomerDocumentStatus[],
): CustomerFactDocumentRef | null {
  const filtered = documents.filter(
    (doc) =>
      types.includes(doc.type) &&
      (!statusFilter || statusFilter.includes(doc.status)),
  );
  if (filtered.length === 0) return null;
  return filtered.reduce((latest, doc) =>
    doc.updatedAt > latest.updatedAt ? doc : latest,
  );
}

function resolveVerifiedDocumentFact<T extends Date>(
  field: CustomerEligibilityFactField,
  documents: CustomerFactDocumentRef[],
  types: CustomerDocumentType[],
  parseValue: (json: unknown) => T | null,
  evaluatedAt: Date,
): ResolvedCustomerFact<T> | null {
  const doc = latestDocumentByTypes(documents, types, ['VERIFIED']);
  if (!doc) return null;
  const value = doc.extractedJson ? parseValue(doc.extractedJson) : null;
  if (!value) return null;
  return {
    value,
    fact: createFact(
      field,
      'MANUAL_DOCUMENT_VERIFIED',
      doc.id,
      'VERIFIED',
      doc.reviewedAt,
      doc.reviewedByUserId,
      toIsoDate(value),
      evaluatedAt,
    ),
    isBinding: true,
    hasUnverifiedSuggestion: false,
  };
}

function resolveVerifiedCheckFact<T extends Date>(
  field: CustomerEligibilityFactField,
  check: CustomerFactCheckRef | null,
  parseValue: (json: unknown) => T | null,
  evaluatedAt: Date,
): ResolvedCustomerFact<T> | null {
  if (!check || check.status !== 'VERIFIED' || !check.extractedJson) return null;
  const value = parseValue(check.extractedJson);
  if (!value) return null;
  return {
    value,
    fact: createFact(
      field,
      'KYC_VERIFIED',
      check.id,
      'VERIFIED',
      check.completedAt,
      check.checkedByUserId,
      toIsoDate(value),
      evaluatedAt,
    ),
    isBinding: true,
    hasUnverifiedSuggestion: false,
  };
}

function hasUnverifiedDocumentSuggestion(
  documents: CustomerFactDocumentRef[],
  types: CustomerDocumentType[],
  parseValue: (json: unknown) => Date | null,
): CustomerFactDocumentRef | null {
  const doc = latestDocumentByTypes(
    documents,
    types,
    NON_BINDING_CUSTOMER_DOCUMENT_STATUSES,
  );
  if (!doc?.extractedJson) return null;
  return parseValue(doc.extractedJson) ? doc : null;
}

function hasUnverifiedCheckSuggestion(
  check: CustomerFactCheckRef | null,
  parseValue: (json: unknown) => Date | null,
): CustomerFactCheckRef | null {
  if (!check || !isPendingVerificationCheckStatus(check.status) || !check.extractedJson) {
    return null;
  }
  return parseValue(check.extractedJson) ? check : null;
}

function buildUnverifiedFact(
  field: CustomerEligibilityFactField,
  sourceType: 'OCR_UNVERIFIED',
  sourceId: string,
  value: Date,
  evaluatedAt: Date,
  verifiedBy: string | null,
): ResolvedCustomerFact<Date> {
  return {
    value: null,
    fact: createFact(
      field,
      sourceType,
      sourceId,
      'PENDING_REVIEW',
      null,
      verifiedBy,
      toIsoDate(value),
      evaluatedAt,
    ),
    isBinding: false,
    hasUnverifiedSuggestion: true,
  };
}

function buildMissingFact(
  field: CustomerEligibilityFactField,
  evaluatedAt: Date,
): ResolvedCustomerFact<Date> {
  return {
    value: null,
    fact: createFact(
      field,
      'NONE',
      null,
      'MISSING',
      null,
      null,
      null,
      evaluatedAt,
    ),
    isBinding: false,
    hasUnverifiedSuggestion: false,
  };
}

export function resolveTrustedDateOfBirth(
  input: CustomerFactResolutionInput,
): ResolvedCustomerFact<Date> {
  const evaluatedAt = input.evaluatedAt ?? new Date();

  if (input.customer.dateOfBirth && input.customer.idVerified) {
    return {
      value: input.customer.dateOfBirth,
      fact: createFact(
        'dateOfBirth',
        'CUSTOMER_CANONICAL_VERIFIED',
        input.customer.id,
        'VERIFIED',
        null,
        null,
        toIsoDate(input.customer.dateOfBirth),
        evaluatedAt,
      ),
      isBinding: true,
      hasUnverifiedSuggestion: false,
    };
  }

  const fromCheck = resolveVerifiedCheckFact(
    'dateOfBirth',
    input.idCheck,
    parseDateOfBirthFromExtractedJson,
    evaluatedAt,
  );
  if (fromCheck) return fromCheck;

  const fromDocument = resolveVerifiedDocumentFact(
    'dateOfBirth',
    input.documents,
    ID_DOCUMENT_TYPES,
    parseDateOfBirthFromExtractedJson,
    evaluatedAt,
  );
  if (fromDocument) return fromDocument;

  const unverifiedDoc = hasUnverifiedDocumentSuggestion(
    input.documents,
    ID_DOCUMENT_TYPES,
    parseDateOfBirthFromExtractedJson,
  );
  if (unverifiedDoc) {
    const suggested = parseDateOfBirthFromExtractedJson(unverifiedDoc.extractedJson);
    if (suggested) {
      return buildUnverifiedFact(
        'dateOfBirth',
        'OCR_UNVERIFIED',
        unverifiedDoc.id,
        suggested,
        evaluatedAt,
        unverifiedDoc.uploadedByUserId,
      );
    }
  }

  const unverifiedCheck = hasUnverifiedCheckSuggestion(
    input.idCheck,
    parseDateOfBirthFromExtractedJson,
  );
  if (unverifiedCheck) {
    const suggested = parseDateOfBirthFromExtractedJson(unverifiedCheck.extractedJson);
    if (suggested) {
      return buildUnverifiedFact(
        'dateOfBirth',
        'OCR_UNVERIFIED',
        unverifiedCheck.id,
        suggested,
        evaluatedAt,
        unverifiedCheck.checkedByUserId,
      );
    }
  }

  if (input.customer.dateOfBirth && !input.customer.idVerified) {
    return buildUnverifiedFact(
      'dateOfBirth',
      'OCR_UNVERIFIED',
      input.customer.id,
      input.customer.dateOfBirth,
      evaluatedAt,
      null,
    );
  }

  return buildMissingFact('dateOfBirth', evaluatedAt);
}

export function resolveTrustedLicenseIssuedAt(
  input: CustomerFactResolutionInput,
): ResolvedCustomerFact<Date> {
  const evaluatedAt = input.evaluatedAt ?? new Date();

  if (input.customer.licenseIssuedAt && input.customer.licenseVerified) {
    return {
      value: input.customer.licenseIssuedAt,
      fact: createFact(
        'licenseIssuedAt',
        'CUSTOMER_CANONICAL_VERIFIED',
        input.customer.id,
        'VERIFIED',
        null,
        null,
        toIsoDate(input.customer.licenseIssuedAt),
        evaluatedAt,
      ),
      isBinding: true,
      hasUnverifiedSuggestion: false,
    };
  }

  const fromCheck = resolveVerifiedCheckFact(
    'licenseIssuedAt',
    input.licenseCheck,
    parseLicenseIssuedAtFromExtractedJson,
    evaluatedAt,
  );
  if (fromCheck) return fromCheck;

  const fromDocument = resolveVerifiedDocumentFact(
    'licenseIssuedAt',
    input.documents,
    LICENSE_DOCUMENT_TYPES,
    parseLicenseIssuedAtFromExtractedJson,
    evaluatedAt,
  );
  if (fromDocument) return fromDocument;

  const unverifiedDoc = hasUnverifiedDocumentSuggestion(
    input.documents,
    LICENSE_DOCUMENT_TYPES,
    parseLicenseIssuedAtFromExtractedJson,
  );
  if (unverifiedDoc) {
    const suggested = parseLicenseIssuedAtFromExtractedJson(unverifiedDoc.extractedJson);
    if (suggested) {
      return buildUnverifiedFact(
        'licenseIssuedAt',
        'OCR_UNVERIFIED',
        unverifiedDoc.id,
        suggested,
        evaluatedAt,
        unverifiedDoc.uploadedByUserId,
      );
    }
  }

  const unverifiedCheck = hasUnverifiedCheckSuggestion(
    input.licenseCheck,
    parseLicenseIssuedAtFromExtractedJson,
  );
  if (unverifiedCheck) {
    const suggested = parseLicenseIssuedAtFromExtractedJson(unverifiedCheck.extractedJson);
    if (suggested) {
      return buildUnverifiedFact(
        'licenseIssuedAt',
        'OCR_UNVERIFIED',
        unverifiedCheck.id,
        suggested,
        evaluatedAt,
        unverifiedCheck.checkedByUserId,
      );
    }
  }

  if (input.customer.licenseIssuedAt && !input.customer.licenseVerified) {
    return buildUnverifiedFact(
      'licenseIssuedAt',
      'OCR_UNVERIFIED',
      input.customer.id,
      input.customer.licenseIssuedAt,
      evaluatedAt,
      null,
    );
  }

  return buildMissingFact('licenseIssuedAt', evaluatedAt);
}

export function resolveTrustedLicenseExpiry(
  input: CustomerFactResolutionInput,
): ResolvedCustomerFact<Date> {
  const evaluatedAt = input.evaluatedAt ?? new Date();

  if (input.customer.licenseExpiry && input.customer.licenseVerified) {
    return {
      value: input.customer.licenseExpiry,
      fact: createFact(
        'licenseExpiry',
        'CUSTOMER_CANONICAL_VERIFIED',
        input.customer.id,
        'VERIFIED',
        null,
        null,
        toIsoDate(input.customer.licenseExpiry),
        evaluatedAt,
      ),
      isBinding: true,
      hasUnverifiedSuggestion: false,
    };
  }

  const fromCheck = resolveVerifiedCheckFact(
    'licenseExpiry',
    input.licenseCheck,
    parseLicenseExpiryFromExtractedJson,
    evaluatedAt,
  );
  if (fromCheck) return fromCheck;

  const fromDocument = resolveVerifiedDocumentFact(
    'licenseExpiry',
    input.documents,
    LICENSE_DOCUMENT_TYPES,
    parseLicenseExpiryFromExtractedJson,
    evaluatedAt,
  );
  if (fromDocument) return fromDocument;

  const unverifiedDoc = hasUnverifiedDocumentSuggestion(
    input.documents,
    LICENSE_DOCUMENT_TYPES,
    parseLicenseExpiryFromExtractedJson,
  );
  if (unverifiedDoc?.extractedJson) {
    const suggested = parseLicenseExpiryFromExtractedJson(unverifiedDoc.extractedJson);
    if (suggested) {
      return buildUnverifiedFact(
        'licenseExpiry',
        'OCR_UNVERIFIED',
        unverifiedDoc.id,
        suggested,
        evaluatedAt,
        unverifiedDoc.uploadedByUserId,
      );
    }
  }

  if (input.customer.licenseExpiry && !input.customer.licenseVerified) {
    return buildUnverifiedFact(
      'licenseExpiry',
      'OCR_UNVERIFIED',
      input.customer.id,
      input.customer.licenseExpiry,
      evaluatedAt,
      null,
    );
  }

  return buildMissingFact('licenseExpiry', evaluatedAt);
}

export function collectCustomerEligibilityFacts(
  input: CustomerFactResolutionInput,
): CustomerEligibilityFact[] {
  return [
    resolveTrustedDateOfBirth(input).fact,
    resolveTrustedLicenseIssuedAt(input).fact,
    resolveTrustedLicenseExpiry(input).fact,
  ];
}
