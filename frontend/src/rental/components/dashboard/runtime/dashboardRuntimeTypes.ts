export type VehicleOperationalStatus =
  | 'available'
  | 'reserved'
  | 'active_rented'
  | 'maintenance'
  | 'unavailable'
  | 'unknown';

export type RentalReadinessState = 'ready' | 'not_ready' | 'blocked';

export type RentalBlockLevel = 'none' | 'soft_blocked' | 'hard_blocked';

export type HealthSeverity = 'ok' | 'warning' | 'critical' | 'unknown';

export type ComplianceSeverity = 'ok' | 'warning' | 'critical' | 'unknown';

export type TelemetryConnectionState =
  | 'live'
  | 'standby'
  | 'soft_offline'
  | 'offline'
  | 'unknown';

export type DataQualityState =
  | 'fresh'
  | 'limited'
  | 'outdated'
  | 'missing'
  | 'unknown';

export type BookingRuntimeState =
  | 'none'
  | 'reserved'
  | 'pickup_due_soon'
  | 'active_rented'
  | 'return_due_soon'
  | 'return_overdue'
  | 'unknown';

export type RuntimeReasonSeverity = 'info' | 'warning' | 'critical';

export type RuntimeReasonCategory =
  | 'operational'
  | 'rental'
  | 'cleaning'
  | 'handover'
  | 'health'
  | 'tires'
  | 'brakes'
  | 'battery'
  | 'dtc'
  | 'service'
  | 'compliance'
  | 'damage'
  | 'telemetry'
  | 'data_quality'
  | 'finance'
  | 'unknown';

export interface RuntimeReason {
  id: string;
  category: RuntimeReasonCategory;
  severity: RuntimeReasonSeverity;
  title: string;
  description?: string;
  source?: string;
  /**
   * True only for genuine blockers: the vehicle must not be rented and is a
   * real Blocked & Maintenance candidate (maintenance, hard compliance/legal
   * block, rental_blocked, hard offline). Drives `reasonBlocksRenting`.
   */
  blocking?: boolean;
  /**
   * True when the reason prevents Ready-to-Rent without being a hard blocker
   * (e.g. cleaning not clean, health/compliance warnings). A reason can set
   * `preventsReady` without `blocking`; every `blocking` reason also prevents
   * ready. Drives `reasonPreventsReady`.
   */
  preventsReady?: boolean;
  actionLabel?: string;
  actionTarget?: string;
}

export interface VehicleRuntimeState {
  vehicleId: string;
  license?: string;
  displayName: string;
  stationId?: string | null;
  stationLabel?: string | null;

  operationalStatus: VehicleOperationalStatus;
  rentalReadiness: RentalReadinessState;
  blockLevel: RentalBlockLevel;

  healthSeverity: HealthSeverity;
  complianceSeverity: ComplianceSeverity;
  telemetryState: TelemetryConnectionState;
  dataQualityState: DataQualityState;
  bookingState: BookingRuntimeState;

  readyReasons: RuntimeReason[];
  notReadyReasons: RuntimeReason[];
  blockReasons: RuntimeReason[];
  warningReasons: RuntimeReason[];
  criticalReasons: RuntimeReason[];

  isAvailable: boolean;
  isReadyToRent: boolean;
  isBlocked: boolean;
  isMaintenance: boolean;
  isCritical: boolean;
  isWarning: boolean;
}

export type DashboardSliceId =
  | 'ready-to-rent'
  | 'active-rented'
  | 'due-soon'
  | 'overdue-returns'
  | 'overdue-pickups'
  | 'blocked-maintenance'
  | 'critical-alerts';

export interface DashboardSliceRow {
  id: string;
  vehicleId?: string;
  bookingId?: string;
  invoiceId?: string;
  title: string;
  subtitle?: string;
  meta?: string;
  stationLabel?: string | null;
  severity: 'neutral' | 'success' | 'info' | 'warning' | 'critical';
  reasonIds?: string[];
  reasons?: RuntimeReason[];
  primaryActionLabel?: string;
  primaryActionTarget?: string;
}

export interface DashboardSlice {
  id: DashboardSliceId;
  title: string;
  description?: string;
  count: number | null;
  hint?: string;
  tone: 'neutral' | 'success' | 'info' | 'watch' | 'critical';
  rows: DashboardSliceRow[];
  /** Programmatic mirror of grouped rows (e.g. not-ready). Active UI reads `groups` via `dashboardSliceAccess`. */
  secondaryRows?: DashboardSliceRow[];
  groups?: Array<{
    id: string;
    title: string;
    count: number;
    rows: DashboardSliceRow[];
  }>;
  emptyTitle?: string;
  emptyDescription?: string;
}

export interface DashboardRuntimeModel {
  generatedAt: string;
  vehicleStates: VehicleRuntimeState[];
  slices: Record<DashboardSliceId, DashboardSlice>;
}

export type BusinessMetricId =
  | 'revenue'
  | 'profit'
  | 'expenses'
  | 'open-receivables'
  | 'overdue-receivables'
  | 'paid-invoices'
  | 'draft-invoices'
  | 'failed-payments';

export type BusinessDocumentState =
  | 'paid'
  | 'open'
  | 'overdue'
  | 'draft'
  | 'failed'
  | 'refunded'
  | 'disputed'
  | 'unknown';

export interface BusinessPulseRow {
  id: string;
  invoiceId?: string;
  bookingId?: string;
  customerId?: string;
  vehicleId?: string;
  title: string;
  subtitle?: string;
  amountCents?: number;
  currency?: string;
  state: BusinessDocumentState;
  dueDate?: string | null;
  invoiceDate?: string | null;
  severity: 'neutral' | 'success' | 'info' | 'warning' | 'critical';
  primaryActionLabel?: string;
  primaryActionTarget?: string;
}

export interface BusinessPulseSlice {
  id: BusinessMetricId;
  title: string;
  valueCents?: number | null;
  count: number | null;
  hint?: string;
  tone: 'neutral' | 'success' | 'info' | 'watch' | 'critical';
  rows: BusinessPulseRow[];
  groups?: Array<{
    id: string;
    title: string;
    count: number;
    rows: BusinessPulseRow[];
  }>;
}
