import { Injectable } from '@nestjs/common';
import { buildTripAssessabilityCapabilitySnapshot } from '../driving-detector-capability/trip-assessability-detector-bridge';
import { DrivingDetectorCapabilityResolverService } from '../driving-detector-capability/driving-detector-capability.service';
import { evaluateTripAssessability } from './trip-assessability.policy';
import { TripAssessabilityRepository } from './trip-assessability.repository';
import type {
  TripAssessabilityPolicyInput,
  TripAssessabilityPolicyResult,
} from './trip-assessability.types';

@Injectable()
export class TripAssessabilityService {
  constructor(
    private readonly repository: TripAssessabilityRepository,
    private readonly detectorCapabilityResolver: DrivingDetectorCapabilityResolverService,
  ) {}

  evaluate(input: TripAssessabilityPolicyInput): TripAssessabilityPolicyResult {
    return evaluateTripAssessability(input);
  }

  /**
   * Resolve per-vehicle detector capabilities centrally, then evaluate assessability.
   * Used by DRIVING_ASSESSABILITY_COMPUTE jobs and trip analysis orchestration.
   */
  async evaluateWithVehicleDetectorCapabilities(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    input: Omit<TripAssessabilityPolicyInput, 'capabilities' | 'detectorCapabilities'>,
    analysisRunId?: string | null,
  ) {
    const detectorCapabilities = await this.detectorCapabilityResolver.resolveForVehicle(
      organizationId,
      vehicleId,
    );
    const enrichedInput: TripAssessabilityPolicyInput = {
      ...input,
      capabilities: buildTripAssessabilityCapabilitySnapshot(detectorCapabilities),
      detectorCapabilities,
    };
    return this.evaluateAndPersist(
      organizationId,
      vehicleId,
      tripId,
      enrichedInput,
      analysisRunId,
    );
  }

  findByTrip(organizationId: string, tripId: string) {
    return this.repository.findByTrip(organizationId, tripId);
  }

  async evaluateAndPersist(
    organizationId: string,
    vehicleId: string,
    tripId: string,
    input: TripAssessabilityPolicyInput,
    analysisRunId?: string | null,
  ) {
    const result = evaluateTripAssessability(input);
    const rows = await this.repository.upsertPolicyResult(
      organizationId,
      vehicleId,
      tripId,
      result,
      analysisRunId,
    );
    return { result, rows };
  }
}
