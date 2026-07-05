import type { RpmWebhookCandidate, RpmWebhookCandidateStatus } from '@prisma/client';

export const RPM_WEBHOOK_SOURCE = 'DIMO Vehicle Trigger' as const;

export interface RpmCandidateContextSummary {
  status: string | null;
  confidence: string | null;
  evidenceGrade: string | null;
  classifications: string[];
}

export interface RpmCandidateView {
  id: string;
  observedAt: string;
  observedValue: number;
  threshold: number;
  status: RpmWebhookCandidateStatus;
  tripId: string | null;
  tokenId: number;
  source: typeof RPM_WEBHOOK_SOURCE;
  context: RpmCandidateContextSummary | null;
}

export interface TripRpmCandidatesResponse {
  candidates: RpmCandidateView[];
  count: number;
}

export interface VehicleRpmWebhookSummary {
  lteR1IceCapable: boolean;
  webhookConfigured: 'active' | 'not_configured' | 'unknown';
  count24h: number;
  count7d: number;
  lastObservedAt: string | null;
  maxObservedRpm7d: number | null;
  thresholdDefault: number;
  recentCandidates: RpmCandidateView[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function extractRpmCandidateContext(
  contextAssessmentJson: unknown,
): RpmCandidateContextSummary | null {
  const ca = asRecord(contextAssessmentJson);
  if (!ca) return null;

  const classifications = Array.isArray(ca.classifications)
    ? (ca.classifications as unknown[]).filter((c): c is string => typeof c === 'string')
    : Array.isArray(ca.preliminaryClassifications)
      ? (ca.preliminaryClassifications as unknown[]).filter((c): c is string => typeof c === 'string')
      : [];

  return {
    status: typeof ca.status === 'string' ? ca.status : null,
    confidence: typeof ca.confidence === 'string' ? ca.confidence : null,
    evidenceGrade: typeof ca.evidenceGrade === 'string' ? ca.evidenceGrade : null,
    classifications,
  };
}

export function mapRpmWebhookCandidate(row: RpmWebhookCandidate): RpmCandidateView {
  return {
    id: row.id,
    observedAt: row.observedAt.toISOString(),
    observedValue: row.observedValue,
    threshold: row.threshold,
    status: row.status,
    tripId: row.tripId,
    tokenId: row.tokenId,
    source: RPM_WEBHOOK_SOURCE,
    context: extractRpmCandidateContext(row.contextAssessmentJson),
  };
}

export function buildTripRpmCandidatesResponse(
  rows: RpmWebhookCandidate[],
): TripRpmCandidatesResponse {
  const candidates = rows.map(mapRpmWebhookCandidate);
  return { candidates, count: candidates.length };
}
