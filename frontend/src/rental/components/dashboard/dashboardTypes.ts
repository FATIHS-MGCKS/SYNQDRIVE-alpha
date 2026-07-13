import type { RefObject } from 'react';
import type { TranslationKey } from '../../i18n/translations/en';
import type { Locale } from '../../i18n/LanguageContext';
import type { Station } from '../../../lib/api';
import type { VehicleData } from '../../data/vehicles';
import type { VehicleHealthResponse } from '../../../lib/api';
import type { DashboardInsight } from '../../DashboardInsightsContext';
import type { PickupTileItem, ReturnTileItem } from '../StatInlineDetail';
import type { PredictiveOperationsInsight } from './derivePredictiveOperationsInsights';
import type { DashboardNotificationItem } from './dashboardNotificationTypes';
import type { NotificationQueueModel } from './notificationQueueModel';
import type { FleetStatusTabKey } from '../../lib/vehicle-status';
import type { StatusTone } from '../../../components/patterns';
import type { DashboardDrilldownTarget, TodaysOperationsDrilldownGroupId } from './dashboardDrilldownTypes';
import type { DataTrustLayer, DashboardTrustHint } from './dataTrustBuilder';
import type {
  BusinessMetricId,
  BusinessPulseSlice,
  DashboardRuntimeModel,
  DashboardSlice,
  DashboardSliceId,
  VehicleRuntimeState,
} from './runtime';

export const STATION_FILTER_STORAGE_KEY = 'synqdrive.dashboard.selectedStationId';
export const OPERATOR_FOCUS_MODE_STORAGE_KEY = 'synqdrive.dashboard.operatorFocusMode';

export type TodayTabKey = 'Pick Up Today' | 'Return Today';

export type KpiTone = 'success' | 'critical' | 'brand' | 'info' | 'watch';

/**
 * Data-sync state. NOTE: `stale` here refers only to backend data-sync
 * freshness, never to per-vehicle telemetry connectivity (use the runtime
 * `TelemetryConnectionState` soft_offline/offline for that).
 */
export type DataSyncStatus = 'live' | 'partial' | 'stale' | 'offline';

export type DashboardTimeframe = 'today' | 'next24h';

/**
 * @deprecated Legacy KPI target ids. Prefer `DashboardSliceId` (`blocked-maintenance`, not `maintenance`).
 */
export type OperationalKpiTarget =
  | 'ready-to-rent'
  | 'active-rented'
  | 'due-soon'
  | 'overdue-returns'
  | 'maintenance'
  | 'critical-alerts';

export interface ControlCenterStatus {
  stationLabel: string;
  vehicleCount: number;
  importantEventCount: number;
  lastSyncLabel: string;
  syncStatus: DataSyncStatus;
}

/**
 * @deprecated Legacy KPI view model retained for trust-hint helpers only.
 * `ControlKpiStrip` renders directly from `dashboardRuntime.slices`.
 */
export interface ControlCenterKpi {
  id: DashboardSliceId;
  label: string;
  displayValue: string;
  numericValue: number | null;
  tone: StatusTone;
  hint?: string;
  zeroIsPositive?: boolean;
  trustHint?: DashboardTrustHint;
}

/**
 * @deprecated Legacy finance KPI cards — active dashboard uses `BusinessPulseSlice` from runtime.
 */
export interface FinanceKpi {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone: KpiTone;
  trend?: {
    label: string;
    direction: 'up' | 'down';
    invert?: boolean;
  };
}

export interface DashboardViewProps {
  onVehicleSelect?: (vehicle: VehicleData) => void;
  onItemHover?: (vehicleName: string | null) => void;
  onOpenVehicleById?: (vehicleId: string) => void;
  onOpenRentalView?: (view: 'bookings' | 'stations') => void;
  onOpenBookingById?: (bookingId: string) => void;
  onOpenCustomerById?: (customerId: string) => void;
  onOpenFinanceView?: (view: 'financial-insights' | 'invoices') => void;
  onOpenPriceTariffs?: () => void;
}

