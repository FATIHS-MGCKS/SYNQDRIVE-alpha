import type { VehicleHealthResponse } from '../../../../lib/api';
import type { DashboardInsight } from '../../../DashboardInsightsContext';
import type { VehicleData } from '../../../data/vehicles';
import type { PickupTileItem, ReturnTileItem } from '../../StatInlineDetail';
import {
  canonicalCriticalReasonKey,
  dedupeRuntimeReasons,
  dedupeServiceOverdueCriticalReasons,
  isServiceOverdueReason,
  pickPreferredServiceOverdueReason,
  runtimeReasonDedupeKey,
} from './dashboardRuntimeReasons';
import type {
  DashboardRuntimeModel,
  DashboardSlice,
  DashboardSliceId,
  DashboardSliceRow,
  RuntimeReason,
  RuntimeReasonCategory,
  VehicleRuntimeState,
} from './dashboardRuntimeTypes';
import { buildVehicleRuntimeStates } from './vehicleRuntimeStateBuilder';

const DEFAULT_DUE_SOON_MINUTES = 60;
const MS_MINUTE = 60_000;

export interface BuildDashboardRuntimeModelInput {
  locale: string;
  fleetVehicles: VehicleData[];
  availableVehicles?: VehicleData[];
  reservedVehicles?: VehicleData[];
  activeRentedVehicles?: VehicleData[];
  pickupItems?: PickupTileItem[];
  returnItems?: ReturnTileItem[];
  insights?: DashboardInsight[];
  blockedVehicleIds?: Set<string>;
  healthRiskVehicleIds?: Set<string>;
  healthMap?: Map<string, VehicleHealthResponse>;
  now?: Date;
  dueSoonMinutes?: number;
  telemetrySoftOfflineHours?: number;
  telemetryHardOfflineHours?: number;
  generatedAt?: string;
}

interface BuildDashboardSlicesInput {
  locale: string;
  vehicleStates: VehicleRuntimeState[];
  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  insights: DashboardInsight[];
  now: Date;
  dueSoonMinutes: number;
}

type RuntimeGroupId =
  | 'ready-now'
  | 'available-but-not-ready'
  | 'blocked-excluded'
  | 'on-time'
  | 'return-due-soon'
  | 'return-overdue'
  | 'critical-during-rental'
  | 'pickups-due-soon'
  | 'returns-due-soon'
  | 'pickups-today'
  | 'returns-today'
  | 'overdue-returns'
  | 'overdue-pickups'
  | 'in-maintenance'
  | 'blocked-by-health'
  | 'blocked-by-compliance'
  | 'blocked-by-operations'
  | 'unavailable'
  | 'offline-blocked'
  | 'health-critical'
  | 'service-critical'
  | 'compliance-critical'
  | 'operations-critical'
  | 'telemetry-critical'
  | 'rental-critical';

function isDe(locale: string): boolean {
  return locale === 'de';
}

function label(locale: string, deText: string, enText: string): string {
  return isDe(locale) ? deText : enText;
}

function parseTimeMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isWithinDueSoon(iso: string | undefined, nowMs: number, dueSoonMinutes: number): boolean {
  const ms = parseTimeMs(iso);
  if (ms == null) return false;
  const diff = ms - nowMs;
  return diff >= 0 && diff <= dueSoonMinutes * MS_MINUTE;
}

function byVehicleLabel(a: VehicleRuntimeState, b: VehicleRuntimeState): number {
  return (a.license || a.displayName).localeCompare(b.license || b.displayName);
}

function byRowTitle(a: DashboardSliceRow, b: DashboardSliceRow): number {
  return a.title.localeCompare(b.title);
}

function stableFallbackId(prefix: string, item: { bookingId?: string; vehicleId: string; plate: string }): string {
  return `${prefix}:${item.bookingId || item.vehicleId || item.plate || 'unknown'}`;
}

function primaryReason(reasons: RuntimeReason[]): RuntimeReason | undefined {
  return reasons[0];
}

function vehicleSeverity(state: VehicleRuntimeState): DashboardSliceRow['severity'] {
  if (state.isCritical) return 'critical';
  if (state.isWarning || state.blockLevel === 'soft_blocked') return 'warning';
  if (state.isReadyToRent) return 'success';
  if (state.operationalStatus === 'active_rented' || state.operationalStatus === 'reserved') return 'info';
  return 'neutral';
}

