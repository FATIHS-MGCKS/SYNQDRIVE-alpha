/**
 * Deterministic provider event id for SMS lifecycle webhooks.
 * Uses message_id + message_status per sent.dm dedupe guidance (not X-Webhook-ID).
 */
export function buildSmsWebhookExternalEventId(
  providerMessageId: string,
  messageStatus: string,
): string {
  return `${providerMessageId.trim()}:${messageStatus.trim().toUpperCase()}`;
}
