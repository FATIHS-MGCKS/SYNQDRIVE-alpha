import type {
  AiEvidenceAvailability,
  AiEvidenceConfidence,
  AiEvidenceFreshness,
} from '../../evidence/ai-evidence.enums';
import type {
  HealthState,
  RentalHealthAvailabilityState,
} from '@modules/rental-health/rental-health.types';

export const AI_GET_VEHICLE_HEALTH_SUMMARY_TOOL =
  'get_vehicle_health_summary' as const;

export interface AiGetVehicleHealthSummaryInput {
  readonly vehicleId: string;
}

export type AiHealthDomainSeverity =
  | 'critical'
  | 'warning'
  | 'info'
  | 'unknown'
  | 'not_applicable';

export type AiHealthDomainStatus = HealthState | 'endpoint_error' | 'not_supported';

export interface AiHealthDomainSlice {
  readonly status: AiHealthDomainStatus;
  readonly severity: AiHealthDomainSeverity;
  readonly observedAt: string | null;
  readonly freshness: AiEvidenceFreshness;
  readonly source: string;
  readonly summaryFacts: readonly string[];
  readonly blocker: boolean;
  readonly availability: AiEvidenceAvailability;
  readonly confidence: AiEvidenceConfidence;
  readonly reasonCodes: readonly string[];
  readonly warnings: readonly string[];
  /** True when values are last-known / stale snapshot presentation. */
  readonly isHistorical: boolean;
}

export interface AiHealthDataCoverageSummary {
  readonly coverageState: string;
  readonly coveragePercent: number | null;
  readonly expectedSignalCount: number;
  readonly freshSignalCount: number;
  readonly staleSignalCount: number;
  readonly missingSignalCount: number;
}

export interface AiGetVehicleHealthSummaryDomains {
  readonly overall: AiHealthDomainSlice;
  readonly battery: AiHealthDomainSlice;
  readonly tires: AiHealthDomainSlice;
  readonly brakes: AiHealthDomainSlice;
  readonly dtcs: AiHealthDomainSlice;
  readonly warningLights: AiHealthDomainSlice;
  readonly connectivity: AiHealthDomainSlice;
  readonly service: AiHealthDomainSlice;
  readonly tuv: AiHealthDomainSlice;
  readonly bokraft: AiHealthDomainSlice;
  readonly damages: AiHealthDomainSlice;
  readonly technicalObservations: AiHealthDomainSlice;
  readonly criticalTasks: AiHealthDomainSlice;
}

export interface AiGetVehicleHealthSummaryData {
  readonly vehicleId: string;
  readonly displayName: string;
  readonly licensePlate: string | null;
  readonly overallStatus: HealthState;
  readonly pipelineAvailability: RentalHealthAvailabilityState;
  readonly limitedData: boolean;
  readonly dataCoverage: AiHealthDataCoverageSummary;
  readonly confidence: AiEvidenceConfidence;
  readonly lastUpdatedAt: string;
  readonly rentalBlocked: boolean | null;
  readonly readyToRentBlockers: readonly string[];
  readonly domains: AiGetVehicleHealthSummaryDomains;
  readonly warnings: readonly string[];
  readonly reasonCodes: readonly string[];
}