function vehicleSubtitle(state: VehicleRuntimeState): string | undefined {
  const license = (state.license ?? '').trim();
  let remainder = state.displayName.trim();
  if (license) {
    const licensePrefix = new RegExp(`^${license.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(·|-)?\\s*`, 'i');
    remainder = remainder.replace(licensePrefix, '').trim();
  }
  const operationalTerms = new Set([
    'available',
    'reserved',
    'active rented',
    'active_rented',
    'maintenance',
    'unavailable',
    'unknown',
  ]);
  const parts = remainder
    .split('·')
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false;
      const normalized = part.toLowerCase().replace(/_/g, ' ');
      if (operationalTerms.has(normalized)) return false;
      if (state.stationLabel && normalized === state.stationLabel.trim().toLowerCase()) return false;
      return true;
    });
  return parts.join(' · ') || undefined;
}

function vehicleRow(input: {
  state: VehicleRuntimeState;
  slice: string;
  locale: string;
  severity?: DashboardSliceRow['severity'];
  reasons?: RuntimeReason[];
}): DashboardSliceRow {
  const reasons = input.reasons ?? [...input.state.criticalReasons, ...input.state.warningReasons];
  const subtitle = vehicleSubtitle(input.state);
  const primary = primaryReason(reasons);
  return {
    id: `vehicle:${input.state.vehicleId}:${input.slice}`,
    vehicleId: input.state.vehicleId,
    title: input.state.license || input.state.displayName,
    ...(subtitle ? { subtitle } : {}),
    stationLabel: input.state.stationLabel ?? null,
    severity: input.severity ?? vehicleSeverity(input.state),
    ...(reasons.length > 0
      ? { reasons, reasonIds: reasons.map((reason) => reason.id) }
      : primary?.title
        ? { meta: primary.title }
        : {}),
    primaryActionLabel: label(input.locale, 'Fahrzeug öffnen', 'Open vehicle'),
  };
}

function findVehicleState(
  states: VehicleRuntimeState[],
  item: Pick<PickupTileItem | ReturnTileItem, 'vehicleId' | 'plate'>,
): VehicleRuntimeState | undefined {
  return states.find((state) => {
    if (item.vehicleId && item.vehicleId === state.vehicleId) return true;
    return !!item.plate && !!state.license && item.plate === state.license;
  });
}

function formatDurationLabel(minutes: number, overdue: boolean, locale: string): string {
  const de = isDe(locale);
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(de ? `${hours} Std.` : `${hours}h`);
  if (mins > 0 || hours === 0) parts.push(de ? `${mins} Min.` : `${mins}m`);
  const duration = parts.join(' ');
  return overdue
    ? de
      ? `${duration} überfällig`
      : `${duration} overdue`
    : de
      ? `in ${duration}`
      : `in ${duration}`;
}

function minutesUntil(iso: string | undefined, nowMs: number): number | null {
  const ms = parseTimeMs(iso);
  if (ms == null) return null;
  return Math.round((ms - nowMs) / MS_MINUTE);
}

function minutesOverdueFromIso(iso: string | undefined, nowMs: number): number {
  const ms = parseTimeMs(iso);
  if (ms == null) return 0;
  const diff = nowMs - ms;
  return diff > 0 ? Math.round(diff / MS_MINUTE) : 0;
}

function buildOperationTimingLabel(
  item: PickupTileItem | ReturnTileItem,
  scheduledIso: string | undefined,
  nowMs: number,
  locale: string,
): string | undefined {
  if (item.isOverdue) {
    const mins =
      'minutesOverdue' in item && typeof item.minutesOverdue === 'number' && item.minutesOverdue > 0
        ? item.minutesOverdue
        : minutesOverdueFromIso(scheduledIso, nowMs);
    return mins > 0 ? formatDurationLabel(mins, true, locale) : label(locale, 'Überfällig', 'Overdue');
  }
  const until = minutesUntil(scheduledIso, nowMs);
  if (until != null && until > 0) return formatDurationLabel(until, false, locale);
  return undefined;
}

