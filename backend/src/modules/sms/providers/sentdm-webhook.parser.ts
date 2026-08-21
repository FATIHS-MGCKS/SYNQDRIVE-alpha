export interface SentDmWebhookMessagePayload {
  message_id?: string;
  message_status?: string;
  channel?: string;
  account_id?: string;
  /** Remote sender/customer number (E.164) — NOT SynqDrive-owned receiving number. */
  inbound_number?: string;
  /** SynqDrive/sent.dm provisioned receiving number. */
  outbound_number?: string;
  text?: string;
  failure_code?: string;
  updated_at?: string;
  received_at?: string;
}

export interface ParsedSentDmWebhookEvent {
  field: string;
  event: string;
  timestamp?: string;
  payload: SentDmWebhookMessagePayload;
}

export function parseSentDmWebhookEvent(body: unknown): ParsedSentDmWebhookEvent | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const record = body as Record<string, unknown>;
  const field = typeof record.field === 'string' ? record.field : '';
  const event = typeof record.event === 'string' ? record.event : '';
  const payload =
    record.payload && typeof record.payload === 'object' && !Array.isArray(record.payload)
      ? (record.payload as SentDmWebhookMessagePayload)
      : {};
  if (!field || !event) {
    return null;
  }
  return { field, event, payload };
}

export function isTerminalDeliveryEvent(eventName: string): boolean {
  return eventName === 'message.delivered' || eventName === 'message.failed';
}

export function isInboundReceivedEvent(eventName: string): boolean {
  return eventName === 'message.received';
}

export function mapSentDmEventToMessageStatus(eventName: string, payloadStatus?: string): string {
  if (payloadStatus?.trim()) {
    return payloadStatus.trim().toUpperCase();
  }
  switch (eventName) {
    case 'message.delivered':
      return 'DELIVERED';
    case 'message.failed':
      return 'FAILED';
    case 'message.received':
      return 'RECEIVED';
    case 'message.sent':
      return 'SENT';
    case 'message.queued':
      return 'QUEUED';
    default:
      return eventName.replace('message.', '').toUpperCase();
  }
}
