/** Stale DISPATCHING lease before safe idempotent provider retry (C5.1). */
export const SMS_DISPATCH_STALE_MS = 120_000;

/** sent.dm Idempotency-Key cache window — retries must reuse same businessOperationId within this window. */
export const SENT_DM_IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const SMS_MESSAGE_DIRECTIONS = ['incoming', 'outgoing'] as const;
export type SmsMessageDirection = (typeof SMS_MESSAGE_DIRECTIONS)[number];

export const SMS_SENDER_TYPES = ['customer', 'user', 'system', 'ai_agent'] as const;
export type SmsSenderType = (typeof SMS_SENDER_TYPES)[number];