function operationVehicleLine(item: PickupTileItem | ReturnTileItem): string | undefined {
  const parts = [item.plate, item.vehicle].map((value) => value?.trim()).filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function pickupRow(
  item: PickupTileItem,
  state: VehicleRuntimeState | undefined,
  locale: string,
  nowMs: number,
  variant: 'pickup-due-soon' | 'pickup-overdue' = 'pickup-due-soon',
): DashboardSliceRow {
  const timingLabel = buildOperationTimingLabel(item, item.startDate, nowMs, locale);
  const vehicleLine = operationVehicleLine(item);
  return {
    id: `booking:${item.bookingId || stableFallbackId('pickup', item)}:${variant}`,
    ...(item.vehicleId || state?.vehicleId ? { vehicleId: item.vehicleId || state?.vehicleId } : {}),
    ...(item.bookingId ? { bookingId: item.bookingId } : {}),
    title: item.time || label(locale, 'Abholung', 'Pickup'),
    ...(item.customer ? { subtitle: item.customer } : {}),
    ...(vehicleLine ? { meta: vehicleLine } : {}),
    stationLabel: item.station || state?.stationLabel || null,
    severity: variant === 'pickup-overdue' ? 'critical' : 'info',
    ...(timingLabel ? { statusLabel: timingLabel } : {}),
    primaryActionLabel: label(locale, 'Buchung öffnen', 'Open booking'),
  };
}

function returnRow(
  item: ReturnTileItem,
  state: VehicleRuntimeState | undefined,
  locale: string,
  nowMs: number,
  variant: 'return-due-soon' | 'return-overdue',
): DashboardSliceRow {
  const timingLabel = buildOperationTimingLabel(item, item.endDate, nowMs, locale);
  const vehicleLine = operationVehicleLine(item);
  const reasons = variant === 'return-overdue' ? state?.criticalReasons ?? [] : state?.warningReasons ?? [];
  return {
    id: `booking:${item.bookingId || stableFallbackId('return', item)}:${variant}`,
    ...(item.vehicleId || state?.vehicleId ? { vehicleId: item.vehicleId || state?.vehicleId } : {}),
    ...(item.bookingId ? { bookingId: item.bookingId } : {}),
    title: item.time || label(locale, 'Rückgabe', 'Return'),
    ...(item.customer ? { subtitle: item.customer } : {}),
    ...(vehicleLine ? { meta: vehicleLine } : {}),
    stationLabel: item.station || state?.stationLabel || null,
    severity: variant === 'return-overdue' || item.hasError ? 'critical' : 'info',
    ...(timingLabel ? { statusLabel: timingLabel } : {}),
    ...(reasons.length > 0 ? { reasons, reasonIds: reasons.map((reason) => reason.id) } : {}),
    primaryActionLabel: label(locale, 'Buchung öffnen', 'Open booking'),
  };
}

function group(id: RuntimeGroupId, title: string, rows: DashboardSliceRow[]) {
  return {
    id,
    title,
    count: rows.length,
    rows,
  };
}

function kpiCountGroup(id: RuntimeGroupId, title: string, count: number) {
  return {
    id,
    title,
    count,
    rows: [] as DashboardSliceRow[],
  };
}

function dedupeRows(rows: DashboardSliceRow[]): DashboardSliceRow[] {
  const seen = new Set<string>();
  const result: DashboardSliceRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(row);
  }
  return result;
}


function criticalReasonGroup(reason: RuntimeReason): RuntimeGroupId {
  if (
    reason.category === 'health' ||
    reason.category === 'battery' ||
    reason.category === 'tires' ||
    reason.category === 'brakes' ||
    reason.category === 'dtc' ||
    reason.category === 'damage'
  ) {
    return 'health-critical';
  }
  if (reason.category === 'service') return 'service-critical';
  if (reason.category === 'compliance') return 'compliance-critical';
  if (reason.category === 'telemetry') return 'telemetry-critical';
  if (reason.category === 'rental') return 'rental-critical';
  return 'operations-critical';
}

function insightCategory(type: DashboardInsight['type']): RuntimeReasonCategory {
  if (type === 'BATTERY_CRITICAL') return 'battery';
  if (type === 'TIRE_CRITICAL') return 'tires';
  if (type === 'BRAKE_CRITICAL') return 'brakes';
  if (type === 'SERVICE_OVERDUE' || type === 'SERVICE_BEFORE_BOOKING' || type === 'SERVICE_WINDOW') return 'service';
  if (type === 'TUV_OVERDUE' || type === 'BOKRAFT_OVERDUE') return 'compliance';
  if (type === 'PICKUP_OVERDUE' || type === 'RETURN_NEEDS_INSPECTION' || type === 'TIGHT_HANDOVER') return 'operational';
  return 'unknown';
}

