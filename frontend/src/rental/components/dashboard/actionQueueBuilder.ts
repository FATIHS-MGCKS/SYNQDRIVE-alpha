import type {
  DashboardInsight,
  InsightSeverity,
  InsightType,
  VehicleHealthAlert,
} from '../../DashboardInsightsContext';
import type { VehicleData } from '../../data/vehicles';
import {
  createBookingIssueKey,
  formatVehicleIssueEntityLabel,
  normalizeOperationalIssues,
  sanitizeUserFacingIssueText,
  type OperationalIssue,
  type OperationalIssueDomain,
  type OperationalIssueSeverity,
} from '../../lib/operational-issues';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type { DashboardNotificationItem } from '../BusinessInsightsBox';
import type {
  ActionQueueCategory,
  ActionQueueChildSeverity,
  ActionQueueCta,
  ActionQueueEmptySummary,
  ActionQueueFilterTab,
  ActionQueueItem,
  ActionQueueModuleTarget,
  ActionQueueSeverity,
  InsightDataSource,
} from './dashboardTypes';
import type { DerivedOperationalInsight } from './deriveOperationalInsights';
import type { PredictiveOperationsInsight } from './derivePredictiveOperationsInsights';
import type { StatusTone } from '../../../components/patterns';
import type { DashboardRuntimeModel } from './runtime';

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

const NORMALIZED_INSIGHT_TYPES = new Set<string>([
  'SERVICE_OVERDUE',
  'SERVICE_WINDOW',
  'BATTERY_CRITICAL',
  'TIRE_CRITICAL',
  'BRAKE_CRITICAL',
  'PICKUP_OVERDUE',
  'RETURN_OVERDUE',
  'RETURN_NEEDS_INSPECTION',
]);

