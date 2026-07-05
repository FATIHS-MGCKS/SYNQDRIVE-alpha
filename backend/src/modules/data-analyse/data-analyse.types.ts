export type IntervalStatus =
  | 'OK'
  | 'Delayed'
  | 'Sparse'
  | 'Missing'
  | 'Unknown';

export type DataFreshnessStatus =
  | 'fresh'
  | 'stale'
  | 'offline'
  | 'insufficient_data'
  | 'unknown';

export type HfDetectionQuality =
  | 'Good for detection'
  | 'Borderline'
  | 'Too sparse'
  | 'Not available'
  | 'Unknown';

export type HfReliabilityStatus = 'GOOD' | 'WATCH' | 'POOR' | 'MISSING';

/** HF mirror (ClickHouse telemetry_hf_*) feature-flag status, read-only. */
export type HfMirrorStatus = 'enabled' | 'disabled' | 'unknown';

/**
 * Aggregated HF-availability label for the Data Analyse page (single source of
 * truth so the UI legend never contradicts itself):
 *   - hf_available : real, usable HF evidence (sub-2s cadence or healthy volume).
 *   - sparse       : some HF/waypoints exist but too thin to be reliable.
 *   - snapshot_only: only ~30s snapshot/latest-state telemetry — no HF.
 *   - missing      : no telemetry of any kind observed.
 *   - unknown      : nothing queried yet / counts indeterminate.
 */
export type HfAvailabilityStatus =
  | 'hf_available'
  | 'sparse'
  | 'snapshot_only'
  | 'missing'
  | 'unknown';

/**
 * The concrete persistence source a Data Analyse signal value/interval was
 * read from. Kept explicit so the page never conflates the layers.
 */
export type DataSourceTable =
  | 'vehicle_latest_states'
  | 'telemetry_snapshots'
  | 'telemetry_hf_points'
  | 'telemetry_waypoints'
  | 'telemetry_hf_events';

export type LaunchDetectionUsefulness =
  | 'POSSIBLE'
  | 'LIMITED'
  | 'NOT_POSSIBLE'
  | 'UNKNOWN';

export type HfPracticalUse =
  | 'Live Map'
  | 'Trip Reconstruction'
  | 'Launch-like Start Detection'
  | 'Brake Health'
  | 'Tire Health'
  | 'Battery Health'
  | 'Alerts';

export type LaunchFeasibility =
  | 'Reliable'
  | 'Possible but weak'
  | 'Not reliable'
  | 'Not enough data';

export type HealthCalcFreshness = 'current' | 'stale' | 'not_available' | 'unknown';

export type SignalModuleUsage =
  | 'Trips'
  | 'Driving Analysis'
  | 'Tire Health'
  | 'Brake Health'
  | 'Battery Health'
  | 'Alerts'
  | 'Live Map'
  | 'Unknown';

export interface DataAnalyseVehicleDto {
  id: string;
  name: string;
  licensePlate: string | null;
  vin: string | null;
  provider: string | null;
  connectionStatus: string;
  lastSeenAt: string | null;
  dimoTokenId: number | null;
}

export interface TelemetryOverviewDto {
  lastTelemetryReceived: string | null;
  totalSignalsObserved: number;
  highFrequencySignalsObserved: number;
  averageObservedIntervalMs: number | null;
  fastestObservedIntervalMs: number | null;
  slowestObservedIntervalMs: number | null;
  missingExpectedSignals: string[];
  dataFreshnessStatus: DataFreshnessStatus;
  insufficientData: boolean;
  notes: string[];
}

export interface SignalArrivalRowDto {
  signalName: string;
  signalGroup: string;
  latestValue: string | number | boolean | null;
  unit: string | null;
  providerTimestamp: string | null;
  backendReceivedTimestamp: string | null;
  lastSeen: string | null;
  observedIntervalMs: number | null;
  expectedIntervalMs: number | null;
  intervalStatus: IntervalStatus;
  sourceProvider: string | null;
  storageLocation: string;
  usedByModules: SignalModuleUsage[];
  persisted: boolean;
}

export interface HighFrequencySignalDto {
  signalKey: string;
  signalName: string;
  displayName: string;
  sourceProvider: string | null;
  pollGroup: string;
  storageTable: string;
  sampleCount24h: number | null;
  sampleCount7d: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  medianIntervalMs: number | null;
  p95IntervalMs: number | null;
  minIntervalMs: number | null;
  maxIntervalMs: number | null;
  gapCount: number | null;
  largestGapMs: number | null;
  reliabilityStatus: HfReliabilityStatus;
  practicalUse: HfPracticalUse[];
  launchDetectionUsefulness: LaunchDetectionUsefulness;
  explanation: string;
  /** Legacy compatibility fields */
  observedIntervalMs: number | null;
  averageIntervalMs: number | null;
  dropoutCount: number | null;
  longestGapMs: number | null;
  providerToBackendLatencyMs: number | null;
  detectionQuality: HfDetectionQuality;
  notes: string[];
}

export interface HfRecentEventDto {
  eventType: string;
  severity: string;
  eventStart: string;
  eventEnd: string | null;
  durationMs: number | null;
  confidence: string;
  primaryValue: number | null;
  primaryUnit: string | null;
}