function insightVehicleIds(insight: DashboardInsight): string[] {
  const ids = new Set<string>(insight.entityIds ?? []);
  const metrics = insight.metrics;
  if (metrics && typeof metrics === 'object') {
    const metricVehicleId = metrics.vehicleId;
    if (typeof metricVehicleId === 'string') ids.add(metricVehicleId);
    const metricVehicleIds = metrics.vehicleIds;
    if (Array.isArray(metricVehicleIds)) {
      metricVehicleIds.forEach((id) => {
        if (typeof id === 'string') ids.add(id);
      });
    }
  }
  return [...ids];
}

function buildEmptySlice(id: DashboardSliceId, locale: string): DashboardSlice {
  const titles: Record<DashboardSliceId, string> = {
    'ready-to-rent': label(locale, 'Bereit zur Vermietung', 'Ready for Renting'),
    'active-rented': label(locale, 'Heutige Operationen', "Today's Operations"),
    'due-soon': label(locale, 'Bald fällig', 'Due soon'),
    'overdue-returns': label(locale, 'Überfällige Rückgaben', 'Overdue returns'),
    'overdue-pickups': label(locale, 'Überfällige Übergaben', 'Overdue pickups'),
    'blocked-maintenance': label(locale, 'Blockiert & Wartung', 'Blocked & maintenance'),
    'critical-alerts': label(locale, 'Kritische Alerts', 'Critical alerts'),
  };
  return { id, title: titles[id], count: 0, tone: 'neutral', rows: [] };
}

function buildReadyToRentSlice(states: VehicleRuntimeState[], locale: string): DashboardSlice {
  const available = states.filter((state) => state.operationalStatus === 'available').sort(byVehicleLabel);
  const ready = available.filter((state) => state.isReadyToRent);
  const notReady = available.filter((state) => !state.isReadyToRent);
  const blockedExcluded = states
    .filter((state) => state.operationalStatus !== 'available' && state.isBlocked)
    .sort(byVehicleLabel);
  const rows = ready.map((state) =>
    vehicleRow({ state, slice: 'ready', locale, severity: 'success', reasons: state.readyReasons }),
  );
  const secondaryRows = notReady.map((state) =>
    vehicleRow({ state, slice: 'available-not-ready', locale, reasons: state.notReadyReasons }),
  );

  return {
    ...buildEmptySlice('ready-to-rent', locale),
    count: rows.length,
    tone: rows.length > 0 ? 'success' : 'neutral',
    rows,
    secondaryRows,
    hint: label(
      locale,
      `${available.length} verfügbar · ${notReady.length} nicht bereit`,
      `${available.length} available · ${notReady.length} not ready`,
    ),
    groups: [
      group('ready-now', label(locale, 'Bereit', 'Ready'), rows),
      group('available-but-not-ready', label(locale, 'Nicht bereit', 'Not ready'), secondaryRows),
      group(
        'blocked-excluded',
        label(locale, 'Blockiert ausgeschlossen', 'Blocked excluded'),
        blockedExcluded.map((state) => vehicleRow({ state, slice: 'blocked-excluded', locale, reasons: state.blockReasons })),
      ),
    ],
    emptyTitle: label(locale, 'Keine Fahrzeuge bereit', 'No vehicles ready'),
  };
}