export interface DashboardInvoice {
  id: string;
  type: string;
  status?: string;
  totalCents: number | null;
  paidCents?: number | null;
  outstandingCents?: number | null;
  currency?: string | null;
  invoiceDate: string | null;
  dueDate?: string | null;
  paidAt?: string | null;
  createdAt: string | null;
  vehicleId?: string | null;
  customerId?: string | null;
  bookingId?: string | null;
  title?: string | null;
  invoiceNumberDisplay?: string | null;
}

/** Today pickup/return row shape from bookings API (partial — defensive mapping). */
export interface TodayBookingApiRow {
  id?: string;
  vehicleId?: string;
  customerId?: string | null;
  vehicleLicense?: string;
  vehicleName?: string;
  customerName?: string;
  startDate?: string;
  endDate?: string;
  pickupStationId?: string;
  returnStationId?: string;
  pickupStationName?: string;
  returnStationName?: string;
  stationLabel?: string;
  station?: string;
  pickupProtocol?: unknown;
  returnProtocol?: unknown;
  isOverdue?: boolean;
  minutesOverdue?: number;
  hasError?: boolean;
  kmExceeded?: boolean;
  extraKm?: number | null;
  returnProtocolStatus?: string | null;
  pickupProtocolOdometerKm?: number | null;
  status?: string;
  statusEnum?: string;
}

export interface OperationalKpi {
  id: string;
  label: string;
  value: string;
  hint?: string;
  tone: KpiTone;
  trend?: {
    label: string;
    direction: 'up' | 'down';
    invert?: boolean;
  };
}

export type ActionQueueSeverity = 'critical' | 'warning' | 'attention' | 'info';

export type ActionQueueCategory =
  | 'vehicle'
  | 'booking'
  | 'financial'
  | 'notification'
  | 'handover'
  | 'health'
  | 'operations'
  | 'task';

export type ActionQueueCta =
  | 'open-vehicle'
  | 'open-booking'
  | 'start-handover-pickup'
  | 'start-handover-return'
  | 'open-rental'
  | 'open-stations'
  | 'open-price-tariffs';

/**
 * Coarse contextual bucket a set of atomic actions belongs to. Used to group
 * several messages about the same real-world entity into a single Group Item
 * (e.g. all health modules of one vehicle).
 */
export type ActionQueueGroupType =
  | 'vehicle-health'
  | 'vehicle-ops'
  | 'station-ops'
  | 'booking'
  | 'customer-docs'
  | 'finance'
  | 'notification-thread';

/**
 * Optional deep-link target for a child action. Mirrors the canonical
 * Rental-Health-V1 module keys plus a generic vehicle overview fallback.
 * Navigation may fall back to "open vehicle" when a module-level deep link
 * does not exist yet, but the structure is already prepared.
 */
export type ActionQueueModuleTarget =
  | 'battery'
  | 'brakes'
  | 'tires'
  | 'service_compliance'
  | 'error_codes'
  | 'complaints'
  | 'vehicle_alerts'
  | 'overview';

/**
 * Display severity for grouped child actions / group headers. Extends the
 * atomic {@link ActionQueueSeverity} with an `overdue` tier that ranks between
 * `critical` and `warning` (e.g. an overdue service inspection).
 */
export type ActionQueueChildSeverity =
  | 'critical'
  | 'overdue'
  | 'warning'
  | 'attention'
  | 'info';

export type ActionQueueFilterTab =
  | 'all'
  | 'critical'
  | 'operations'
  | 'vehicle'
  | 'notifications';

/** Tabs rendered by Dashboard Notifications / ActionQueue (finance excluded — see Business Pulse). */
export const ACTION_QUEUE_FILTER_TABS: ActionQueueFilterTab[] = [
  'all',
  'critical',
  'operations',
  'vehicle',
  'notifications',
];

export interface ActionQueueEmptySummary {
  title: string;
  subtitle: string;
  readyCount: number;
  upcomingHandovers: number;
  syncLabel: string;
  readyLabel: string;
  handoverLabel: string;
}

export type InsightDataSource =
  | 'dashboard-insights'
  | 'derived-operations'
  | 'predictive-operations'
  | 'financial'
  | 'booking'
  | 'notifications-v2';

