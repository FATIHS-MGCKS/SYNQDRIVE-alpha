export type SentDmProviderErrorKind =
  | 'TERMINAL_REJECTION'
  | 'RATE_LIMIT'
  | 'TRANSIENT_5XX'
  | 'NETWORK_TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'AUTH_CONFIGURATION'
  | 'UNKNOWN';

export interface SentDmSendSuccess {
  ok: true;
  providerMessageId: string;
  providerStatus: string;
  acceptedAt: Date;
  /** Whether acceptedAt came from sent.dm meta.timestamp or local receipt time. */
  acceptedAtSource: 'provider_meta_timestamp' | 'local_receipt_fallback';
}

export interface SentDmSendFailure {
  ok: false;
  kind: SentDmProviderErrorKind;
  failureCode: string;
  retryable: boolean;
}

export type SentDmSendResult = SentDmSendSuccess | SentDmSendFailure;

export interface SentDmSendRequest {
  organizationId: string;
  recipientE164: string;
  body: string;
  idempotencyKey: string;
  senderProfileId: string;
  sandbox?: boolean;
}
