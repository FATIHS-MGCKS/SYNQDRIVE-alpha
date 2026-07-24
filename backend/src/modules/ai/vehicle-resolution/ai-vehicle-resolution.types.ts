import type { VehicleStatus } from '@prisma/client';
import type { AiAllowedVehicleScope } from '../execution/ai-execution-context.types';
import type { AiVehicleMatchType } from './ai-vehicle-resolution.enums';

export interface AiVehicleResolutionRecord {
  readonly vehicleId: string;
  readonly organizationId: string;
  readonly licensePlate: string | null;
  readonly vehicleName: string | null;
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly vin: string;
  readonly fuelType: string;
  readonly tokenId: number | null;
  readonly status: VehicleStatus;
  readonly currentStationId: string | null;
}

export interface AiVehicleResolutionHints {
  readonly rawMessage: string;
  readonly sanitizedMessage: string;
  readonly internalVehicleId?: string | null;
  readonly licensePlate?: string | null;
  readonly vin?: string | null;
  readonly tokenId?: number | null;
  readonly vehicleName?: string | null;
  readonly make?: string | null;
  readonly model?: string | null;
  readonly bookingId?: string | null;
  readonly bookingVehicleId?: string | null;
}

export interface AiVehicleResolutionCandidate {
  readonly vehicleId: string;
  readonly displayName: string;
  readonly licensePlate: string | null;
  readonly matchType: AiVehicleMatchType;
  readonly confidence: number;
  readonly operational: boolean;
}

export interface AiVehicleAllowedDataScope {
  readonly inOrganization: boolean;
  readonly inStationScope: boolean;
  readonly hasDimoTelemetry: boolean;
  readonly operational: boolean;
  readonly vehicleStatus: VehicleStatus | null;
}

export interface AiVehicleResolutionAmbiguity {
  readonly isAmbiguous: boolean;
  readonly reason: string | null;
  readonly candidates: readonly AiVehicleResolutionCandidate[];
}

export interface AiVehicleResolutionResult {
  readonly resolvedVehicleId: string | null;
  readonly displayName: string | null;
  readonly licensePlate: string | null;
  readonly matchType: AiVehicleMatchType;
  readonly confidence: number;
  readonly ambiguity: AiVehicleResolutionAmbiguity;
  readonly allowedDataScope: AiVehicleAllowedDataScope;
}

export interface ResolveAiVehicleFromMessageInput {
  readonly organizationId: string;
  readonly message: string;
  readonly fleet: readonly AiVehicleResolutionRecord[];
  readonly allowedVehicleScope?: AiAllowedVehicleScope;
  readonly bookingId?: string | null;
  readonly bookingVehicleId?: string | null;
}

export interface ScoredAiVehicleMatch {
  readonly vehicleId: string;
  readonly matchType: AiVehicleMatchType;
  readonly confidence: number;
}