function buildActiveRentedSlice(
  states: VehicleRuntimeState[],
  locale: string,
  pickupItems: PickupTileItem[],
  returnItems: ReturnTileItem[],
  now: Date,
): DashboardSlice {
  const nowMs = now.getTime();
  const active = states
    .filter(
      (state) =>
        state.operationalStatus === 'active_rented' ||
        state.bookingState === 'active_rented' ||
        state.bookingState === 'return_due_soon' ||
        state.bookingState === 'return_overdue',
    )
    .sort(byVehicleLabel);
  const rows = active.map((state) => vehicleRow({ state, slice: 'active-rented', locale }));
  const onTimeRows = active
    .filter((state) => state.bookingState === 'active_rented' || state.operationalStatus === 'active_rented')
    .filter((state) => state.bookingState !== 'return_due_soon' && state.bookingState !== 'return_overdue')
    .map((state) => vehicleRow({ state, slice: 'active-on-time', locale, severity: state.isCritical ? 'critical' : 'info' }));
  const dueSoonRows = active
    .filter((state) => state.bookingState === 'return_due_soon')
    .map((state) => vehicleRow({ state, slice: 'active-return-due-soon', locale, severity: 'warning' }));
  const overdueRows = active
    .filter((state) => state.bookingState === 'return_overdue')
    .map((state) => vehicleRow({ state, slice: 'active-return-overdue', locale, severity: 'critical' }));
  const criticalRows = active
    .filter((state) => state.isCritical)
    .map((state) => vehicleRow({ state, slice: 'active-critical', locale, severity: 'critical', reasons: state.criticalReasons }));

  const pickupsTodayRows = dedupeRows(
    pickupItems
      .filter((item) => !item.done)
      .map((item) =>
        pickupRow(
          item,
          findVehicleState(states, item),
          locale,
          nowMs,
          item.isOverdue ? 'pickup-overdue' : 'pickup-due-soon',
        ),
      ),
  );
  const returnsTodayRows = dedupeRows(
    returnItems
      .filter((item) => !item.done)
      .map((item) =>
        returnRow(
          item,
          findVehicleState(states, item),
          locale,
          nowMs,
          item.isOverdue ? 'return-overdue' : 'return-due-soon',
        ),
      ),
  );

  return {
    ...buildEmptySlice('active-rented', locale),
    count: rows.length,
    tone: rows.length > 0 ? 'info' : 'neutral',
    rows,
    groups: [
      group('pickups-today', label(locale, 'Übergaben', 'Pickups'), pickupsTodayRows),
      group('returns-today', label(locale, 'Rückgaben', 'Returns'), returnsTodayRows),
      group('on-time', label(locale, 'Planmäßig', 'On time'), onTimeRows),
      group('return-due-soon', label(locale, 'Rückgabe bald fällig', 'Return due soon'), dueSoonRows),
      group('return-overdue', label(locale, 'Rückgabe überfällig', 'Return overdue'), overdueRows),
      group('critical-during-rental', label(locale, 'Kritisch während Vermietung', 'Critical during rental'), criticalRows),
    ],
    emptyTitle: label(locale, 'Keine Operationen heute', 'No operations today'),
    emptyDescription: label(
      locale,
      'Keine Übergaben, Rückgaben oder aktiven Vermietungen in diesem Bereich.',
      'No pickups, returns, or active rentals in this scope.',
    ),
  };
}

function buildDueSoonSlice(input: BuildDashboardSlicesInput): DashboardSlice {
  const nowMs = input.now.getTime();
  const pickupRows = input.pickupItems
    .filter((item) => !item.done && !item.isOverdue && isWithinDueSoon(item.startDate, nowMs, input.dueSoonMinutes))
    .map((item) => pickupRow(item, findVehicleState(input.vehicleStates, item), input.locale, nowMs));
  const returnRows = input.returnItems
    .filter((item) => !item.done && item.isOverdue !== true && isWithinDueSoon(item.endDate, nowMs, input.dueSoonMinutes))
    .map((item) => returnRow(item, findVehicleState(input.vehicleStates, item), input.locale, nowMs, 'return-due-soon'));
  const rows = dedupeRows([...pickupRows, ...returnRows]);

  return {
    ...buildEmptySlice('due-soon', input.locale),
    count: rows.length,
    tone: rows.length > 0 ? 'watch' : 'neutral',
    rows,
    groups: [
      group('pickups-due-soon', label(input.locale, 'Übergaben bald fällig', 'Pickups due soon'), dedupeRows(pickupRows)),
      group('returns-due-soon', label(input.locale, 'Rückgaben bald fällig', 'Returns due soon'), dedupeRows(returnRows)),
    ],
  };
}

function buildOverduePickupsSlice(input: BuildDashboardSlicesInput): DashboardSlice {
  const nowMs = input.now.getTime();
  const rows = dedupeRows(
    input.pickupItems
      .filter((item) => item.isOverdue === true && !item.done)
      .map((item) =>
        pickupRow(item, findVehicleState(input.vehicleStates, item), input.locale, nowMs, 'pickup-overdue'),
      ),
  );

  return {
    ...buildEmptySlice('overdue-pickups', input.locale),
    count: rows.length,
    tone: rows.length > 0 ? 'critical' : 'success',
    rows,
    groups: [group('overdue-pickups', label(input.locale, 'Überfällige Übergaben', 'Overdue pickups'), rows)],
    emptyTitle: label(input.locale, 'Keine überfälligen Übergaben', 'No overdue pickups'),
  };
}

