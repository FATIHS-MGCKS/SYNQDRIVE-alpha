import { Injectable } from '@nestjs/common';
import { evaluateTripAssessability } from './trip-assessability.policy';
import { TripAssessabilityRepository } from './trip-assessability.repository';
import type {
  TripAssessabilityPolicyInput,
  TripAssessabilityPolicyResult,
} from './trip-assessability.types';

@Injectable()
export class TripAssessabilityService {
  constructor(private readonly repository: TripAssessabilityRepository) {}

  evaluate(input: TripAssessabilityPolicyInput): TripAssessabilityPolicyResult {
    return evaluateTripAssessability(input);
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