export interface ActionQueueItem {
  id: string;
  /** Canonical OperationalIssue key when the item was normalized. */
  semanticKey?: string;
  /** Structured issue type from operational normalization (when available). */
  issueType?: string;
  /** Structured notification queue envelope (P0 intermediate model). */
  queue?: NotificationQueueModel;
  source: InsightDataSource;
  severity: ActionQueueSeverity;
  category: ActionQueueCategory;
  title: string;
  reason: string;
  entityLabel?: string;
  timeLabel?: string;
  timeSortMs: number;
  priority: number;
  tone: StatusTone;
  cta: ActionQueueCta;
  vehicleId?: string;
  bookingId?: string;
  insightId?: string;
  insight?: DashboardInsight;
  pickupItem?: PickupTileItem;
  returnItem?: ReturnTileItem;
  predictiveInsight?: PredictiveOperationsInsight;
  isOverdue: boolean;
  pinned?: boolean;

  // ── Grouping metadata (optional, additive) ──────────────────────────────
  /** Stable key that ties several atomic items to the same real-world entity. */
  groupKey?: string;
  /** Coarse contextual bucket this item belongs to. */
  groupType?: ActionQueueGroupType;
  /** Canonical module this item targets (health modules). */
  module?: ActionQueueModuleTarget;
  /** Human label for the module/sub-category (e.g. "Battery", "Tires"). */
  moduleLabel?: string;
  /** Optional secondary line shown below the title in grouped child layout. */
  detail?: string;
  /** Effective display severity when rendered as a grouped child. */
  childSeverity?: ActionQueueChildSeverity;
  /** Optional CTA label override (e.g. "Open battery"). */
  ctaLabel?: string;
  stationId?: string;
  customerId?: string;

  /** V2 API — occurrence count for meta row. */
  occurrenceCount?: number;
  /** V2 API — allowed user actions from backend. */
  availableActions?: import('../../lib/notifications/notification-api.types').ApiNotificationAvailableAction[];
  /** V2 API — structured entity display (plate · make model year). */
  entityContextParams?: {
    plate?: string;
    make?: string;
    model?: string;
    year?: string | number;
    entityLine?: string;
    code?: string;
    reason?: string;
    idleDays?: number;
    lostRevenueEur?: number;
    available?: number;
    totalVehicles?: number;
    bookedOut?: number;
  };
  /** Fleet-level bridge insights (e.g. vehicles without tariff). */
  affectedVehicles?: Array<{ id: string; label: string }>;
}

/**
 * A single, concrete atomic action. Functionally identical to the historical
 * {@link ActionQueueItem}; the explicit `kind` discriminator lets the renderer
 * distinguish leaves from groups in {@link ActionQueueEntry}.
 */
export type ActionQueueLeafItem = ActionQueueItem & { kind: 'leaf' };

/**
 * One child action inside a grouped item. Carries everything the renderer and
 * existing navigation need; `itemId` references the underlying atomic
 * {@link ActionQueueItem} so drilldowns keep resolving by id.
 */
export interface ActionQueueChildAction {
  id: string;
  /** Underlying atomic item id (drilldown lookup compatible). */
  itemId: string;
  severity: ActionQueueChildSeverity;
  category: ActionQueueCategory;
  module?: ActionQueueModuleTarget;
  moduleLabel?: string;
  title: string;
  detail?: string;
  timeLabel?: string;
  timeSortMs: number;
  priority: number;
  cta: ActionQueueCta;
  ctaLabel?: string;
  vehicleId?: string;
  bookingId?: string;
  stationId?: string;
  customerId?: string;
  isOverdue: boolean;
}

/** A grouped item with a header and several child actions. */
export interface ActionQueueGroupItem {
  kind: 'group';
  id: string;
  groupKey: string;
  groupType: ActionQueueGroupType;
  /** Highest severity across all children. */
  severity: ActionQueueChildSeverity;
  category: ActionQueueCategory;
  title: string;
  subtitle: string;
  entityLabel?: string;
  vehicleId?: string;
  bookingId?: string;
  stationId?: string;
  customerId?: string;
  children: ActionQueueChildAction[];
  /** Max child priority — used to order the group among leaves. */
  priority: number;
}

/** A render-level entry: either a single leaf or a multi-child group. */
export type ActionQueueEntry = ActionQueueLeafItem | ActionQueueGroupItem;

