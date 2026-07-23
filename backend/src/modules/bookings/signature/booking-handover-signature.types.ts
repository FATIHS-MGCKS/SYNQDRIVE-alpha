export interface HandoverSignatureSummary {
  signaturePresent: boolean;
  signedAt: string | null;
  signatureReferenceId: string | null;
}

export interface HandoverSignatureViewUrlResponse {
  signatureReferenceId: string;
  viewUrl: string;
  expiresAt: string;
}

export const EMPTY_HANDOVER_SIGNATURE_SUMMARY: HandoverSignatureSummary = {
  signaturePresent: false,
  signedAt: null,
  signatureReferenceId: null,
};

export function buildProtocolCompleted(
  customer: HandoverSignatureSummary,
  staff: HandoverSignatureSummary,
): boolean {
  return customer.signaturePresent && staff.signaturePresent;
}
