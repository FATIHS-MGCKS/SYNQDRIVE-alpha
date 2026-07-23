import { LEGAL_DELIVERY_EVIDENCE_ERROR_CODE } from './legal-document-delivery-evidence.constants';

export type LegalDeliveryEvidenceErrorCode =
  (typeof LEGAL_DELIVERY_EVIDENCE_ERROR_CODE)[keyof typeof LEGAL_DELIVERY_EVIDENCE_ERROR_CODE];

export class LegalDocumentDeliveryEvidenceError extends Error {
  readonly code: LegalDeliveryEvidenceErrorCode;

  constructor(
    code: LegalDeliveryEvidenceErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'LegalDocumentDeliveryEvidenceError';
    this.code = code;
  }
}
