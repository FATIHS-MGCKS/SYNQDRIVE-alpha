/** Canonical plain-text reply limit — safe for WhatsApp Cloud API (4096). */
export const COMMUNICATION_REPLY_TEXT_MAX_LENGTH = 4096;

/** Client idempotency key max length (UUID or bounded opaque key). */
export const COMMUNICATION_REPLY_IDEMPOTENCY_KEY_MAX_LENGTH = 128;

/** Processing lease for in-flight reply commands (crash recovery window). */
export const COMMUNICATION_REPLY_PROCESSING_LEASE_MS = 30_000;
