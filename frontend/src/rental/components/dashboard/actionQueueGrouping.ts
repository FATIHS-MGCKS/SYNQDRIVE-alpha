import type {
  ActionQueueChildAction,
  ActionQueueChildSeverity,
  ActionQueueEntry,
  ActionQueueFilterTab,
  ActionQueueGroupItem,
  ActionQueueItem,
  ActionQueueLeafItem,
} from './dashboardTypes';
import { ACTION_QUEUE_FILTER_TABS } from './dashboardTypes';
import { HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY } from '../../lib/operational-issues';
import { isGroupedHmOemServiceTrackingDataNote } from './hmOemServiceTrackingDataNote';

/**
 * Count contract for Dashboard Notifications / ActionQueue:
 * Header badges, expand labels, and "+ N more" footers count **atomic actions**
 * (grouped children + standalone leaves), never parent group rows.
 * Example: one vehicle-health group with 3 modules → `3 Meldungen`, 1 visible parent row.
 */
export const ACTION_QUEUE_ATOMIC_COUNT_RULE =
  'Atomic actions (group children + standalone leaves) are counted; parent group rows are not.';

export interface ActionQueueRenderModel {
  dedupedItems: ActionQueueItem[];
  pinnedItems: ActionQueueItem[];
  entries: ActionQueueEntry[];
  filteredEntries: ActionQueueEntry[];
  visibleEntries: ActionQueueEntry[];
  /** Atomic issues after dedupe + tab filter (includes pinned leaves). */
  atomicCount: number;
  /** Atomic issues represented in the visible slice (includes pinned). */
  visibleAtomicCount: number;
}

const PINNED_CAP = 5;

function childIsCritical(child: ActionQueueChildAction): boolean {
  return child.severity === 'critical' || child.severity === 'overdue' || child.isOverdue;
}

function rebuildGroup(
  group: ActionQueueGroupItem,
  children: ActionQueueChildAction[],
  de: boolean,
): ActionQueueGroupItem | null {
  if (children.length === 0) return null;
  const severity = children.reduce<ActionQueueChildSeverity>((worst, child) => {
    return childSeverityRank(child.severity) > childSeverityRank(worst) ? child.severity : worst;
  }, 'info');
  return {
    ...group,
    children,
    severity,
    subtitle: groupSubtitle(group.groupType, children.length, de),
  };
}

/**
 * Semantic dedupe before grouping. One canonical OperationalIssue key must not
 * produce multiple render paths (parent, child, and leaf).
 */
export function dedupeActionQueueItems(items: ActionQueueItem[]): ActionQueueItem[] {
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
    if (item.priority > existing.priority) {
      byKey.set(key, item);
    }
  }

  return order.map((key) => byKey.get(key)!);
}

/** Item ids that are rendered only as grouped children (never standalone leaves). */
export function groupedChildItemIds(entries: ActionQueueEntry[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (entry.kind !== 'group') continue;
    for (const child of entry.children) {
      ids.add(child.itemId);
    }
  }
  return ids;
}

/** Visible semantic keys — each atomic issue appears at most once in the render model. */
export function visibleSemanticKeys(
  pinnedItems: ActionQueueItem[],
  entries: ActionQueueEntry[],
): string[] {
  const keys: string[] = [];
  for (const item of pinnedItems) {
    keys.push(item.semanticKey ?? item.id);
  }
  for (const entry of entries) {
    if (entry.kind === 'leaf') {
      keys.push(entry.semanticKey ?? entry.id);
      continue;
    }
    for (const child of entry.children) {
      keys.push(child.itemId);
    }
  }
  return keys;
}

/**
 * Render pipeline:
 * 1. dedupe atomic items
 * 2. split pinned vs groupable
 * 3. group (vehicle-health always grouped; others when shared groupKey)
 * 4. sort (inside groupActionQueueEntries)
 * 5. filter tab
 * 6. cap visible rows for the list
 */
export function prepareActionQueueRenderModel(input: {
  items: ActionQueueItem[];
  locale: string;
  tab: ActionQueueFilterTab;
  visibleEntryCap?: number;
}): ActionQueueRenderModel {
  const de = input.locale === 'de';
  const dedupedItems = dedupeActionQueueItems(input.items);

  const pinnedItems = dedupedItems
    .filter((item) => item.pinned && item.groupType !== 'vehicle-health')
    .slice(0, PINNED_CAP);
  const pinnedIds = new Set(pinnedItems.map((item) => item.id));

  const groupableItems = dedupedItems.filter((item) => !pinnedIds.has(item.id));
  const entries = groupActionQueueEntries(groupableItems, input.locale);
  const filteredEntries = filterActionQueueEntries(entries, input.tab, de);
  const visibleEntryCap = input.visibleEntryCap ?? filteredEntries.length;
  const visibleEntries = filteredEntries.slice(0, visibleEntryCap);

  const atomicCount = countAtomicActions(filteredEntries) + pinnedItems.length;
  const visibleAtomicCount = countAtomicActions(visibleEntries) + pinnedItems.length;

  return {
    dedupedItems,
    pinnedItems,
    entries,
    filteredEntries,
    visibleEntries,
    atomicCount,
    visibleAtomicCount,
  };
}

