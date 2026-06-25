export type DiditSessionMetadata = {
  organizationId: string;
  customerId: string;
  bookingId?: string | null;
  kind: string;
};

export type DiditCreateSessionRequest = {
  workflow_id: string;
  vendor_data: string;
  callback: string;
  callback_method: 'both';
  metadata: DiditSessionMetadata;
};

export type DiditCreateSessionResponse = {
  session_id: string;
  session_token: string;
  url: string;
  status: string;
  workflow_id: string;
  vendor_data: string;
};

export type DiditDecisionPayload = {
  liveness_checks?: unknown[];
  face_matches?: unknown[];
  [key: string]: unknown;
};
