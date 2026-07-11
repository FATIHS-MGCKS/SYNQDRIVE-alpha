import type { ActionQueueItem, ActionQueueSeverity, InsightDataSource } from './dashboardTypes';

const SEVERITY_RANK: Record<ActionQueueSeverity, number> = {
  critical: 4,
  warning: 3,
  attention: 2,
  info: 1,
};

/**
 * Source ownership priority (lower = preferred canonical owner).
 * 1 normalized operational issue → 2 structured insight → 3 booking tile →
 * 4 predictive → 5 derived → 6 synthetic notification thread.
 */
export function actionQueueSourceTier(item: ActionQueueItem): number {
  if (item.id.startsWith('issue-')) return 1;
  if (item.insightId || item.insight) return 2;
  if (item.id.startsWith('pickup-') || item.id.startsWith('return-')) return 3;
  if (item.predictiveInsight || item.source === 'predictive-operations') return 4;
  if (item.source === 'derived-operations') return 5;
  if (item.id.startsWith('notif-')) return 6;
  return 7;
}

function severityRank(severity: ActionQueueSeverity): number {
  return SEVERITY_RANK[severity] ?? 0;
}

function higherSeverity(a: ActionQueueSeverity, b: ActionQueueSeverity): ActionQueueSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

function structuralScore(item: ActionQueueItem): number {
  let score = 0;
  if (item.vehicleId) score += 1;
  if (item.bookingId) score += 1;
  if (item.stationId) score += 1;
  if (item.cta && item.cta !== 'open-rental') score += 1;
  if (item.reason) score += 1;
  if (item.detail) score += 1;
  if (item.insight) score += 2;
  if (item.pickupItem || item.returnItem) score += 1;
  if (item.predictiveInsight) score += 1;
  return score;
}

function pickPreferredSource(
  existing: ActionQueueItem,
  incoming: ActionQueueItem,
): ActionQueueItem {
  const existingTier = actionQueueSourceTier(existing);
  const incomingTier = actionQueueSourceTier(incoming);

  if (incomingTier < existingTier) return incoming;
  if (existingTier < incomingTier) return existing;

  const existingScore = structuralScore(existing);
  const incomingScore = structuralScore(incoming);
  if (incomingScore > existingScore) return incoming;
  if (existingScore > incomingScore) return existing;

  return incoming.priority >= existing.priority ? incoming : existing;
}

function mergeActionQueueItem(existing: ActionQueueItem, incoming: ActionQueueItem): ActionQueueItem {
  const primary = pickPreferredSource(existing, incoming);
  const secondary = primary === existing ? incoming : existing;

  return {
    ...primary,
    semanticKey: primary.semanticKey ?? secondary.semanticKey,
    severity: higherSeverity(existing.severity, incoming.severity),
    priority: Math.max(existing.priority, incoming.priority),
    timeSortMs: Math.max(existing.timeSortMs, incoming.timeSortMs),
    reason: primary.reason || secondary.reason,
    detail: primary.detail || secondary.detail,
    entityLabel: primary.entityLabel || secondary.entityLabel,
    timeLabel: primary.timeLabel || secondary.timeLabel,
    vehicleId: primary.vehicleId ?? secondary.vehicleId,
    bookingId: primary.bookingId ?? secondary.bookingId,
    stationId: primary.stationId ?? secondary.stationId,
    customerId: primary.customerId ?? secondary.customerId,
    cta: primary.cta !== 'open-rental' ? primary.cta : secondary.cta,
    ctaLabel: primary.ctaLabel ?? secondary.ctaLabel,
    isOverdue: existing.isOverdue || incoming.isOverdue,
    pinned: existing.pinned || incoming.pinned,
    insightId: primary.insightId ?? secondary.insightId,
    insight: primary.insight ?? secondary.insight,
    pickupItem: primary.pickupItem ?? secondary.pickupItem,
    returnItem: primary.returnItem ?? secondary.returnItem,
    predictiveInsight: primary.predictiveInsight ?? secondary.predictiveInsight,
    module: primary.module ?? secondary.module,
    moduleLabel: primary.moduleLabel ?? secondary.moduleLabel,
    childSeverity: primary.childSeverity ?? secondary.childSeverity,
    groupKey: primary.groupKey ?? secondary.groupKey,
    groupType: primary.groupType ?? secondary.groupType,
  };
}

/**
 * Single dedupe entry point for ActionQueue items.
 * Merges by semanticKey when present, otherwise by stable id.
 */
export function dedupeActionQueueBySemanticKey(items: ActionQueueItem[]): ActionQueueItem[] {
  const byKey = new Map<string, ActionQueueItem>();
  const order: string[] = [];

  for (const item of items) {
    const key = item.semanticKey ?? item.id;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      order.push(key);
      continue;
    }
    byKey.set(key, mergeActionQueueItem(existing, item));
  }

  return order.map((key) => byKey.get(key)!);
}

export function isSyntheticDrivingAssessmentDuplicate(
  item: ActionQueueItem,
  normalizedKeys: Set<string>,
): boolean {
  if (!item.id.startsWith('notif-')) return false;
  if (!item.semanticKey) return false;
  return normalizedKeys.has(item.semanticKey);
}

export function filterSuppressedQueueSources(
  items: ActionQueueItem[],
  options?: { suppressSyntheticDrivingAssessment?: boolean },
): ActionQueueItem[] {
  const normalizedKeys = new Set(
    items.filter((item) => item.id.startsWith('issue-') && item.semanticKey).map((item) => item.semanticKey!),
  );

  return items.filter((item) => {
    if (options?.suppressSyntheticDrivingAssessment && isSyntheticDrivingAssessmentDuplicate(item, normalizedKeys)) {
      return false;
    }
    return true;
  });
}

export type { InsightDataSource };
