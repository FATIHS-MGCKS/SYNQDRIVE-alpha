import type {
  DashboardInsight,
  InsightSeverity,
  InsightType,
  VehicleHealthAlert,
} from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type { DashboardNotificationItem } from '../BusinessInsightsBox';
import type {
  ActionQueueCategory,
  ActionQueueCta,
  ActionQueueEmptySummary,
  ActionQueueFilterTab,
  ActionQueueItem,
  ActionQueueSeverity,
  InsightDataSource,
} from './dashboardTypes';
import type { DerivedOperationalInsight } from './deriveOperationalInsights';
import type { PredictiveOperationsInsight } from './derivePredictiveOperationsInsights';
import type { StatusTone } from '../../../components/patterns';

const VEHICLE_HEALTH_INSIGHT_TYPES = new Set<InsightType>([
  'BATTERY_CRITICAL',
  'SERVICE_OVERDUE',
  'TIRE_CRITICAL',
  'BRAKE_CRITICAL',
]);

const FINANCIAL_TYPES = new Set<InsightType>(['LOW_UTILIZATION']);

const OPERATIONS_TYPES = new Set<InsightType>([
  'TIGHT_HANDOVER',
  'PICKUP_OVERDUE',
  'RETURN_NEEDS_INSPECTION',
  'STATION_SHORTAGE',
  'SERVICE_WINDOW',
  'SERVICE_BEFORE_BOOKING',
]);

function severityRank(s: ActionQueueSeverity): number {
  if (s === 'critical') return 4;
  if (s === 'warning') return 3;
  if (s === 'attention') return 2;
  return 1;
}

function insightToSeverity(s: InsightSeverity): ActionQueueSeverity {
  if (s === 'CRITICAL') return 'critical';
  if (s === 'WARNING') return 'warning';
  if (s === 'OPPORTUNITY') return 'attention';
  return 'info';
}

function healthToSeverity(s: VehicleHealthAlert['severity']): ActionQueueSeverity {
  if (s === 'critical') return 'critical';
  if (s === 'warning') return 'warning';
  return 'info';
}

function severityToTone(s: ActionQueueSeverity): StatusTone {
  if (s === 'critical') return 'critical';
  if (s === 'warning') return 'watch';
  if (s === 'attention') return 'info';
  return 'neutral';
}

function insightCategory(type: InsightType): ActionQueueCategory {
  if (FINANCIAL_TYPES.has(type)) return 'financial';
  if (VEHICLE_HEALTH_INSIGHT_TYPES.has(type)) return 'health';
  if (OPERATIONS_TYPES.has(type)) return 'operations';
  return 'operations';
}

