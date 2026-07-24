import type {
  AiEvidenceConfidence,
  AiEvidenceFreshness,
  AiEvidenceReasonCode,
  AiEvidenceSource,
} from '../../evidence/ai-evidence.enums';
import type { AiEvidenceTelemetrySemantics } from '../../evidence/ai-evidence-telemetry.enums';
import type { OverallConnectivityState } from '@modules/vehicles/connectivity/domain/connectivity-domain.types';
import type { FleetSignalKey } from '@modules/vehicles/fleet-data-coverage.types';
import type { TelemetryFreshness } from '@modules/vehicles/vehicle-state-interpreter';

export const AI_GET_VEHICLE_TELEMETRY_STATUS_TOOL =
  'get_vehicle_telemetry_status' as const;

export interface AiGetVehicleTelemetryStatusInput {
  readonly vehicleId: string;
}

export interface AiTelemetryStatusExplanation {
  /** Machine-readable summary of why `telemetryState` was chosen. */
  readonly stateSummary: string;
  readonly canonicalFreshness: TelemetryFreshness;
  /** Provider link active but vehicle in normal DIMO heartbeat / resting window. */
  readonly connectedButQuiet: boolean;
  /** Stored snapshot timestamps exist and may be presented as last-known. */
  readonly lastKnownDataPresent: boolean;
  /** Integration/provider path error — distinct from missing individual signals. */
  readonly providerOutageLikely: boolean;
  /** One or more requested signal groups are unsupported for this vehicle context. */
  readonly hasUnsupportedSignals: boolean;
  /** GPS-backed location statements are reliable enough for grounded answers. */
  readonly locationStatementReliable: boolean;
  /** DTC/health-backed statements are reliable enough for grounded answers. */
  readonly healthStatementReliable: boolean;
  /** Signal group keys with fresh usable values. */
  readonly usableSignalGroups: readonly FleetSignalKey[];
  /** Expected signal group keys with no present value. */
  readonly missingSignalGroupsDetail: readonly FleetSignalKey[];
  /** Signal group keys with aged but still present values (last-known). */
  readonly staleSignalGroupsDetail: readonly FleetSignalKey[];
}

export interface AiGetVehicleTelemetryStatusData {
  readonly vehicleId: string;
  readonly displayName: string;
  readonly licensePlate: string | null;
  readonly telemetryState: AiEvidenceTelemetrySemantics;
  readonly lastSignalAt: string | null;
  readonly ageSeconds: number | null;
  readonly freshness: AiEvidenceFreshness;
  readonly connectivityStatus: OverallConnectivityState;
  readonly providerConnectionStatus: string | null;
  readonly supportedSignalGroups: readonly FleetSignalKey[];
  readonly availableSignalGroups: readonly FleetSignalKey[];
  readonly missingSignalGroups: readonly FleetSignalKey[];
  readonly staleSignalGroups: readonly FleetSignalKey[];
  readonly source: AiEvidenceSource;
  readonly reasonCodes: readonly string[];
  readonly warnings: readonly string[];
  readonly confidence: AiEvidenceConfidence;
  readonly reasonCode: AiEvidenceReasonCode;
  readonly availability: 'available' | 'partial' | 'unavailable' | 'permission_denied';
  readonly isLastKnownTelemetry: boolean;
  readonly explanation: AiTelemetryStatusExplanation;
}
