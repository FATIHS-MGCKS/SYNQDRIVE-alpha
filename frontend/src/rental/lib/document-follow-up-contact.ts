import type { DocumentFollowUpSuggestionType } from './document-extraction.types';

const CONTACT_PREPARE_TYPES = new Set<DocumentFollowUpSuggestionType>([
  'PREPARE_CUSTOMER_CONTACT',
  'PREPARE_DRIVER_CONTACT',
  'PAYMENT_REVIEW',
  'INSURANCE_REVIEW',
]);

export function isContactPrepareSuggestionType(type: DocumentFollowUpSuggestionType): boolean {
  return CONTACT_PREPARE_TYPES.has(type);
}
