import type {
  AiEvidenceAvailability,
  AiEvidenceConfidence,
  AiEvidenceFreshness,
  AiEvidenceReasonCode,
} from '../../evidence/ai-evidence.enums';
import type { AiEvidenceTelemetrySemantics } from '../../evidence/ai-evidence-telemetry.enums';

export const AI_GET_VEHICLE_LOCATION_TOOL = 'get_vehicle_location' as const;

export type AiGetVehicleLocationSource =
  | 'vehicle_latest_state'
  | 'dimo_live'
  | 'cache_fallback';

export interface AiGetVehicleLocationInput {
  readonly vehicleId: string;
}

export interface AiGetVehicleLocationData {
  readonly vehicleId: string;
  readonly displayName: string;
  readonly licensePlate: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly address: string | null;
  readonly observedAt: string | null;
  readonly ageSeconds: number | null;
  readonly freshness: AiEvidenceFreshness;
  readonly telemetryState: AiEvidenceTelemetrySemantics;
  readonly speedKmh: number | null;
  readonly ignitionState: boolean | null;
  readonly source: AiGetVehicleLocationSource;
  readonly isLastKnownLocation: boolean;
  readonly availability: AiEvidenceAvailability;
  readonly confidence: AiEvidenceConfidence;
  readonly reasonCode: AiEvidenceReasonCode;
  readonly warnings: readonly string[];
}
