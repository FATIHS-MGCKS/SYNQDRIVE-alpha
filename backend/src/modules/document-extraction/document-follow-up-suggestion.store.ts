import { mergePipelinePlausibility, readPipelinePayload } from './document-content-cache.util';
import type { DocumentFollowUpSuggestion } from './document-follow-up-suggestion.types';
import { DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES } from './document-follow-up-suggestion.types';

export function readFollowUpSuggestions(plausibility: unknown): DocumentFollowUpSuggestion[] {
  const pipeline = readPipelinePayload(plausibility);
  const raw = pipeline.followUpSuggestions;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (row): row is DocumentFollowUpSuggestion =>
      Boolean(row) &&
      typeof row === 'object' &&
      typeof (row as DocumentFollowUpSuggestion).suggestionId === 'string' &&
      typeof (row as DocumentFollowUpSuggestion).extractionId === 'string' &&
      typeof (row as DocumentFollowUpSuggestion).actionPlanId === 'string' &&
      typeof (row as DocumentFollowUpSuggestion).type === 'string' &&
      typeof (row as DocumentFollowUpSuggestion).title === 'string',
  );
}

export function storeFollowUpSuggestions(
  plausibility: unknown,
  suggestions: DocumentFollowUpSuggestion[],
): Record<string, unknown> {
  return mergePipelinePlausibility(plausibility, { followUpSuggestions: suggestions });
}

export function supersedeFollowUpSuggestions(plausibility: unknown): Record<string, unknown> {
  const current = readFollowUpSuggestions(plausibility);
  if (current.length === 0) return mergePipelinePlausibility(plausibility, {});
  const now = new Date().toISOString();
  return storeFollowUpSuggestions(
    plausibility,
    current.map((row) =>
      row.status === DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUGGESTED
        ? {
            ...row,
            status: DOCUMENT_FOLLOW_UP_SUGGESTION_STATUSES.SUPERSEDED,
            updatedAt: now,
          }
        : row,
    ),
  );
}