// critical > overdue > warning > attention > info
const CHILD_SEVERITY_RANK: Record<ActionQueueChildSeverity, number> = {
  critical: 5,
  overdue: 4,
  warning: 3,
  attention: 2,
  info: 1,
};

export function childSeverityRank(s: ActionQueueChildSeverity): number {
  return CHILD_SEVERITY_RANK[s] ?? 0;
}

/**
 * Preferred ordering of health modules inside a vehicle-health group.
 * battery, brakes, tires, service_compliance, error_codes, complaints,
 * vehicle_alerts (per product spec).
 */
const HEALTH_MODULE_ORDER: Record<string, number> = {
  battery: 0,
  brakes: 1,
  tires: 2,
  service_compliance: 3,
  error_codes: 4,
  complaints: 5,
  vehicle_alerts: 6,
  overview: 7,
};

/** Map an atomic item to its effective child display severity. */
export function toChildSeverity(item: ActionQueueItem): ActionQueueChildSeverity {
  if (item.childSeverity) return item.childSeverity;
  if (item.isOverdue && item.severity !== 'critical') return 'overdue';
  return item.severity;
}

function toChildAction(item: ActionQueueItem): ActionQueueChildAction {
  return {
    id: `child-${item.id}`,
    itemId: item.id,
    severity: toChildSeverity(item),
    category: item.category,
    module: item.module,
    moduleLabel: item.moduleLabel,
    title: item.title,
    detail: item.detail || item.reason || undefined,
    timeLabel: item.timeLabel,
    timeSortMs: item.timeSortMs,
    priority: item.priority,
    cta: item.cta,
    ctaLabel: item.ctaLabel,
    vehicleId: item.vehicleId,
    bookingId: item.bookingId,
    stationId: item.stationId,
    customerId: item.customerId,
    isOverdue: item.isOverdue,
  };
}

function moduleOrder(child: ActionQueueChildAction): number {
  if (!child.module) return 99;
  return HEALTH_MODULE_ORDER[child.module] ?? 50;
}

function sortChildren(
  children: ActionQueueChildAction[],
  isHealth: boolean,
): ActionQueueChildAction[] {
  return [...children].sort((a, b) => {
    const bySeverity = childSeverityRank(b.severity) - childSeverityRank(a.severity);
    if (bySeverity !== 0) return bySeverity;
    if (isHealth) {
      const byModule = moduleOrder(a) - moduleOrder(b);
      if (byModule !== 0) return byModule;
    }
    if (a.timeSortMs !== b.timeSortMs) return a.timeSortMs - b.timeSortMs;
    return b.priority - a.priority;
  });
}

function groupSubtitle(
  groupType: ActionQueueGroupItem['groupType'],
  count: number,
  de: boolean,
): string {
  if (groupType === 'vehicle-health') {
    if (de) {
      return count === 1 ? '1 aktiver Gesundheitshinweis' : `${count} aktive Gesundheitshinweise`;
    }
    return count === 1 ? '1 active health issue' : `${count} active health issues`;
  }
  if (de) return count === 1 ? '1 Aktion' : `${count} Aktionen`;
  return count === 1 ? '1 action' : `${count} actions`;
}

function groupFallbackTitle(
  groupType: ActionQueueGroupItem['groupType'],
  de: boolean,
): string {
  switch (groupType) {
    case 'vehicle-health':
    case 'vehicle-ops':
      return de ? 'Fahrzeug' : 'Vehicle';
    case 'station-ops':
      return de ? 'Station' : 'Station';
    case 'booking':
      return de ? 'Buchung' : 'Booking';
    case 'customer-docs':
    case 'finance':
      return de ? 'Kunde' : 'Customer';
    default:
      return de ? 'Hinweise' : 'Notifications';
  }
}

function buildGroup(
  groupKey: string,
  bucket: ActionQueueItem[],
  de: boolean,
): ActionQueueGroupItem {
  const head = bucket[0];
  const groupType = head.groupType ?? 'vehicle-ops';
  const isHealth = groupType === 'vehicle-health';
  const children = sortChildren(bucket.map(toChildAction), isHealth);

  const severity = children.reduce<ActionQueueChildSeverity>((worst, c) => {
    return childSeverityRank(c.severity) > childSeverityRank(worst) ? c.severity : worst;
  }, 'info');

  const priority = bucket.reduce((max, i) => Math.max(max, i.priority), 0);
  const title = head.entityLabel || groupFallbackTitle(groupType, de);

  return {
    kind: 'group',
    id: `group-${groupKey}`,
    groupKey,
    groupType,
    severity,
    category: head.category,
    title,
    subtitle: groupSubtitle(groupType, children.length, de),
    entityLabel: head.entityLabel,
    vehicleId: head.vehicleId,
    bookingId: head.bookingId,
    stationId: head.stationId,
    customerId: head.customerId,
    children,
    priority,
  };
}

function toLeaf(item: ActionQueueItem): ActionQueueLeafItem {
  return { ...item, kind: 'leaf' };
}

