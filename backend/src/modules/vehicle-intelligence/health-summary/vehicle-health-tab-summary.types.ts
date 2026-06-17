export type VehicleHealthSummaryState = 'good' | 'warning' | 'critical' | 'unknown';

export type VehicleHealthModuleState =
  | 'good'
  | 'warning'
  | 'critical'
  | 'unknown'
  | 'not_applicable'
  | 'no_tracking'
  | 'endpoint_error'
  | 'stale';

export type VehicleHealthFindingModule =
  | 'battery'
  | 'tires'
  | 'brakes'
  | 'error_codes'
  | 'service_compliance'
  | 'complaints'
  | 'vehicle_alerts'
  | 'oem_hm'
  | 'unknown';

export type VehicleHealthFindingSeverity = 'critical' | 'warning' | 'info' | 'unknown';

export type VehicleHealthTargetModalKey =
  | 'battery'
  | 'tires'
  | 'brakes'
  | 'dtc'
  | 'service'
  | 'complaints'
  | 'warnings'
  | null;

export type VehicleHealthDataQualityLevel = 'high' | 'medium' | 'low' | 'unknown';

export type VehicleHealthSourceLoadStatus = 'loaded' | 'endpoint_error' | 'not_available';

export type VehicleHealthHmFreshness =
  | 'fresh'
  | 'stale'
  | 'no_data'
  | 'not_connected'
  | 'sync_error'
  | 'unknown';

export type VehicleHealthDimoFreshness =
  | 'fresh'
  | 'stale'
  | 'no_data'
  | 'not_connected'
  | 'unknown';

export type VehicleHealthComplianceDateState = 'good' | 'warning' | 'critical' | 'unknown';

export interface ServiceComplianceModuleState {
  state: 'good' | 'warning' | 'critical' | 'unknown' | 'no_tracking';
  label: string;
  reason?: string;
  nextService?: {
    source: 'hm_oem';
    daysRemaining?: number;
    kmRemaining?: number;
  } | null;
  tuev?: {
    dueDate?: string;
    state: VehicleHealthComplianceDateState;
  };
  bokraft?: {
    dueDate?: string;
    state: VehicleHealthComplianceDateState;
  };
}

export interface VehicleHealthModuleStateBase {
  state: VehicleHealthModuleState;
  label: string;
  reason?: string;
}

export interface VehicleHealthTabSummaryDto {
  vehicleId: string;
  generatedAt: string;

  overall: {
    state: VehicleHealthSummaryState;
    label: string;
    headline: string;
    description: string;
    rentalBlocked: boolean;
    blockingReasons: string[];
  };

  dataQuality: {
    level: VehicleHealthDataQualityLevel;
    label: string;
    reasons: string[];
  };

  findings: Array<{
    id: string;
    module: VehicleHealthFindingModule;
    severity: VehicleHealthFindingSeverity;
    title: string;
    description: string;
    evidence?: string[];
    targetModalKey?: VehicleHealthTargetModalKey;
  }>;

  moduleStates: Record<string, VehicleHealthModuleStateBase | ServiceComplianceModuleState> & {
    service_compliance?: ServiceComplianceModuleState;
  };

  sourceStatus: {
    rentalHealth: 'loaded' | 'endpoint_error';
    aiHealthCare: 'loaded' | 'not_available' | 'endpoint_error';
    highMobility: VehicleHealthHmFreshness;
    dimo: VehicleHealthDimoFreshness;
  };

  degradedDependencies: Array<{
    source: string;
    status: 'endpoint_error' | 'stale' | 'no_data' | 'not_connected' | 'unknown';
    message: string;
  }>;

  oemIndicators?: {
    supported: boolean;
    freshness: 'fresh' | 'stale' | 'no_data' | 'unknown';
    indicators: Array<{
      key: string;
      label: string;
      status: 'active' | 'inactive' | 'unknown' | 'stale';
      severity: 'critical' | 'warning' | 'info' | 'unknown';
      description?: string;
    }>;
  };

  nextService?: {
    trackingStatus: 'TRACKED' | 'NO_TRACKING' | 'STALE';
    displayLine: string;
    days: number | null;
    km: number | null;
  };
}