function buildOverdueReturnsSlice(input: BuildDashboardSlicesInput): DashboardSlice {
  const nowMs = input.now.getTime();
  const rows = dedupeRows(
    input.returnItems
      .filter((item) => item.isOverdue === true && !item.done)
      .map((item) => returnRow(item, findVehicleState(input.vehicleStates, item), input.locale, nowMs, 'return-overdue')),
  );

  return {
    ...buildEmptySlice('overdue-returns', input.locale),
    count: rows.length,
    tone: rows.length > 0 ? 'critical' : 'success',
    rows,
    groups: [group('overdue-returns', label(input.locale, 'Überfällige Rückgaben', 'Overdue returns'), rows)],
    emptyTitle: label(input.locale, 'Keine überfälligen Rückgaben', 'No overdue returns'),
  };
}

function reasonHasCategory(state: VehicleRuntimeState, categories: RuntimeReasonCategory[]): boolean {
  return state.blockReasons.some((reason) => categories.includes(reason.category));
}

function hasBlockingReason(state: VehicleRuntimeState): boolean {
  return state.blockReasons.some((reason) => reason.blocking === true);
}

function buildBlockedMaintenanceSlice(states: VehicleRuntimeState[], locale: string): DashboardSlice {
  // Blocked & Maintenance counts only genuine blockers: maintenance, unavailable
  // and vehicles with a hard blocking reason. Cleaning-not-clean, warnings,
  // soft-offline, standby and available-but-not-ready are explicitly excluded.
  const blocked = states
    .filter(
      (state) =>
        state.isMaintenance ||
        state.operationalStatus === 'unavailable' ||
        hasBlockingReason(state),
    )
    .sort(byVehicleLabel);
  const rows = blocked.map((state) =>
    vehicleRow({ state, slice: 'blocked-maintenance', locale, severity: vehicleSeverity(state), reasons: state.blockReasons }),
  );
  const maintenanceRows = blocked
    .filter((state) => state.isMaintenance)
    .map((state) => vehicleRow({ state, slice: 'maintenance', locale, reasons: state.blockReasons }));
  const healthRows = blocked
    .filter((state) => reasonHasCategory(state, ['health', 'battery', 'tires', 'brakes', 'dtc', 'damage']))
    .map((state) => vehicleRow({ state, slice: 'blocked-health', locale, reasons: state.blockReasons }));
  const complianceRows = blocked
    .filter((state) => reasonHasCategory(state, ['compliance']))
    .map((state) => vehicleRow({ state, slice: 'blocked-compliance', locale, reasons: state.blockReasons }));
  const operationsRows = blocked
    .filter((state) => reasonHasCategory(state, ['operational', 'handover']))
    .map((state) => vehicleRow({ state, slice: 'blocked-operations', locale, reasons: state.blockReasons }));
  const unavailableRows = blocked
    .filter((state) => state.operationalStatus === 'unavailable')
    .map((state) => vehicleRow({ state, slice: 'unavailable', locale, reasons: state.blockReasons }));
  const offlineRows = blocked
    .filter((state) => state.telemetryState === 'offline' && reasonHasCategory(state, ['telemetry']))
    .map((state) => vehicleRow({ state, slice: 'offline-blocked', locale, severity: 'critical', reasons: state.blockReasons }));

  return {
    ...buildEmptySlice('blocked-maintenance', locale),
    count: rows.length,
    tone: rows.length > 0 ? 'watch' : 'neutral',
    rows,
    groups: [
      group('in-maintenance', label(locale, 'In Wartung', 'In maintenance'), maintenanceRows),
      group('blocked-by-health', label(locale, 'Durch Health blockiert', 'Blocked by health'), healthRows),
      group('blocked-by-compliance', label(locale, 'Durch Compliance blockiert', 'Blocked by compliance'), complianceRows),
      group('blocked-by-operations', label(locale, 'Operativ blockiert', 'Blocked by operations'), operationsRows),
      group('unavailable', label(locale, 'Nicht verfügbar', 'Unavailable'), unavailableRows),
      group('offline-blocked', label(locale, 'Offline blockiert', 'Offline blocked'), offlineRows),
    ],
  };
}