const NORMALIZED_PREDICTIVE_TYPES = new Set<string>([
  'SERVICE_WINDOW',
  'SOFT_OFFLINE_TELEMETRY_CHECK',
  'RETURN_OVERDUE_THREATENS_FOLLOWUP',
  'STATION_SHORTAGE_24H',
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

function severityToTone(s: ActionQueueSeverity): StatusTone {
  if (s === 'critical') return 'critical';
  if (s === 'warning') return 'watch';
  if (s === 'attention') return 'info';
  return 'neutral';
}

function healthModuleLabel(moduleKey: string, fallback: string, de: boolean): string {
  if (!de) return fallback;
  switch (moduleKey) {
    case 'battery':
      return 'Batterie';
    case 'tires':
      return 'Reifen';
    case 'brakes':
      return 'Bremsen';
    case 'service_compliance':
      return 'Service & Inspektion';
    case 'error_codes':
      return 'Fehlercodes';
    case 'complaints':
      return 'Beschwerden';
    case 'vehicle_alerts':
      return 'OEM-Warnleuchten';
    default:
      return fallback;
  }
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
  if (v) return formatVehicleIssueEntityLabel(v);
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
  dashboardRuntime?: DashboardRuntimeModel;
  readyToRentCount: number;
  syncStatusLabel: string;
}

function issueSeverityToActionSeverity(severity: OperationalIssueSeverity): ActionQueueSeverity {
  return severity;
}

function issueCategory(domain: OperationalIssueDomain, issueType: string): ActionQueueCategory {
  if (domain === 'finance') return 'financial';
  if (domain === 'notification') return 'notification';
  if (domain === 'booking' || domain === 'return' || domain === 'handover') return 'handover';
  if (domain === 'station_operations') return 'operations';
  if (domain === 'task') return 'task';
  if (domain === 'vehicle_health' || domain === 'service_compliance' || domain === 'rental_readiness') return 'health';
  if (domain === 'telemetry') return issueType === 'telemetry_offline' ? 'operations' : 'vehicle';
  return 'operations';
}

function issueSource(sourceType: OperationalIssue['primarySource']['sourceType']): InsightDataSource {
  if (sourceType === 'dashboard_insight') return 'dashboard-insights';
  if (sourceType === 'predictive_insight') return 'predictive-operations';
  if (sourceType === 'finance') return 'financial';
  if (sourceType === 'booking') return 'booking';
  return 'derived-operations';
}

function issueCta(issue: OperationalIssue): ActionQueueCta {
  if (issue.cta?.target === 'open-stations' || issue.domain === 'station_operations') return 'open-stations';
  if (issue.bookingId || issue.domain === 'booking' || issue.domain === 'return' || issue.domain === 'handover') return 'open-booking';
  if (issue.vehicleId || issue.domain === 'vehicle_health' || issue.domain === 'service_compliance' || issue.domain === 'telemetry') {
    return 'open-vehicle';
  }
  return 'open-rental';
}

function issueGroupType(issue: OperationalIssue): ActionQueueItem['groupType'] {
  if (issue.domain === 'vehicle_health' || issue.domain === 'service_compliance') return 'vehicle-health';
  if (issue.domain === 'rental_readiness' || issue.domain === 'telemetry') return 'vehicle-ops';
  if (issue.domain === 'booking' || issue.domain === 'return' || issue.domain === 'handover') return 'booking';
  if (issue.domain === 'finance') return 'finance';
  if (issue.domain === 'station_operations') return 'station-ops';
  if (issue.domain === 'notification') return 'notification-thread';
  return undefined;
}

function issueGroupKey(issue: OperationalIssue): string | undefined {
  if (issue.domain === 'vehicle_health' && issue.vehicleId) return `vehicle-health:${issue.vehicleId}`;
  if (issue.domain === 'service_compliance' && issue.vehicleId) return issue.semanticKey;
  if ((issue.domain === 'rental_readiness' || issue.domain === 'telemetry') && issue.vehicleId) return issue.semanticKey;
  if ((issue.domain === 'booking' || issue.domain === 'return' || issue.domain === 'handover') && issue.bookingId) {
    return issue.semanticKey;
  }
  if (issue.domain === 'finance' && issue.invoiceId) return issue.semanticKey;
  if (issue.domain === 'station_operations' && issue.stationId) return issue.semanticKey;
  return issue.semanticKey;
}

function issueModule(issue: OperationalIssue): ActionQueueModuleTarget | undefined {
  switch (issue.issueType) {
    case 'battery_warning':
    case 'battery_critical':
      return 'battery';
    case 'tire_monitor':
    case 'tire_critical':
      return 'tires';
    case 'brake_warning':
    case 'brake_critical':
    case 'brake_no_data':
      return 'brakes';
    case 'service_overdue':
    case 'service_due_soon':
    case 'service_window_available':
      return 'service_compliance';
    case 'error_codes_active':
      return 'error_codes';
    case 'warning_light_active':
      return 'vehicle_alerts';
    default:
      return issue.domain === 'vehicle_health' ? 'overview' : undefined;
  }
}

function issueModuleLabel(issue: OperationalIssue, de: boolean): string | undefined {
  const module = issueModule(issue);
  if (!module) return undefined;
  return healthModuleLabel(module, module, de);
}

function issueChildSeverity(issue: OperationalIssue, severity: ActionQueueSeverity): ActionQueueChildSeverity | undefined {
  if (issue.issueType === 'service_overdue') return 'overdue';
  return severity;
}

function issueReason(issue: OperationalIssue): string {
  if (issue.subtitle) return sanitizeUserFacingIssueText(issue.subtitle);
  const evidence = issue.evidence?.find((item) => item.value && item.label !== 'Quelle' && item.source !== 'debug');
  if (!evidence) return '';
  return sanitizeUserFacingIssueText([evidence.label, evidence.value].filter(Boolean).join(': '));
}

export function mapOperationalIssueToActionQueueItem(
  issue: OperationalIssue,
  input: Pick<BuildActionQueueInput, 'locale'>,
): ActionQueueItem {
  const severity = issueSeverityToActionSeverity(issue.severity);
  const now = Date.now();
  const isOverdue =
    issue.issueType.includes('overdue') ||
    issue.severity === 'critical';
  return {
    id: `issue-${issue.semanticKey}`,
    semanticKey: issue.semanticKey,
    source: issueSource(issue.primarySource.sourceType),
    severity,
    category: issueCategory(issue.domain, issue.issueType),
    title: sanitizeUserFacingIssueText(issue.title),
    reason: issueReason(issue),
    entityLabel: issue.entityLabel,
    timeSortMs: now,
    priority: computePriority(severity, isOverdue, now) + 80,
    tone: severityToTone(severity),
    cta: issueCta(issue),
    ctaLabel: issue.cta?.label,
    vehicleId: issue.vehicleId,
    bookingId: issue.bookingId,
    isOverdue,
    groupKey: issueGroupKey(issue),
    groupType: issueGroupType(issue),
    module: issueModule(issue),
    moduleLabel: issueModuleLabel(issue, input.locale === 'de'),
    childSeverity: issueChildSeverity(issue, severity),
    detail: issueReason(issue) || undefined,
    stationId: issue.stationId,
    customerId: issue.customerId,
  };
}

export function buildUnifiedActionQueue(input: BuildActionQueueInput): ActionQueueItem[] {
  const normalizedIssues = normalizeOperationalIssues({
    vehicleRuntimeStates: input.dashboardRuntime?.vehicleStates,
    vehicleHealthAlerts: input.vehicleHealthAlerts,
    dashboardInsights: input.insights,
    predictiveInsights: input.predictiveInsights,
    vehiclesById: input.fleetById,
  }).filter((issue) => issue.visibility.dashboardAttention);

  const items: ActionQueueItem[] = normalizedIssues.map((issue) =>
    mapOperationalIssueToActionQueueItem(issue, input),
  );
  const normalizedIssueKeys = new Set(normalizedIssues.map((issue) => issue.semanticKey));
  const seenBooking = new Set<string>();
  const seenDerived = new Set<string>();
  const seenPredictive = new Set<string>();

  const de = input.locale === 'de';

  for (const insight of input.insights) {
    if (NORMALIZED_INSIGHT_TYPES.has(insight.type)) continue;
    if (!matchesStation(input.stationFilter, input.fleetById, insight.entityIds)) continue;

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

    const insightCat = insightCategory(insight.type);
    let insightGroupKey: string | undefined;
    let insightGroupType: ActionQueueItem['groupType'];
    if (insightCat === 'health' && vehicleId) {
      insightGroupKey = `vehicle-health:${vehicleId}`;
      insightGroupType = 'vehicle-health';
    } else if (bookingId) {
      insightGroupKey = `booking:${bookingId}`;
      insightGroupType = 'booking';
    } else if (vehicleId) {
      insightGroupKey = `vehicle-ops:${vehicleId}`;
      insightGroupType = 'vehicle-ops';
    } else if (FINANCIAL_TYPES.has(insight.type)) {
      insightGroupKey = `finance:${insight.id}`;
      insightGroupType = 'finance';
    }

    items.push({
      id: `insight-${insight.id}`,
      source,
      severity,
      category: insightCat,
      title: sanitizeUserFacingIssueText(insight.title),
      reason: sanitizeUserFacingIssueText(insight.message || insight.reasons?.[0] || ''),
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
      groupKey: insightGroupKey,
      groupType: insightGroupType,
      module: insightCat === 'health' && vehicleId ? 'overview' : undefined,
    });
  }

  for (const p of input.pickupItems) {
    if (!p.bookingId || p.done) continue;
    if (p.isOverdue && normalizedIssueKeys.has(createBookingIssueKey(p.bookingId, 'booking', 'pickup_overdue'))) continue;
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
      title: isOverdue
        ? de
          ? `Abholung überfällig · ${p.plate || p.vehicle}`
          : `Overdue pickup · ${p.plate || p.vehicle}`
        : de
          ? `Abholung · ${p.plate || p.vehicle}`
          : `Pickup · ${p.plate || p.vehicle}`,
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
      groupKey: `booking:${p.bookingId}`,
      groupType: 'booking',
    });
  }

  for (const r of input.returnItems) {
    if (!r.bookingId || r.done) continue;
    if (r.isOverdue && normalizedIssueKeys.has(createBookingIssueKey(r.bookingId, 'return', 'overdue'))) continue;
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
        ? de
          ? `Rückgabe überfällig · ${r.plate || r.vehicle}`
          : `Overdue return · ${r.plate || r.vehicle}`
        : hasError
          ? de
            ? `Rückgabe prüfen · ${r.plate || r.vehicle}`
            : `Return issue · ${r.plate || r.vehicle}`
          : de
            ? `Rückgabe · ${r.plate || r.vehicle}`
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
      groupKey: `booking:${r.bookingId}`,
      groupType: 'booking',
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
      title: sanitizeUserFacingIssueText(n.title),
      reason: sanitizeUserFacingIssueText(n.desc),
      timeLabel: n.time,
      timeSortMs: Date.now(),
      priority: computePriority(severity, false, Date.now()) - 100,
      tone: severityToTone(severity),
      cta: 'open-rental',
      isOverdue: false,
      groupKey: `notification-thread:${n.title}`,
      groupType: 'notification-thread',
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
      title: sanitizeUserFacingIssueText(d.title),
      reason: sanitizeUserFacingIssueText(d.reason),
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
    if (NORMALIZED_PREDICTIVE_TYPES.has(p.type)) continue;
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

    const reasonParts = [p.explanation, p.recommendedAction].filter(Boolean);
    items.push({
      id: p.id,
      source: 'predictive-operations',
      severity: p.severity,
      category,
      title: sanitizeUserFacingIssueText(p.title),
      reason: sanitizeUserFacingIssueText(reasonParts.join(' · ')),
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
