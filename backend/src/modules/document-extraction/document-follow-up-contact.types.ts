import type { DocumentFollowUpSuggestionType } from './document-follow-up-suggestion.types';
import { DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES } from './document-follow-up-suggestion.types';

export const DOCUMENT_FOLLOW_UP_CONTACT_TARGETS = {
  CUSTOMER: 'CUSTOMER',
  DRIVER: 'DRIVER',
  VENDOR: 'VENDOR',
  INSURANCE: 'INSURANCE',
} as const;

export type DocumentFollowUpContactTarget =
  (typeof DOCUMENT_FOLLOW_UP_CONTACT_TARGETS)[keyof typeof DOCUMENT_FOLLOW_UP_CONTACT_TARGETS];

export type DocumentFollowUpContactRecipientSource =
  | 'entity_link'
  | 'customer_record'
  | 'vendor_record'
  | 'insurance_partner'
  | 'manual_required';

export type DocumentFollowUpContactRecipientDto = {
  entityType: string;
  entityId: string | null;
  displayName: string | null;
  email: string | null;
  emailSource: DocumentFollowUpContactRecipientSource;
};

export type DocumentFollowUpContactSenderDto = {
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
};

export type DocumentFollowUpContactDocumentReferenceDto = {
  extractionId: string;
  fileName: string | null;
  documentType: string | null;
  documentSubtype: string | null;
  displayLabel: string;
  referenceHint: string | null;
};

export type DocumentFollowUpContactAttachmentOfferDto = {
  extractionId: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  available: boolean;
  defaultSelected: false;
};

export type PublicDocumentFollowUpContactPrepareDto = {
  suggestionId: string;
  extractionId: string;
  contactTarget: DocumentFollowUpContactTarget;
  recipient: DocumentFollowUpContactRecipientDto;
  sender: DocumentFollowUpContactSenderDto;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  documentReference: DocumentFollowUpContactDocumentReferenceDto;
  attachmentOffer: DocumentFollowUpContactAttachmentOfferDto;
  excludedSensitiveFields: string[];
  preparedOnly: true;
  canSend: boolean;
  sendBlockedReason: string | null;
};

export type SendDocumentFollowUpContactInput = {
  toEmail: string;
  ccEmails?: string[];
  bccEmails?: string[];
  subject: string;
  bodyHtml: string;
  bodyText?: string;
  attachDocument?: boolean;
};

const CONTACT_PREPARE_SUGGESTION_TYPES = new Set<DocumentFollowUpSuggestionType>([
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW,
  DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.INSURANCE_REVIEW,
]);

export function isContactPrepareSuggestionType(
  type: DocumentFollowUpSuggestionType,
): boolean {
  return CONTACT_PREPARE_SUGGESTION_TYPES.has(type);
}

export function resolveContactTargetFromSuggestionType(
  type: DocumentFollowUpSuggestionType,
): DocumentFollowUpContactTarget | null {
  switch (type) {
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_CUSTOMER_CONTACT:
      return DOCUMENT_FOLLOW_UP_CONTACT_TARGETS.CUSTOMER;
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PREPARE_DRIVER_CONTACT:
      return DOCUMENT_FOLLOW_UP_CONTACT_TARGETS.DRIVER;
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.PAYMENT_REVIEW:
      return DOCUMENT_FOLLOW_UP_CONTACT_TARGETS.VENDOR;
    case DOCUMENT_FOLLOW_UP_SUGGESTION_TYPES.INSURANCE_REVIEW:
      return DOCUMENT_FOLLOW_UP_CONTACT_TARGETS.INSURANCE;
    default:
      return null;
  }
}
