import { CustomerVerificationCheckKind } from '@prisma/client';

export type DiditWebhookPayloadV3 = {
  event_id?: string;
  webhook_type?: string;
  timestamp?: number | string;
  created_at?: string;
  application_id?: string;
  session_id?: string;
  status?: string;
  workflow_id?: string;
  workflow_version?: string;
  vendor_data?: string;
  metadata?: Record<string, unknown>;
  decision?: DiditDecisionV3;
  resubmit_info?: unknown;
};

export type DiditDecisionV3 = {
  id_verifications?: DiditIdVerification[];
  poa_verifications?: DiditPoaVerification[];
  liveness_checks?: unknown[];
  face_matches?: unknown[];
  [key: string]: unknown;
};

export type DiditIdVerification = {
  first_name?: string;
  last_name?: string;
  document_type?: string;
  date_of_birth?: string;
  expiration_date?: string;
  issuing_state?: string;
  nationality?: string;
  warnings?: unknown[];
  document_number?: string;
  mrz?: unknown;
  [key: string]: unknown;
};

export type DiditPoaVerification = {
  status?: string;
  document_type?: string;
  issuer?: string;
  poa_address?: string;
  poa_parsed_address?: unknown;
  issue_date?: string;
  expiration_date?: string;
  [key: string]: unknown;
};

export type ParsedVendorData = {
  organizationId: string;
  customerId: string;
  bookingId: string | null;
  kind: CustomerVerificationCheckKind | null;
  nonce: string | null;
};

export const SUPPORTED_DIDIT_WEBHOOK_TYPES = new Set([
  'status.updated',
  'data.updated',
]);

const VENDOR_DATA_KINDS = new Set<string>([
  'ID_DOCUMENT',
  'DRIVING_LICENSE',
  'PROOF_OF_ADDRESS',
]);

export function parseDiditVendorData(
  vendorData: string | null | undefined,
): ParsedVendorData | null {
  if (!vendorData?.trim()) return null;

  const parts = vendorData.split('|');
  const map = new Map<string, string>();
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx <= 0) continue;
    map.set(part.slice(0, idx), part.slice(idx + 1));
  }

  const organizationId = map.get('org');
  const customerId = map.get('customer');
  if (!organizationId || !customerId) return null;

  const bookingRaw = map.get('booking');
  const kindRaw = map.get('kind');
  const kind =
    kindRaw && VENDOR_DATA_KINDS.has(kindRaw)
      ? (kindRaw as CustomerVerificationCheckKind)
      : null;

  return {
    organizationId,
    customerId,
    bookingId: bookingRaw && bookingRaw !== 'none' ? bookingRaw : null,
    kind,
    nonce: map.get('nonce') ?? null,
  };
}

export function buildDiditDedupeEventId(payload: DiditWebhookPayloadV3): string | null {
  if (payload.event_id?.trim()) {
    return payload.event_id.trim();
  }
  const sessionId = payload.session_id?.trim();
  const webhookType = payload.webhook_type?.trim();
  const timestamp = payload.timestamp;
  if (!sessionId || !webhookType || timestamp === undefined || timestamp === null) {
    return null;
  }
  return `${sessionId}|${webhookType}|${timestamp}`;
}