export interface HighFrequencyAnalysisDto {
  available: boolean;
  message: string | null;
  snapshotLevelOnly: boolean;
  /**
   * Aggregated, operator-facing HF-availability label. Single source of truth
   * that collapses available/snapshotLevelOnly/counts into one value so the UI
   * legend cannot contradict itself.
   */
  hfAvailabilityStatus?: HfAvailabilityStatus;
  clickHouseAvailable: boolean;
  signals: HighFrequencySignalDto[];
  /** telemetry_waypoints (route/waypoint stream). */
  waypointCount24h: number | null;
  waypointCount7d: number | null;
  /** telemetry_snapshots (~30s snapshot mirror) total sample counts. */
  snapshotSampleCount24h: number | null;
  snapshotSampleCount7d: number | null;
  /**
   * Optional HF-layer status (ClickHouse telemetry_hf_* mirror). Best-effort and
   * analytics-only — absent/empty when the HF layer has no data or is degraded.
   */
  hfConfigured?: boolean;
  /** telemetry_hf_points (real 1s/post-trip HF signal points). */
  hfPointCount24h?: number | null;
  hfPointCount7d?: number | null;
  hfLatestPointAt?: string | null;
  hfSignalGroupsSeen?: string[];
  /** telemetry_hf_events (HF-reconstructed events). */
  hfRecentEvents?: HfRecentEventDto[];
  /**
   * HF mirror feature-flag status as derivable from the read model. Diagnostic
   * only — tells the operator whether post-trip HF mirroring into ClickHouse is
   * currently enabled, disabled, or indeterminable.
   */
  hfMirrorStatus?: HfMirrorStatus;
}

export interface LaunchFeasibilityDto {
  feasibility: LaunchFeasibility;
  availableSignals: string[];
  missingSignals: string[];
  observedIntervals: Record<string, number | null>;
  minimumViableIntervalMs: number;
  providerLimitations: string[];
  recommendation: string;
  reasons: string[];
}

export interface SignalGroupDefinitionDto {
  id: string;
  groupName: string;
  description: string;
  typicalSignals: string[];
  expectedIntervalMs: number | null;
  practicalUse: string;
  usedByModules: string[];
  detectionRelevance: string;
  sourceProvider: string | null;
  storageLocation: string | null;
  limitations: string | null;
  currentAvailability: 'available' | 'partial' | 'missing' | 'unknown';
  availabilityNotes: string | null;
}

export type HealthInputBasis =
  | 'signal-based'
  | 'modeled'
  | 'mixed'
  | 'unknown';

export interface HealthTraceSectionDto {
  status: string | null;
  lastCalculationAt: string | null;
  calculationSource: string | null;
  freshness: HealthCalcFreshness;
  /**
   * Whether the health result is driven by live telemetry signals
   * ('signal-based'), by a model/estimate without direct per-signal inputs
   * ('modeled'), or a combination ('mixed'). Diagnostic clarity so the page
   * never implies a modeled value is signal-backed.
   */
  inputBasis: HealthInputBasis;
  inputsAvailable: string[];
  inputsMissing: string[];
  evidence: Record<string, unknown>;
  notes: string[];
}

export interface HealthTraceDto {
  brake: HealthTraceSectionDto;
  tire: HealthTraceSectionDto;
  battery: HealthTraceSectionDto;
}

export interface PipelineStepDto {
  step: string;
  status: 'available' | 'unknown' | 'not_persisted' | 'unavailable';
  lastSeenAt: string | null;
  sourceName: string | null;
  notes: string | null;
}

export interface PipelineDto {
  provider: string | null;
  steps: PipelineStepDto[];
  lastSuccessfulProcessing: string | null;
  lastError: string | null;
}

// ── LTE_R1 Event Context Architecture (Phase 6, read-only diagnostic) ────────

export type EventLayerStatus =
  | 'active'
  | 'no_events'
  | 'unavailable'
  | 'configured'
  | 'not_configured'
  | 'failed'
  | 'insufficient'
  | 'skipped'
  | 'sparse'
  | 'snapshot_only'
  | 'unknown';

export interface EventLayerDto {
  status: EventLayerStatus;
  label: string;
  detail: string;
  /** Optional small counters surfaced as chips. */
  counters?: Array<{ label: string; value: string }>;
}

export interface DetectorFeasibilityDto {
  nativeBehaviorEvents: boolean;
  deviceConnectionWebhooks: boolean;
  rpmWebhooks: boolean;
  contextClassification: boolean;
  /** Whole-trip HF-derived SHORT-event detection is intentionally not relied on. */
  shortEventHfDerivedDetection: 'disabled' | 'not_reliable';
  notes: string[];
}

export interface EventArchitectureMetricsDto {
  effectiveCadenceMs: number | null;
  medianIntervalMs: number | null;
  p95IntervalMs: number | null;
  missingSignals: string[];
  contextWindowsProcessed: number;
  deviceConnectionEvents7d: number;
  rpmWebhookCandidates7d: number;
  openUnpluggedEpisode: boolean;
}

export interface EventArchitectureDto {
  /** ICE engine context only applies to LTE_R1/ICE; EV/Tesla are excluded. */
  powertrainApplicable: boolean;
  powertrainNote: string;
  nativeEventIntake: EventLayerDto;
  deviceConnectionWebhookIntake: EventLayerDto;
  rpmWebhookIntake: EventLayerDto;
  eventContextEnrichment: EventLayerDto;
  tripSignalSummaryEnrichment: EventLayerDto;
  detectorFeasibility: DetectorFeasibilityDto;
  metrics: EventArchitectureMetricsDto;
}