function insightDuplicatesRuntimeCritical(
  state: VehicleRuntimeState | undefined,
  insightType: DashboardInsight['type'],
): boolean {
  if (!state) return false;
  const category = insightCategory(insightType);
  return state.criticalReasons.some((reason) => {
    if (reason.category === category) return true;
    if (category === 'service' && reason.source?.includes('service_compliance')) return true;
    if (category === 'compliance' && reason.source?.includes('compliance')) return true;
    return false;
  });
}

function insightBlockingInDrawer(category: RuntimeReasonCategory): boolean {
  // Drawer metadata: only TÜV/BOKraft-style compliance blockers are hard blockers.
  return category === 'compliance';
}

function buildCriticalAlertsSlice(input: BuildDashboardSlicesInput): DashboardSlice {
  const byVehicle = new Map(input.vehicleStates.map((state) => [state.vehicleId, state]));
  const grouped: Record<RuntimeGroupId, DashboardSliceRow[]> = {
    'ready-now': [],
    'available-but-not-ready': [],
    'blocked-excluded': [],
    'on-time': [],
    'return-due-soon': [],
    'return-overdue': [],
    'critical-during-rental': [],
    'pickups-due-soon': [],
    'returns-due-soon': [],
    'pickups-today': [],
    'returns-today': [],
    'overdue-returns': [],
    'overdue-pickups': [],
    'in-maintenance': [],
    'blocked-by-health': [],
    'blocked-by-compliance': [],
    'blocked-by-operations': [],
    unavailable: [],
    'offline-blocked': [],
    'health-critical': [],
    'service-critical': [],
    'compliance-critical': [],
    'operations-critical': [],
    'telemetry-critical': [],
    'rental-critical': [],
  };

  const pendingByGroup = new Map<RuntimeGroupId, Map<string, RuntimeReason[]>>();

  const queueCritical = (vehicleId: string, reason: RuntimeReason): void => {
    const groupId = criticalReasonGroup(reason);
    const groupMap = pendingByGroup.get(groupId) ?? new Map<string, RuntimeReason[]>();
    const list = groupMap.get(vehicleId) ?? [];
    const key = canonicalCriticalReasonKey(vehicleId, reason);
    const existingIndex = list.findIndex(
      (entry) => canonicalCriticalReasonKey(vehicleId, entry) === key,
    );
    if (existingIndex >= 0) {
      if (isServiceOverdueReason(reason) && isServiceOverdueReason(list[existingIndex])) {
        list[existingIndex] = pickPreferredServiceOverdueReason([list[existingIndex], reason]);
      }
      return;
    }
    list.push(reason);
    groupMap.set(vehicleId, list);
    pendingByGroup.set(groupId, groupMap);
  };

  const fallbackState = (vehicleId: string, reasons: RuntimeReason[]): VehicleRuntimeState => ({
    vehicleId,
    displayName: vehicleId,
    operationalStatus: 'unknown',
    rentalReadiness: 'not_ready',
    blockLevel: 'none',
    healthSeverity: 'unknown',
    complianceSeverity: 'unknown',
    telemetryState: 'unknown',
    dataQualityState: 'unknown',
    bookingState: 'unknown',
    readyReasons: [],
    notReadyReasons: [],
    blockReasons: [],
    warningReasons: [],
    criticalReasons: reasons,
    isAvailable: false,
    isReadyToRent: false,
    isBlocked: false,
    isMaintenance: false,
    isCritical: true,
    isWarning: false,
  } satisfies VehicleRuntimeState);

  for (const state of input.vehicleStates) {
    for (const reason of state.criticalReasons) {
      queueCritical(state.vehicleId, reason);
    }
  }

  for (const insight of input.insights) {
    if (insight.severity !== 'CRITICAL') continue;
    const category = insightCategory(insight.type);
    const vehicleIds = insightVehicleIds(insight);
    for (const vehicleId of vehicleIds) {
      const state = byVehicle.get(vehicleId);
      if (insightDuplicatesRuntimeCritical(state, insight.type)) continue;
      queueCritical(
        vehicleId,
        {
          id: `dashboard-insight:${insight.type}:${insight.id}`,
          category,
          severity: 'critical',
          title: insight.title,
          description: insight.message,
          source: `dashboard-insight:${insight.type}`,
          blocking: insightBlockingInDrawer(category),
          actionLabel: insight.actionLabel ?? undefined,
          actionTarget: insight.actionType ?? undefined,
        },
      );
    }
  }

  const criticalGroupIds: RuntimeGroupId[] = [
    'health-critical',
    'service-critical',
    'compliance-critical',
    'operations-critical',
    'telemetry-critical',
    'rental-critical',
  ];

  for (const groupId of criticalGroupIds) {
    const groupMap = pendingByGroup.get(groupId);
    if (!groupMap) continue;
    for (const [vehicleId, reasons] of groupMap) {
      const mergedReasons = dedupeServiceOverdueCriticalReasons(dedupeRuntimeReasons(reasons));
      const state = byVehicle.get(vehicleId) ?? fallbackState(vehicleId, mergedReasons);
      grouped[groupId].push(
        vehicleRow({
          state,
          slice: `critical-${groupId}`,
          locale: input.locale,
          severity: 'critical',
          reasons: mergedReasons,
        }),
      );
    }
    grouped[groupId].sort(byRowTitle);
  }

  const rows = dedupeRows(
    [
      ...grouped['health-critical'],
      ...grouped['service-critical'],
      ...grouped['compliance-critical'],
      ...grouped['operations-critical'],
      ...grouped['telemetry-critical'],
      ...grouped['rental-critical'],
    ].sort(byRowTitle),
  );

  return {
    ...buildEmptySlice('critical-alerts', input.locale),
    count: rows.length,
    tone: rows.length > 0 ? 'critical' : 'success',
    rows,
    groups: [
      group('health-critical', label(input.locale, 'Health kritisch', 'Health critical'), grouped['health-critical']),
      group('service-critical', label(input.locale, 'Service kritisch', 'Service critical'), grouped['service-critical']),
      group('compliance-critical', label(input.locale, 'Compliance kritisch', 'Compliance critical'), grouped['compliance-critical']),
      group('operations-critical', label(input.locale, 'Operations kritisch', 'Operations critical'), grouped['operations-critical']),
      group('telemetry-critical', label(input.locale, 'Telemetry kritisch', 'Telemetry critical'), grouped['telemetry-critical']),
      group('rental-critical', label(input.locale, 'Rental kritisch', 'Rental critical'), grouped['rental-critical']),
    ],
    emptyTitle: label(input.locale, 'Keine kritischen Alerts', 'No critical alerts'),
  };
}