/**
 * @deprecated Legacy fleet-state tab model. Not used by the active Dashboard.
 * `dashboardRuntime.slices`/`vehicleStates` directly. Kept only for deprecated
 * fleet-board builders and tests.
 */
export interface FleetStateTab {
  key: FleetStatusTabKey;
  label: string;
  count: number;
  tone: 'success' | 'warning' | 'brand' | 'critical';
  warn: number;
}

export type FleetBoardSeverity = 'critical' | 'warning' | 'attention' | 'info' | 'healthy';

export type FleetBoardLane =
  | 'all'
  | 'critical'
  | 'blocked'
  | 'overdue'
  | 'due-soon'
  | 'attention'
  | 'maintenance'
  | 'cleaning'
  | 'ready'
  | 'rented'
  | 'reserved';

export interface FleetBoardLaneSummary {
  lane: FleetBoardLane;
  label: string;
  count: number;
  severity: FleetBoardSeverity;
}

export interface FleetBoardItem {
  vehicleId: string;
  lane: Exclude<FleetBoardLane, 'all'>;
  severity: FleetBoardSeverity;
  statusLabel: string;
  license: string;
  makeModel?: string;
  station?: string;
  nextAppointment?: string;
  /** Legacy text label (e.g. "Fuel 22%") — kept for compatibility; the row UI
   *  now renders a compact icon + bar + percent instead. */
  fuelLabel: string | null;
  /** Canonical fuel/SoC percentage (0–100) for the compact energy bar. */
  fuelPercent: number | null;
  /** Whether the vehicle is electric (selects battery vs. fuel icon). */
  isElectric: boolean;
  lastSeenLabel: string | null;
  /** Central telemetry-freshness label (Live / Standby · 3h / Signal delayed ·
   *  30h / Offline · 2d / No signal · Setup check). Same logic as Fleet Page. */
  telemetryLabel: string | null;
  /** True only for genuine connectivity problems (offline / no_signal). */
  showTelemetryWarning: boolean;
  criticalHint?: string;
  sortPriority: number;
  isOffline: boolean;
  isStale: boolean;
}

/**
 * @deprecated Legacy fleet-board model. Not used by the active Dashboard.
 */
export interface FleetBoardModel {
  items: FleetBoardItem[];
  lanes: FleetBoardLaneSummary[];
  filteredItems: FleetBoardItem[];
}

export interface FleetStateItem {
  tab: FleetStateTab;
  vehicles: VehicleData[];
}

export interface TimelineItem {
  id: string;
  label: string;
  sublabel?: string;
  startAt: string;
  endAt: string;
  status: 'active' | 'upcoming' | 'completed';
  vehicleId?: string;
  bookingId?: string;
}

export type OperationEventType =
  | 'pickup'
  | 'return'
  | 'handover'
  | 'cleaning'
  | 'maintenance'
  | 'booking-conflict';

export type OperationEventStatus =
  | 'due-soon'
  | 'overdue'
  | 'completed'
  | 'pending'
  | 'blocked'
  | 'in-progress';

export type OperationTimelineLane = 'now' | 'next60' | 'later-today' | 'tomorrow';

export type TodayOpsBucket = 'todo' | 'in-progress' | 'completed';

export type OperationCta =
  | 'start-pickup'
  | 'start-return'
  | 'open-booking'
  | 'open-vehicle'
  | 'open-rental';

export interface OperationTimelineItem {
  id: string;
  type: OperationEventType;
  lane: OperationTimelineLane;
  status: OperationEventStatus;
  timeMs: number;
  timeLabel: string;
  vehicleLabel: string;
  vehicleId?: string;
  customer?: string;
  bookingId?: string;
  station?: string;
  risks: string[];
  tone: StatusTone;
  cta: OperationCta;
  pickupItem?: PickupTileItem;
  returnItem?: ReturnTileItem;
  completed: boolean;
  sortPriority: number;
}

export interface TodayOperationItem {
  id: string;
  bucket: TodayOpsBucket;
  type: OperationEventType;
  status: OperationEventStatus;
  timeMs: number;
  timeLabel: string;
  vehicleLabel: string;
  vehicleId?: string;
  customer?: string;
  bookingId?: string;
  station?: string;
  risks: string[];
  tone: StatusTone;
  cta: OperationCta;
  pickupItem?: PickupTileItem;
  returnItem?: ReturnTileItem;
  completed: boolean;
  sortPriority: number;
}