function parseTimeMs(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

export function formatActionTimeLabel(
  ms: number | null,
  locale: string,
  fallback = '',
): string {
  if (ms == null) return fallback;
  const now = Date.now();
  const diff = ms - now;
  const absMin = Math.round(Math.abs(diff) / 60_000);
  const de = locale === 'de';

  if (Math.abs(diff) < 60_000) return de ? 'jetzt' : 'now';
  if (diff < 0) {
    if (absMin < 60) return de ? `vor ${absMin} Min.` : `${absMin}m ago`;
    const h = Math.floor(absMin / 60);
    return de ? `vor ${h} Std.` : `${h}h ago`;
  }
  if (absMin < 60) return de ? `in ${absMin} Min.` : `in ${absMin}m`;
  const h = Math.floor(absMin / 60);
  if (h < 24) return de ? `in ${h} Std.` : `in ${h}h`;
  return de ? 'heute' : 'today';
}

function computePriority(
  severity: ActionQueueSeverity,
  isOverdue: boolean,
  timeSortMs: number,
): number {
  let score = severityRank(severity) * 1000;
  if (isOverdue) score += 500;
  const now = Date.now();
  const proximity = timeSortMs > 0 ? Math.max(0, 400 - Math.floor(Math.abs(timeSortMs - now) / 60_000)) : 0;
  return score + proximity;
}

function matchesStation(
  stationFilter: string | null,
  fleetById: Map<string, VehicleData>,
  entityIds?: string[] | null,
): boolean {
  if (!stationFilter) return true;
  const ids = entityIds ?? [];
  if (ids.length === 0) return true;
  return ids.some((id) => fleetById.has(id));
}

function insightCta(insight: DashboardInsight, vehicleId?: string): ActionQueueCta {
  if (insight.actionType === 'navigate_station') return 'open-stations';
  if (insight.actionType === 'navigate_booking' || insight.actionType === 'navigate_bookings') {
    return 'open-booking';
  }
  if (vehicleId) return 'open-vehicle';
  if (insight.actionType === 'navigate_bookings') return 'open-rental';
  return 'open-rental';
}

function entityLabelFromInsight(
  insight: DashboardInsight,
  fleetById: Map<string, VehicleData>,
): string | undefined {
  const id = insight.entityIds?.[0];
  if (!id) return undefined;
  const v = fleetById.get(id);
  if (v?.license) return v.license;
  if (v?.model) return v.model;
  return undefined;
}

export interface BuildActionQueueInput {
  locale: string;
  stationFilter: string | null;
  fleetById: Map<string, VehicleData>;
  insights: DashboardInsight[];
  vehicleHealthAlerts: VehicleHealthAlert[];
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  notifications: DashboardNotificationItem[];
  derivedInsights: DerivedOperationalInsight[];
  predictiveInsights: PredictiveOperationsInsight[];
  readyToRentCount: number;
  syncStatusLabel: string;
}

export function buildUnifiedActionQueue(input: BuildActionQueueInput): ActionQueueItem[] {
  const items: ActionQueueItem[] = [];
  const seenBooking = new Set<string>();
  const seenVehicleHealth = new Set<string>();
  const seenDerived = new Set<string>();
  const seenPredictive = new Set<string>();

  for (const alert of input.vehicleHealthAlerts) {
    if (seenVehicleHealth.has(alert.vehicleId)) continue;
    seenVehicleHealth.add(alert.vehicleId);
    const severity = healthToSeverity(alert.severity);
    items.push({
      id: `health-${alert.vehicleId}`,
      source: 'dashboard-insights',
      severity,
      category: 'health',
      title: alert.primaryReason,
      reason:
        alert.secondaryReasons.length > 0
          ? alert.secondaryReasons.slice(0, 2).join(' · ')
          : 'Rental health module reported an issue',
      entityLabel: alert.license || alert.model || undefined,
      timeLabel: undefined,
      timeSortMs: Date.now(),
      priority: computePriority(severity, severity === 'critical', Date.now()),
      tone: severityToTone(severity),
      cta: 'open-vehicle',
      vehicleId: alert.vehicleId,
      isOverdue: severity === 'critical',
    });
  }

  for (const insight of input.insights) {
    if (!matchesStation(input.stationFilter, input.fleetById, insight.entityIds)) continue;
    if (VEHICLE_HEALTH_INSIGHT_TYPES.has(insight.type)) {
      const vid = insight.entityIds?.[0];
      if (vid && seenVehicleHealth.has(vid)) continue;
    }

    const severity = insightToSeverity(insight.severity);
    const vehicleId = insight.entityIds?.[0];
    const bookingId =
      insight.actionType === 'navigate_booking' || insight.type === 'PICKUP_OVERDUE'
        ? insight.entityIds?.[0]
        : undefined;
    const createdMs = parseTimeMs(insight.createdAt) ?? Date.now();
    const isOverdue = insight.type === 'PICKUP_OVERDUE' || severity === 'critical';
    const source: InsightDataSource = FINANCIAL_TYPES.has(insight.type)
      ? 'financial'
      : 'dashboard-insights';

    items.push({
      id: `insight-${insight.id}`,
      source,
      severity,
      category: insightCategory(insight.type),
      title: insight.title,
      reason: insight.message || insight.reasons?.[0] || '',
      entityLabel: entityLabelFromInsight(insight, input.fleetById),
      timeLabel: formatActionTimeLabel(createdMs, input.locale, insight.createdAt ? '' : ''),
      timeSortMs: createdMs,
      priority: computePriority(severity, isOverdue, createdMs) + (insight.priority ?? 0),
      tone: severityToTone(severity),
      cta: insightCta(insight, vehicleId),
      vehicleId,
      bookingId,
      insightId: insight.id,
      insight,
      isOverdue,
    });
  }

  for (const p of input.pickupItems) {
    if (!p.bookingId || p.done) continue;
    if (seenBooking.has(p.bookingId)) continue;
    const startMs = parseTimeMs(p.startDate);
    const isOverdue = !!p.isOverdue;
    const severity: ActionQueueSeverity = isOverdue ? 'critical' : 'attention';
    if (!isOverdue && startMs != null) {
      const until = startMs - Date.now();
      if (until > 60 * 60_000) continue;
    }
    seenBooking.add(p.bookingId);
    items.push({
      id: `pickup-${p.bookingId}`,
      source: 'booking',
      severity,
      category: 'handover',
      title: isOverdue ? `Overdue pickup · ${p.plate || p.vehicle}` : `Pickup · ${p.plate || p.vehicle}`,
      reason: p.customer
        ? `${p.customer}${p.station ? ` · ${p.station}` : ''}`
        : p.station || 'Scheduled pickup today',
      entityLabel: p.plate || p.vehicle,
      timeLabel: isOverdue
        ? input.locale === 'de'
          ? `${p.minutesOverdue ?? 0} Min. überfällig`
          : `${p.minutesOverdue ?? 0}m overdue`
        : formatActionTimeLabel(startMs, input.locale, p.time || ''),
      timeSortMs: startMs ?? Date.now(),
      priority: computePriority(severity, isOverdue, startMs ?? Date.now()) + 50,
      tone: severityToTone(severity),
      cta: 'start-handover-pickup',
      vehicleId: p.vehicleId || undefined,
      bookingId: p.bookingId,
      pickupItem: p,
      isOverdue,
    });
  }

  for (const r of input.returnItems) {
    if (!r.bookingId || r.done) continue;
    if (seenBooking.has(`return-${r.bookingId}`)) continue;
    const endMs = parseTimeMs(r.endDate);
    const isOverdue = !!r.isOverdue;
    const hasError = !!r.hasError;
    let severity: ActionQueueSeverity = 'attention';
    if (isOverdue || hasError) severity = 'critical';
    else if (r.kmExceeded) severity = 'warning';

    if (!isOverdue && !hasError && endMs != null) {
      const until = endMs - Date.now();
      if (until > 60 * 60_000) continue;
    }

    seenBooking.add(`return-${r.bookingId}`);
    items.push({
      id: `return-${r.bookingId}`,
      source: 'booking',
      severity,
      category: 'handover',
      title: isOverdue
        ? `Overdue return · ${r.plate || r.vehicle}`
        : hasError
          ? `Return issue · ${r.plate || r.vehicle}`
          : `Return · ${r.plate || r.vehicle}`,
      reason: r.customer
        ? `${r.customer}${r.station ? ` · ${r.station}` : ''}`
        : r.station || 'Scheduled return today',
      entityLabel: r.plate || r.vehicle,
      timeLabel: formatActionTimeLabel(endMs, input.locale, r.time || ''),
      timeSortMs: endMs ?? Date.now(),
      priority: computePriority(severity, isOverdue, endMs ?? Date.now()) + 40,
      tone: severityToTone(severity),
      cta: 'start-handover-return',
      vehicleId: r.vehicleId || undefined,
      bookingId: r.bookingId,
      returnItem: r,
      isOverdue,
    });
  }

  for (const n of input.notifications) {
    if (!n.unread && n.type !== 'alert') continue;
    const severity: ActionQueueSeverity = n.type === 'alert' ? 'warning' : 'info';
    items.push({
      id: `notif-${n.title}-${n.time}`,
      source: 'booking',
      severity,
      category: 'notification',
      title: n.title,
      reason: n.desc,
      timeLabel: n.time,
      timeSortMs: Date.now(),
      priority: computePriority(severity, false, Date.now()) - 100,
      tone: severityToTone(severity),
      cta: 'open-rental',
      isOverdue: false,
    });
  }

  const existingIds = new Set(items.map((i) => i.id));
  for (const d of input.derivedInsights) {
    if (seenDerived.has(d.id) || existingIds.has(d.id)) continue;
    seenDerived.add(d.id);
    items.push({
      id: d.id,
      source: d.source,
      severity: d.severity,
      category: d.category,
      title: d.title,
      reason: d.reason,
      entityLabel: d.entityLabel,
      timeLabel: d.timeLabel,
      timeSortMs: d.timeSortMs,
      priority: computePriority(d.severity, d.isOverdue, d.timeSortMs) + 20,
      tone: severityToTone(d.severity),
      cta: d.cta,
      vehicleId: d.vehicleId,
      bookingId: d.bookingId,
      isOverdue: d.isOverdue,
    });
  }

  for (const p of input.predictiveInsights) {
    if (seenPredictive.has(p.id) || existingIds.has(p.id)) continue;
    seenPredictive.add(p.id);
    const category: ActionQueueCategory =
      p.type === 'STATION_SHORTAGE_24H'
        ? 'operations'
        : p.type === 'CRITICAL_ALERT_RENTAL_RISK'
          ? 'health'
          : p.type === 'BLOCKED_VEHICLE_FUTURE_BOOKING' ||
              p.type === 'RETURN_OVERDUE_THREATENS_FOLLOWUP'
            ? 'handover'
            : 'operations';

    const reasonParts = [p.explanation, p.sourceData, p.recommendedAction].filter(Boolean);
    items.push({
      id: p.id,
      source: 'predictive-operations',
      severity: p.severity,
      category,
      title: p.title,
      reason: reasonParts.join(' · '),
      entityLabel:
        p.affectedEntity.kind === 'station'
          ? p.affectedEntity.label
          : p.affectedEntity.label,
      timeLabel: p.timeLabel,
      timeSortMs: p.timeSortMs,
      priority: computePriority(p.severity, p.isOverdue, p.timeSortMs) + 15,
      tone: severityToTone(p.severity),
      cta: p.cta,
      vehicleId: p.vehicleId,
      bookingId: p.bookingId,
      predictiveInsight: p,
      isOverdue: p.isOverdue,
    });
  }

  const sorted = items.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.timeSortMs - b.timeSortMs;
  });

  const criticalIds = new Set(
    sorted.filter((i) => i.severity === 'critical' || i.isOverdue).slice(0, 5).map((i) => i.id),
  );
  return sorted.map((i) => ({ ...i, pinned: criticalIds.has(i.id) }));
}

