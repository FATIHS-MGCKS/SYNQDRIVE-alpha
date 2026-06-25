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
  clickHouseAvailable: boolean;
  signals: HighFrequencySignalDto[];
  waypointCount24h: number | null;
  /**
   * Optional HF-layer status (ClickHouse telemetry_hf_* mirror). Best-effort and
   * analytics-only — absent/empty when the HF layer has no data or is degraded.
   */
  hfConfigured?: boolean;
  hfPointCount24h?: number | null;
  hfLatestPointAt?: string | null;
  hfSignalGroupsSeen?: string[];
  hfRecentEvents?: HfRecentEventDto[];
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
