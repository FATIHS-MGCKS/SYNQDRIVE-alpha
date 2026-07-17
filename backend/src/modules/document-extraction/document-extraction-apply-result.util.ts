import type {
  DocumentApplyTypedResult,
  DocumentDownstreamEntityType,
  ProvenApplyAuditDetails,
} from './document-extraction-apply-result.types';
import { readPublicActionAudit } from './document-content-cache.util';

export function createApplySuccess(params: {
  downstreamEntityType: DocumentDownstreamEntityType;
  downstreamEntityId: string;
  actionCount?: number;
  serviceEventId?: string | null;
  detail?: unknown;
}): DocumentApplyTypedResult {
  return {
    success: true,
    downstreamEntityType: params.downstreamEntityType,
    downstreamEntityId: params.downstreamEntityId,
    actionCount: params.actionCount ?? 1,
    errors: [],
    serviceEventId: params.serviceEventId ?? null,
    detail: params.detail,
  };
}

export function createApplyFailure(
  errors: string[],
  detail?: unknown,
): DocumentApplyTypedResult {
  return {
    success: false,
    downstreamEntityType: null,
    downstreamEntityId: null,
    actionCount: 0,
    errors: errors.length > 0 ? errors : ['DOWNSTREAM_APPLY_FAILED'],
    detail,
  };
}

export function createArchiveOnlyApplySuccess(): DocumentApplyTypedResult {
  return {
    success: true,
    downstreamEntityType: 'archive',
    downstreamEntityId: null,
    actionCount: 0,
    errors: [],
  };
}

/**
 * A bare `{}` or missing entity proof is never treated as apply success.
 * ARCHIVE_ONLY is the explicit exception (no downstream entity required).
 */
export function isProvenApplySuccess(result: DocumentApplyTypedResult): boolean {
  if (!result.success) return false;
  if (result.downstreamEntityType === 'archive') return true;
  return Boolean(
    result.downstreamEntityType &&
      typeof result.downstreamEntityId === 'string' &&
      result.downstreamEntityId.trim().length > 0 &&
      result.actionCount > 0,
  );
}

export function toProvenApplyAuditDetails(
  result: DocumentApplyTypedResult,
): ProvenApplyAuditDetails | null {
  if (!isProvenApplySuccess(result) || !result.downstreamEntityType) return null;
  return {
    success: true,
    downstreamEntityType: result.downstreamEntityType,
    downstreamEntityId: result.downstreamEntityId,
    actionCount: result.actionCount,
    ...(result.downstreamEntityType === 'archive' ? { mode: 'archive_only' as const } : {}),
  };
}

export function readProvenApplyFromAudit(plausibility: unknown): ProvenApplyAuditDetails | null {
  const actions = readPublicActionAudit(plausibility);
  for (let i = actions.length - 1; i >= 0; i -= 1) {
    const entry = actions[i];
    if (entry.action !== 'apply') continue;
    const details = entry.details;
    if (!details || typeof details !== 'object' || Array.isArray(details)) continue;
    const row = details as Record<string, unknown>;
    if (row.success !== true || typeof row.downstreamEntityType !== 'string') continue;
    const downstreamEntityType = row.downstreamEntityType as DocumentDownstreamEntityType;
    if (downstreamEntityType === 'archive') {
      return {
        success: true,
        downstreamEntityType: 'archive',
        downstreamEntityId: null,
        actionCount: typeof row.actionCount === 'number' ? row.actionCount : 0,
        mode: 'archive_only',
      };
    }
    const downstreamEntityId =
      typeof row.downstreamEntityId === 'string' ? row.downstreamEntityId : null;
    const actionCount = typeof row.actionCount === 'number' ? row.actionCount : 0;
    if (!downstreamEntityId || actionCount <= 0) continue;
    return {
      success: true,
      downstreamEntityType,
      downstreamEntityId,
      actionCount,
    };
  }
  return null;
}