export interface NowNextTimelineModel {
  lanes: Record<OperationTimelineLane, OperationTimelineItem[]>;
  totalCount: number;
}

export interface TodayOperationsModel {
  todo: TodayOperationItem[];
  inProgress: TodayOperationItem[];
  completed: TodayOperationItem[];
  totalCount: number;
}

export type StationDataFreshness =
  | 'live'
  | 'partial'
  | 'stale'
  | 'offline'
  | 'no-vehicles';

export interface StationHealthSummary {
  stationId: string;
  stationName: string;
  vehicleCount: number;
  availableCount: number;
  rentedCount: number;
  reservedCount: number;
  maintenanceCount: number;
  needsCleaningCount: number;
  availableNotReadyCount?: number;
  warningCount?: number;
  softOfflineCount?: number;
  offlineCount?: number;
  alertCount: number;
  pickupsToday: number;
  returnsToday: number;
  overdueCount: number;
  criticalAlerts: number;
  blockedCount: number;
  readyCount: number;
  dueTodayCount: number;
  capacityGap: number;
  dataFreshness: StationDataFreshness;
  statusSeverity: 'healthy' | 'attention' | 'warning' | 'critical';
}

export interface StationVehicleChip {
  vehicleId: string;
  label: string;
  hint?: string;
}

export interface UnassignedFleetSummary {
  count: number;
  vehicles: StationVehicleChip[];
}

export interface StationCommandDetail {
  station: StationHealthSummary;
  readyVehicles: StationVehicleChip[];
  blockedVehicles: StationVehicleChip[];
  criticalVehicles: StationVehicleChip[];
  pickups: PickupTileItem[];
  returns: ReturnTileItem[];
  timelineItems: OperationTimelineItem[];
  actionItems: ActionQueueItem[];
}

export interface FleetReadinessBreakdown {
  ready: number;
  blocked: number;
  overdueReturns: number;
  criticalAlerts: number;
  cleaningNeeded: number;
  softOfflineCount: number;
  offlineCount: number;
  /** @deprecated Use softOfflineCount + offlineCount. */
  staleData: number;
  conflicts: number;
}

export type FleetReadinessStatus =
  | 'strong'
  | 'stable'
  | 'needs-attention'
  | 'critical'
  | 'not-enough-data';

export interface FleetReadinessSummary {
  status: FleetReadinessStatus;
  statusLabel: string;
  scorePercent: number | null;
  breakdown: FleetReadinessBreakdown;
  hasReliableBasis: boolean;
}

export interface DataFreshnessSummary {
  fleetLoading: boolean;
  fleetCountdownSec: number;
  insightsLoading: boolean;
  insightsStale: boolean;
  insightsGeneratedAt: string | null;
  insightsError: boolean;
  todayBookingsLoaded: boolean;
  invoicesLoaded: boolean;
  todayBookingsError: boolean;
  invoicesError: boolean;
}

/** @deprecated Legacy compact metric — use `BusinessPulseSlice` from runtime instead. */
export interface BusinessPulseMetric {
  id: string;
  label: string;
  value: string | number;
  tone: StatusTone;
  hint?: string;
}


/**
 * @deprecated Legacy monthly snapshot — active dashboard uses `buildBusinessPulseSlices` only.
 */
export interface MonthlyKpiSnapshot {
  revenueCents: number;
  expenseCents: number;
  profitCents: number;
  revenueCount: number;
  expenseCount: number;
  revenueDeltaPct: number | null;
  expenseDeltaPct: number | null;
  profitDeltaPct: number | null;
  monthLabel: string;
}

export interface FocusNotReadyVehicle {
  vehicleId: string;
  label: string;
  status: string;
  reason: string;
}

export interface DashboardViewModel {
  systemDark: boolean;
  locale: Locale;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
  dateLabel: string;

