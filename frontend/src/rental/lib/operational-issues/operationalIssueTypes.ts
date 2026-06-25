export type OperationalIssueDomain =
  | 'vehicle_health'
  | 'service_compliance'
  | 'telemetry'
  | 'rental_readiness'
  | 'booking'
  | 'return'
  | 'handover'
  | 'damage'
  | 'misuse'
  | 'documents'
  | 'rental_requirements'
  | 'finance'
  | 'station_operations'
  | 'task'
  | 'notification'
  | 'data_quality'
  | 'system_debug';

export type OperationalIssueSeverity =
  | 'info'
  | 'attention'
  | 'warning'
  | 'critical';

export type OperationalIssueSourceType =
  | 'canonical'
  | 'runtime'
  | 'rental_health'
  | 'dashboard_insight'
  | 'predictive_insight'
  | 'derived_insight'
  | 'service_task'
  | 'damage_case'
  | 'misuse_case'
  | 'booking'
  | 'document'
  | 'finance'
  | 'legacy';

export interface OperationalIssueSource {
  sourceType: OperationalIssueSourceType;
  sourceId?: string;
  rawType?: string;
  debugLabel?: string;
}

export interface OperationalIssueEvidence {
  label: string;
  value: string;
  unit?: string;
  source?: string;
}

export interface OperationalIssueVisibility {
  dashboardAttention: boolean;
  dashboardDrawer: boolean;
  fleetCommand: boolean;
  vehicleOverview: boolean;
  vehicleHealth: boolean;
  vehicleTrips: boolean;
  vehicleDamages: boolean;
  bookingDetail: boolean;
  finance: boolean;
  debug: boolean;
}

export interface OperationalIssue {
  id: string;
  semanticKey: string;
  domain: OperationalIssueDomain;
  issueType: string;
  severity: OperationalIssueSeverity;
  title: string;
  subtitle?: string;
  entityLabel?: string;
  vehicleId?: string;
  bookingId?: string;
  tripId?: string;
  customerId?: string;
  invoiceId?: string;
  stationId?: string;
  primarySource: OperationalIssueSource;
  supportingSources: OperationalIssueSource[];
  evidence?: OperationalIssueEvidence[];
  recommendedAction?: string;
  cta?: {
    label: string;
    target: string;
  };
  visibility: OperationalIssueVisibility;
}

export type OperationalIssueLocale = 'de' | 'en';

export interface OperationalIssueVehicleLike {
  id?: string;
  vehicleId?: string;
  license?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | string | null;
  name?: string | null;
  displayName?: string | null;
}

export interface OperationalIssueBookingLike {
  id?: string;
  bookingId?: string;
  bookingNumber?: string | null;
  customerName?: string | null;
  pickupAt?: string | null;
  startDate?: string | null;
  startTime?: string | null;
}

export interface OperationalIssueCustomerLike {
  id?: string;
  customerId?: string;
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  companyName?: string | null;
}

export interface OperationalIssueInvoiceLike {
  id?: string;
  invoiceId?: string;
  invoiceNumber?: string | null;
  customerName?: string | null;
  amount?: string | null;
  amountLabel?: string | null;
}

export interface OperationalIssueDraft {
  semanticKey: string;
  domain: OperationalIssueDomain;
  issueType: string;
  severity: OperationalIssueSeverity;
  title: string;
  subtitle?: string;
  entityLabel?: string;
  vehicleId?: string;
  bookingId?: string;
  tripId?: string;
  customerId?: string;
  invoiceId?: string;
  stationId?: string;
  source: OperationalIssueSource;
  supportingSources?: OperationalIssueSource[];
  evidence?: OperationalIssueEvidence[];
  recommendedAction?: string;
  cta?: OperationalIssue['cta'];
  visibility?: OperationalIssueVisibility;
}

export interface RuntimeReasonLike {
  id: string;
  category: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description?: string;
  source?: string;
  blocking?: boolean;
  preventsReady?: boolean;
  actionLabel?: string;
  actionTarget?: string;
}

export interface VehicleRuntimeStateLike extends OperationalIssueVehicleLike {
  vehicleId: string;
  license?: string;
  displayName?: string;
  telemetryState?: 'live' | 'standby' | 'soft_offline' | 'offline' | 'unknown';
  warningReasons?: RuntimeReasonLike[];
  criticalReasons?: RuntimeReasonLike[];
  blockReasons?: RuntimeReasonLike[];
  notReadyReasons?: RuntimeReasonLike[];
}

export interface DashboardInsightLike {
  id: string;
  type: string;
  severity?: 'CRITICAL' | 'WARNING' | 'OPPORTUNITY' | 'INFO' | string;
  title?: string;
  message?: string;
  actionLabel?: string | null;
  actionType?: string | null;
  entityIds?: string[] | null;
  entityScope?: string;
  metrics?: Record<string, unknown> | null;
  reasons?: string[] | null;
}

export interface PredictiveInsightLike {
  id: string;
  type: string;
  severity?: OperationalIssueSeverity | 'neutral' | 'success' | string;
  title?: string;
  explanation?: string;
  sourceData?: string;
  recommendedAction?: string;
  vehicleId?: string;
  bookingId?: string;
  stationId?: string;
  affectedEntity?: {
    kind?: string;
    vehicleId?: string;
    bookingId?: string;
    stationId?: string;
    label?: string;
  };
}

export interface VehicleHealthAlertModuleLike {
  module: string;
  label?: string;
  severity: 'critical' | 'warning' | 'info' | string;
  reason?: string;
  dataStale?: boolean;
  lastUpdatedAt?: string | null;
}

export interface VehicleHealthAlertLike {
  vehicleId: string;
  vehicle?: OperationalIssueVehicleLike | null;
  severity?: 'critical' | 'warning' | 'info' | string;
  primaryReason?: string;
  secondaryReasons?: string[];
  modules?: VehicleHealthAlertModuleLike[];
  license?: string;
  make?: string;
  model?: string;
  year?: number | string;
}

export interface MisuseCaseLike {
  id: string;
  title?: string | null;
  description?: string | null;
  type: string;
  typeLabel?: string | null;
  category?: string | null;
  categoryLabel?: string | null;
  severity?: string | null;
  confidence?: string | null;
  eventCount?: number | null;
  firstDetectedAt?: string | null;
  lastDetectedAt?: string | null;
  recommendedAction?: string | null;
  evidenceSummary?: Record<string, unknown> | null;
  vehicleId?: string | null;
  tripId?: string | null;
  bookingId?: string | null;
  customerId?: string | null;
}

export interface OperationalIssueNormalizationInput {
  runtimeReasons?: RuntimeReasonLike[];
  vehicleRuntimeStates?: VehicleRuntimeStateLike[];
  vehicleHealthAlerts?: VehicleHealthAlertLike[];
  dashboardInsights?: DashboardInsightLike[];
  predictiveInsights?: PredictiveInsightLike[];
  derivedInsights?: unknown[];
  serviceTasks?: unknown[];
  misuseCases?: MisuseCaseLike[];
  damageCases?: unknown[];
  bookings?: unknown[];
  invoices?: unknown[];
  documents?: unknown[];
  vehiclesById?: Map<string, OperationalIssueVehicleLike> | Record<string, OperationalIssueVehicleLike>;
}

export interface OperationalIssueNormalizerOptions {
  locale?: OperationalIssueLocale;
  now?: Date;
  debugSources?: boolean;
}