function buildDashboardSlices(input: BuildDashboardSlicesInput): Record<DashboardSliceId, DashboardSlice> {
  return {
    'ready-to-rent': buildReadyToRentSlice(input.vehicleStates, input.locale),
    'active-rented': buildActiveRentedSlice(
      input.vehicleStates,
      input.locale,
      input.pickupItems,
      input.returnItems,
      input.now,
    ),
    'due-soon': buildDueSoonSlice(input),
    'overdue-returns': buildOverdueReturnsSlice(input),
    'overdue-pickups': buildOverduePickupsSlice(input),
    'blocked-maintenance': buildBlockedMaintenanceSlice(input.vehicleStates, input.locale),
    'critical-alerts': buildCriticalAlertsSlice(input),
  };
}

export function buildDashboardRuntimeModel(input: BuildDashboardRuntimeModelInput): DashboardRuntimeModel {
  const now = input.now ?? new Date();
  const dueSoonMinutes = input.dueSoonMinutes ?? DEFAULT_DUE_SOON_MINUTES;
  const pickupItems = input.pickupItems ?? [];
  const returnItems = input.returnItems ?? [];
  const insights = input.insights ?? [];
  const vehicleStates = buildVehicleRuntimeStates({
    fleetVehicles: input.fleetVehicles,
    availableVehicles: input.availableVehicles,
    reservedVehicles: input.reservedVehicles,
    activeRentedVehicles: input.activeRentedVehicles,
    pickupItems,
    returnItems,
    insights,
    blockedVehicleIds: input.blockedVehicleIds,
    healthRiskVehicleIds: input.healthRiskVehicleIds,
    healthMap: input.healthMap,
    now,
    locale: input.locale,
    dueSoonMinutes,
    telemetrySoftOfflineHours: input.telemetrySoftOfflineHours,
    telemetryHardOfflineHours: input.telemetryHardOfflineHours,
  });

  return {
    generatedAt: input.generatedAt ?? now.toISOString(),
    vehicleStates,
    slices: buildDashboardSlices({
      locale: input.locale,
      vehicleStates,
      pickupItems,
      returnItems,
      insights,
      now,
      dueSoonMinutes,
    }),
  };
}
