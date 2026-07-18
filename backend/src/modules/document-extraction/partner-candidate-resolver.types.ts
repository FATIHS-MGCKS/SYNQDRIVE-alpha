import type { VendorCategory } from '@prisma/client';

export const PARTNER_KIND = {
  WORKSHOP: 'WORKSHOP',
  SUPPLIER: 'SUPPLIER',
  INSURANCE: 'INSURANCE',
  AUTHORITY: 'AUTHORITY',
} as const;

export type PartnerKind = (typeof PARTNER_KIND)[keyof typeof PARTNER_KIND];

export const PARTNER_CANDIDATE_MATCH_REASONS = {
  VENDOR_ID_EXACT: 'VENDOR_ID_EXACT',
  IBAN_EXACT: 'IBAN_EXACT',
  VAT_ID_EXACT: 'VAT_ID_EXACT',
  TAX_ID_EXACT: 'TAX_ID_EXACT',
  EMAIL_EXACT: 'EMAIL_EXACT',
  INVOICE_RELATIONSHIP: 'INVOICE_RELATIONSHIP',
  SERVICE_RELATIONSHIP: 'SERVICE_RELATIONSHIP',
  ADDRESS_MATCH: 'ADDRESS_MATCH',
  NAME_EXACT: 'NAME_EXACT',
  NAME_NORMALIZED: 'NAME_NORMALIZED',
} as const;

export type PartnerCandidateMatchReason =
  (typeof PARTNER_CANDIDATE_MATCH_REASONS)[keyof typeof PARTNER_CANDIDATE_MATCH_REASONS];

export const PARTNER_CANDIDATE_CONFLICT_CODES = {
  CATEGORY_MISMATCH: 'CATEGORY_MISMATCH',
  DUPLICATE_NAME: 'DUPLICATE_NAME',
  MULTIPLE_PLAUSIBLE: 'MULTIPLE_PLAUSIBLE',
  WEAK_NAME_ONLY: 'WEAK_NAME_ONLY',
} as const;

export type PartnerCandidateConflictCode =
  (typeof PARTNER_CANDIDATE_CONFLICT_CODES)[keyof typeof PARTNER_CANDIDATE_CONFLICT_CODES];

export interface PartnerCandidateConflict {
  code: PartnerCandidateConflictCode;
  field: string;
  message: string;
  severity: 'BLOCKER' | 'WARNING';
}

export interface PartnerCandidateMatch {
  vendorId: string;
  confidence: number;
  matchReasons: PartnerCandidateMatchReason[];
  conflicts: PartnerCandidateConflict[];
  rank: number;
  confirmationRequired: boolean;
  displayLabel: string;
  partnerKind: PartnerKind;
  vendorCategory: VendorCategory;
}

export interface PartnerNewSuggestion {
  partnerKind: PartnerKind;
  confirmationRequired: true;
  displayLabel: string;
  sourceField: string;
}

export interface PartnerResolverHints {
  organizationNamePresent: boolean;
  ibanPresent: boolean;
  vatIdPresent: boolean;
  taxIdPresent: boolean;
  emailPresent: boolean;
  addressPresent: boolean;
  vendorIdPresent: boolean;
  expectedPartnerKind: PartnerKind;
}

export interface PartnerCandidateSearchRecord {
  id: string;
  name: string;
  category: VendorCategory;
  email: string | null;
  contactEmail: string | null;
  street: string | null;
  city: string | null;
  postalCode: string | null;
}

export interface PartnerHistoricalSignals {
  vendorId: string;
  ibans: Set<string>;
  vatIds: Set<string>;
  taxIds: Set<string>;
}

export interface PartnerRelationshipContext {
  invoiceVendorIds: Set<string>;
  serviceVendorIds: Set<string>;
  historicalByVendor: Map<string, PartnerHistoricalSignals>;
}

export interface PartnerCandidatePipelineState {
  evaluatedAt: string;
  hints: PartnerResolverHints;
  candidates: PartnerCandidateMatch[];
  newPartnerSuggestion: PartnerNewSuggestion | null;
  ambiguousPartnerMatch: boolean;
  autoConfirmEligible: false;
}

export interface PartnerCandidateResolverInput {
  organizationId: string;
  documentType: string;
  extractedData: Record<string, unknown>;
  resolvedVehicleId?: string | null;
}

export const PARTNER_CANDIDATE_RESOLVER_DOCUMENT_TYPES = [
  'INVOICE',
  'SERVICE',
  'OIL_CHANGE',
  'TIRE',
  'BRAKE',
  'BATTERY',
  'TUV_REPORT',
  'BOKRAFT_REPORT',
  'FINE',
  'DAMAGE',
  'ACCIDENT',
] as const;

export interface PartnerResolverPrivateHints {
  organizationName?: string | null;
  iban?: string | null;
  vatId?: string | null;
  taxId?: string | null;
  email?: string | null;
  addressLine?: string | null;
  city?: string | null;
  postalCode?: string | null;
  vendorId?: string | null;
}
