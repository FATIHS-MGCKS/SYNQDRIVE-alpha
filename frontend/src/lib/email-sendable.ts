/** Matches backend `EMAIL_SENDABLE_DOCUMENT_STATUSES`. */
export const EMAIL_SENDABLE_DOCUMENT_STATUSES = new Set(['GENERATED', 'SENT']);

export function isEmailSendableDocument(status: string): boolean {
  return EMAIL_SENDABLE_DOCUMENT_STATUSES.has(status);
}