export function filterActionQueue(
  items: ActionQueueItem[],
  tab: ActionQueueFilterTab,
): ActionQueueItem[] {
  if (tab === 'all') return items;
  if (tab === 'critical') {
    return items.filter((i) => i.severity === 'critical' || i.isOverdue);
  }
  if (tab === 'operations') {
    return items.filter((i) => i.category === 'operations' || i.category === 'handover');
  }
  if (tab === 'vehicle') {
    return items.filter((i) => i.category === 'vehicle' || i.category === 'health');
  }
  if (tab === 'financial') return items.filter((i) => i.category === 'financial');
  return items.filter((i) => i.category === 'notification');
}

export function buildActionQueueEmptySummary(input: {
  locale: string;
  readyToRentCount: number;
  upcomingHandovers: number;
  syncStatusLabel: string;
}): ActionQueueEmptySummary {
  const de = input.locale === 'de';
  return {
    readyCount: input.readyToRentCount,
    upcomingHandovers: input.upcomingHandovers,
    syncLabel: input.syncStatusLabel,
    title: de ? 'Keine dringenden Aktionen' : 'No urgent actions',
    subtitle: de ? 'Der Betrieb wirkt stabil.' : 'Operations look stable.',
    readyLabel: de
      ? `${input.readyToRentCount} Fahrzeuge bereit`
      : `${input.readyToRentCount} vehicles ready`,
    handoverLabel: de
      ? `${input.upcomingHandovers} anstehende Übergaben`
      : `${input.upcomingHandovers} upcoming handovers`,
  };
}
