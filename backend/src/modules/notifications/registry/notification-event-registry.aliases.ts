/**
 * Producer-facing eventType synonyms → canonical registry codes.
 * Producers must converge on canonical codes; aliases exist for migration only.
 */
export const NOTIFICATION_EVENT_TYPE_ALIASES: Readonly<Record<string, string>> = {
  /** Connectivity domain vocabulary — registry canonical is WEBHOOK_FAILURE. */
  WEBHOOK_PROCESSING_FAILED: 'WEBHOOK_FAILURE',
};