  controlCenterStatus: ControlCenterStatus;
  openSliceDrilldown: (sliceId: DashboardSliceId, groupId?: TodaysOperationsDrilldownGroupId) => void;
  openBusinessMetricDrilldown: (metricId: BusinessMetricId) => void;
  drilldownTarget: DashboardDrilldownTarget | null;
  openDrilldown: (target: DashboardDrilldownTarget) => void;
  closeDrilldown: () => void;
  dashboardRuntime: DashboardRuntimeModel;
  dashboardSlices: Record<DashboardSliceId, DashboardSlice>;
  vehicleRuntimeStates: VehicleRuntimeState[];
  businessPulseSlices: Record<BusinessMetricId, BusinessPulseSlice>;
  activeDashboardSliceId: DashboardSliceId | null;
  activeBusinessMetricId: BusinessMetricId | null;

  criticalOnly: boolean;
  setCriticalOnly: (value: boolean) => void;
  operatorFocusMode: boolean;
  setOperatorFocusMode: (value: boolean) => void;
  focusNotReadyVehicles: FocusNotReadyVehicle[];
  timeframe: DashboardTimeframe;
  setTimeframe: (value: DashboardTimeframe) => void;
  isRefreshing: boolean;
  refreshAll: () => Promise<void>;

  stations: Station[];
  selectedStationId: string | null;
  selectedStationName: string | null;
  isStationDropdownOpen: boolean;
  stationDropdownRef: RefObject<HTMLDivElement | null>;
  setIsStationDropdownOpen: React.Dispatch<React.SetStateAction<boolean>>;
  applyStationFilter: (stationId: string | null) => void;

  fleetVehicles: VehicleData[];
  filteredFleetVehicles: VehicleData[];
  /** Rental-health summaries by vehicle id (shared Fleet Command data source). */
  healthMap: Map<string, VehicleHealthResponse>;
  availableVehicles: VehicleData[];
  reservedVehicles: VehicleData[];
  activeRentedVehicles: VehicleData[];

  pickupItems: PickupTileItem[];
  returnItems: ReturnTileItem[];
  pickupNeedsCleaning: number;
  pickupAlerts: number;
  pickupOverdueCount: number;
  returnErrors: number;
  returnKmExceeded: number;
  returnOverdue: number;
  returnAlerts: number;

  handleConfirmPickup: (item: PickupTileItem) => void;
  handleConfirmReturn: (item: ReturnTileItem) => void;

  dashboardNotifications: DashboardNotificationItem[];
  actionQueue: ActionQueueItem[];
  actionQueueLoading: boolean;
  actionQueueError: boolean;
  /** When set (V2 path), tab badges use API counts instead of loaded-page estimates. */
  actionQueueTabCounts?: Record<ActionQueueFilterTab, number> | null;
  notificationPrimaryTabCounts?: Record<import('./notifications/notificationPanelTypes').NotificationPrimaryTab, number> | null;
  setNotificationListMode?: (mode: 'active' | 'resolved') => void;
  notificationListMode?: 'active' | 'resolved';
  notificationsV2Mode?: 'off' | 'shadow' | 'on';
  notificationsV2ErrorCode?: string | null;
  notificationMutations?: {
    markRead: (id: string) => Promise<void>;
    markUnread: (id: string) => Promise<void>;
    acknowledge: (id: string) => Promise<void>;
    snooze: (id: string, until: string) => Promise<void>;
    unsnooze: (id: string) => Promise<void>;
    resolveNotification: (id: string) => Promise<void>;
    archiveNotification: (id: string) => Promise<void>;
    loadMore: () => Promise<void>;
    hasMore: boolean;
  };
  actionQueueEmptySummary: ActionQueueEmptySummary;
  todayBookingsLoaded: boolean;
  todayBookingsError: boolean;
  nowNextTimeline: NowNextTimelineModel;
  todayOperations: TodayOperationsModel;
  stationHealth: StationHealthSummary[];
  stationCommandDetail: StationCommandDetail | null;
  unassignedFleet: UnassignedFleetSummary;
  dataFreshness: DataFreshnessSummary;
  dataTrust: DataTrustLayer;
  vehicleTelemetryFreshness: import('./controlSignalsBuilder').VehicleTelemetryFreshness;
  fleetReadiness: FleetReadinessSummary;
}

export type { VehicleTelemetryFreshness } from './controlSignalsBuilder';