function entrySeverityRank(entry: ActionQueueEntry): number {
  if (entry.kind === 'group') return childSeverityRank(entry.severity);
  return childSeverityRank(toChildSeverity(entry));
}

/**
 * Turn a flat, already-prioritised list of atomic actions into render-level
 * entries: single leaves or multi-child groups. Vehicle-health items are
 * always rendered in the group layout (even a single module) for visual
 * consistency; other contexts only group when more than one item shares a
 * `groupKey`.
 */
export function groupActionQueueEntries(
  items: ActionQueueItem[],
  locale: string,
): ActionQueueEntry[] {
  const de = locale === 'de';
  const buckets = new Map<string, ActionQueueItem[]>();
  const order: string[] = [];

  for (const item of items) {
    const key = item.groupKey ?? `__leaf:${item.id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
      order.push(key);
    }
    bucket.push(item);
  }

  const entries: ActionQueueEntry[] = [];
  for (const key of order) {
    const bucket = buckets.get(key)!;
    const groupType = bucket[0].groupType;
    const shouldGroup = groupType === 'vehicle-health' || bucket.length > 1;
    if (shouldGroup && bucket[0].groupKey) {
      entries.push(buildGroup(bucket[0].groupKey, bucket, de));
    } else {
      for (const item of bucket) entries.push(toLeaf(item));
    }
  }

  return entries.sort((a, b) => {
    const bySeverity = entrySeverityRank(b) - entrySeverityRank(a);
    if (bySeverity !== 0) return bySeverity;
    return b.priority - a.priority;
  });
}

// ─── Filtering ────────────────────────────────────────────────────────────

function leafIsCritical(leaf: ActionQueueLeafItem): boolean {
  return leaf.severity === 'critical' || leaf.isOverdue;
}

function leafMatchesTab(leaf: ActionQueueLeafItem, tab: ActionQueueFilterTab): boolean {
  if (categoryMatches(leaf.category, tab)) return true;
  if (tab === 'vehicle' && isGroupedHmOemServiceTrackingDataNote(leaf)) return true;
  if (tab === 'notifications' && leaf.semanticKey === HM_OEM_SERVICE_TRACKING_MISSING_ORG_KEY) return true;
  return false;
}

function categoryMatches(
  category: ActionQueueItem['category'],
  tab: ActionQueueFilterTab,
): boolean {
  if (tab === 'operations') return category === 'operations' || category === 'handover';
  if (tab === 'vehicle') return category === 'vehicle' || category === 'health';
  if (tab === 'notifications') return category === 'notification';
  return true;
}

/**
 * Filter entries while keeping groups intact. Critical tab trims notice/warning
 * children so expanded groups never show non-critical duplicates.
 */
export function filterActionQueueEntries(
  entries: ActionQueueEntry[],
  tab: ActionQueueFilterTab,
  de = false,
): ActionQueueEntry[] {
  if (tab === 'all') return entries;

  if (tab === 'critical') {
    const out: ActionQueueEntry[] = [];
    for (const entry of entries) {
      if (entry.kind === 'leaf') {
        if (leafIsCritical(entry)) out.push(entry);
        continue;
      }
      const filteredChildren = entry.children.filter(childIsCritical);
      const rebuilt = rebuildGroup(entry, filteredChildren, de);
      if (rebuilt) out.push(rebuilt);
    }
    return out;
  }

  return entries.filter((entry) => {
    if (entry.kind === 'group') {
      if (entry.groupType === 'vehicle-health' && tab === 'vehicle') return true;
      if (categoryMatches(entry.category, tab)) return true;
      return entry.children.some((c) => categoryMatches(c.category, tab));
    }
    return leafMatchesTab(entry, tab);
  });
}

/** Count atomic actions across entries (a group counts as its child count). */
export function countAtomicActions(entries: ActionQueueEntry[]): number {
  return entries.reduce((sum, entry) => sum + (entry.kind === 'group' ? entry.children.length : 1), 0);
}

/** Per-tab badge counts — reuses dedupe, grouping, and filterActionQueueEntries (UI only). */
export function computeActionQueueTabCounts(
  items: ActionQueueItem[],
  locale: string,
): Record<ActionQueueFilterTab, number> {
  const de = locale === 'de';
  const dedupedItems = dedupeActionQueueItems(items);
  const pinnedItems = dedupedItems
    .filter((item) => item.pinned && item.groupType !== 'vehicle-health')
    .slice(0, PINNED_CAP);
  const pinnedIds = new Set(pinnedItems.map((item) => item.id));
  const groupableItems = dedupedItems.filter((item) => !pinnedIds.has(item.id));
  const entries = groupActionQueueEntries(groupableItems, locale);

  const counts = {} as Record<ActionQueueFilterTab, number>;
  for (const tab of ACTION_QUEUE_FILTER_TABS) {
    const filtered = filterActionQueueEntries(entries, tab, de);
    let count = countAtomicActions(filtered);
    if (tab === 'all' || tab === 'critical') {
      count += pinnedItems.length;
    }
    counts[tab] = count;
  }
  return counts;
}
