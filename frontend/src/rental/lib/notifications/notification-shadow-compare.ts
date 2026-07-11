import type { ActionQueueItem } from '../../components/dashboard/dashboardTypes';

export interface ShadowCompareFingerprint {
  key: string;
  severity: string;
  entityType?: string;
  entityId?: string;
  status?: string;
  cta: string;
}

export interface ShadowCompareResult {
  v1ActiveCount: number;
  v2ActiveCount: number;
  countDelta: number;
  missingInV2: string[];
  extraInV2: string[];
  severityMismatches: number;
  entityMismatches: number;
  statusMismatches: number;
  ctaMismatches: number;
  duplicateIdsV2: number;
  duplicateSemanticKeysV2: number;
}

function activeItems(items: ActionQueueItem[]): ActionQueueItem[] {
  return items.filter((item) => item.queue?.lifecycleStatus !== 'resolved' && item.queue?.lifecycleStatus !== 'archived');
}

function fingerprint(item: ActionQueueItem): ShadowCompareFingerprint {
  return {
    key: item.semanticKey ?? item.id,
    severity: item.queue?.severity ?? item.severity,
    entityType: item.queue?.entityType,
    entityId: item.queue?.entityId,
    status: item.queue?.lifecycleStatus,
    cta: item.queue?.actionType ?? item.cta,
  };
}

function indexByKey(items: ActionQueueItem[]): Map<string, ShadowCompareFingerprint> {
  const map = new Map<string, ShadowCompareFingerprint>();
  for (const item of activeItems(items)) {
    const fp = fingerprint(item);
    if (!map.has(fp.key)) map.set(fp.key, fp);
  }
  return map;
}

function countDuplicateIds(items: ActionQueueItem[]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const item of items) {
    if (seen.has(item.id)) dupes += 1;
    else seen.add(item.id);
  }
  return dupes;
}

function countDuplicateSemanticKeys(items: ActionQueueItem[]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const item of activeItems(items)) {
    const key = item.semanticKey ?? item.id;
    if (seen.has(key)) dupes += 1;
    else seen.add(key);
  }
  return dupes;
}

/**
 * Internal V1 vs V2 diagnostic — no user-visible double rendering.
 * Logs only aggregate metrics and semantic keys (no titles/body text).
 */
export function compareNotificationQueuesShadow(
  v1Items: ActionQueueItem[],
  v2Items: ActionQueueItem[],
): ShadowCompareResult {
  const v1Map = indexByKey(v1Items);
  const v2Map = indexByKey(v2Items);

  const missingInV2: string[] = [];
  const extraInV2: string[] = [];
  let severityMismatches = 0;
  let entityMismatches = 0;
  let statusMismatches = 0;
  let ctaMismatches = 0;

  for (const [key, v1fp] of v1Map) {
    const v2fp = v2Map.get(key);
    if (!v2fp) {
      missingInV2.push(key);
      continue;
    }
    if (v1fp.severity !== v2fp.severity) severityMismatches += 1;
    if (v1fp.entityId && v2fp.entityId && v1fp.entityId !== v2fp.entityId) entityMismatches += 1;
    if (v1fp.status && v2fp.status && v1fp.status !== v2fp.status) statusMismatches += 1;
    if (v1fp.cta !== v2fp.cta) ctaMismatches += 1;
  }

  for (const key of v2Map.keys()) {
    if (!v1Map.has(key)) extraInV2.push(key);
  }

  const v1ActiveCount = v1Map.size;
  const v2ActiveCount = v2Map.size;

  return {
    v1ActiveCount,
    v2ActiveCount,
    countDelta: v2ActiveCount - v1ActiveCount,
    missingInV2,
    extraInV2,
    severityMismatches,
    entityMismatches,
    statusMismatches,
    ctaMismatches,
    duplicateIdsV2: countDuplicateIds(v2Items),
    duplicateSemanticKeysV2: countDuplicateSemanticKeys(v2Items),
  };
}

export function logShadowCompareDiagnostics(result: ShadowCompareResult): void {
  if (import.meta.env.PROD) return;
  console.debug('[notifications-v2 shadow]', {
    v1ActiveCount: result.v1ActiveCount,
    v2ActiveCount: result.v2ActiveCount,
    countDelta: result.countDelta,
    missingInV2Count: result.missingInV2.length,
    extraInV2Count: result.extraInV2.length,
    severityMismatches: result.severityMismatches,
    entityMismatches: result.entityMismatches,
    statusMismatches: result.statusMismatches,
    ctaMismatches: result.ctaMismatches,
    duplicateIdsV2: result.duplicateIdsV2,
    duplicateSemanticKeysV2: result.duplicateSemanticKeysV2,
    missingInV2Keys: result.missingInV2.slice(0, 20),
    extraInV2Keys: result.extraInV2.slice(0, 20),
  });
}
