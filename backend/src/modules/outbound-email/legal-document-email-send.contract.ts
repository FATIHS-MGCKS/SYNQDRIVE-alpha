import { createHash } from 'crypto';

export function buildLegalDocumentEmailSendIdempotencyKey(params: {
  organizationId: string;
  bookingId: string;
  documentIds: string[];
  toEmail: string;
  clientRequestId?: string | null;
}): string {
  const clientRequestId = params.clientRequestId?.trim();
  if (clientRequestId) {
    return `legal-email:${params.organizationId}:${clientRequestId}`;
  }
  const sortedIds = [...params.documentIds].sort().join(',');
  const recipient = params.toEmail.trim().toLowerCase();
  const digest = createHash('sha256')
    .update(`${params.bookingId}|${sortedIds}|${recipient}`)
    .digest('hex')
    .slice(0, 24);
  return `legal-email:${params.organizationId}:${params.bookingId}:${digest}`;
}

export function buildLegalDeliveryEvidenceRequestId(
  outboundEmailId: string,
  documentType: string,
): string {
  return `legal-email-evidence:${outboundEmailId}:${documentType}`;
}
