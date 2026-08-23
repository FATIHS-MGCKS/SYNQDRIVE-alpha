/**
 * Builds a scoped native WhatsApp idempotency key for canonical reply correlation.
 * Stored on WhatsAppMessage.idempotencyKey (globally unique) without cross-tenant collision.
 */
export function buildNativeWhatsAppIdempotencyKey(
  organizationId: string,
  conversationId: string,
  clientIdempotencyKey: string,
): string {
  return `comm-reply:${organizationId}:${conversationId}:${clientIdempotencyKey}`;
}
