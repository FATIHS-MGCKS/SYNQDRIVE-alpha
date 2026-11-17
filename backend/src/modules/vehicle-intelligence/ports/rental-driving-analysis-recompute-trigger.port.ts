import type { RentalDrivingAnalysisRecomputeReason } from '@modules/rental-driving-analysis/rental-driving-analysis.recompute.types';

export const RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT = Symbol(
  'RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT',
);

export interface RentalDrivingAnalysisRecomputeTriggerPort {
  enqueueForBooking(input: {
    organizationId: string;
    vehicleId: string;
    bookingId: string;
    tripId?: string | null;
    reason: RentalDrivingAnalysisRecomputeReason;
    correlationId?: string;
  }): Promise<unknown>;

  enqueueForTrip(input: {
    organizationId: string;
    vehicleId: string;
    tripId: string;
    reason: RentalDrivingAnalysisRecomputeReason;
    correlationId?: string;
  }): Promise<unknown>;
}