export type InviteRateLimitScope =
  | 'INVITE_CREATE_ORG'
  | 'INVITE_CREATE_ACTOR'
  | 'INVITE_CREATE_RECIPIENT'
  | 'INVITE_RESEND_ORG'
  | 'INVITE_RESEND_ACTOR'
  | 'INVITE_RESEND_RECIPIENT';

export const INVITE_RATE_LIMITS = {
  createOrgPerHour: Number(process.env.INVITE_CREATE_ORG_PER_HOUR ?? 50),
  createActorPerHour: Number(process.env.INVITE_CREATE_ACTOR_PER_HOUR ?? 20),
  createRecipientPerHour: Number(process.env.INVITE_CREATE_RECIPIENT_PER_HOUR ?? 3),
  resendOrgPerHour: Number(process.env.INVITE_RESEND_ORG_PER_HOUR ?? 100),
  resendActorPerHour: Number(process.env.INVITE_RESEND_ACTOR_PER_HOUR ?? 30),
  resendRecipientPerHour: Number(process.env.INVITE_RESEND_RECIPIENT_PER_HOUR ?? 5),
} as const;

export const INVITE_EMAIL_OUTBOX = {
  maxAttempts: Number(process.env.INVITE_EMAIL_MAX_ATTEMPTS ?? 5),
  backoffMs: Number(process.env.INVITE_EMAIL_BACKOFF_MS ?? 60_000),
  pollBatchSize: Number(process.env.INVITE_EMAIL_POLL_BATCH_SIZE ?? 25),
} as const;

export const INVITE_RATE_LIMIT_MESSAGE =
  'Zu viele Einladungsanfragen. Bitte versuchen Sie es später erneut.';

export type InviteDeliveryStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'FAILED'
  | 'DEAD_LETTER';
