import { RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT } from '@modules/vehicle-intelligence/ports/rental-driving-analysis-recompute-trigger.port';
import { RentalDrivingAnalysisRecomputeTriggerService } from './rental-driving-analysis-recompute.trigger';

/** Reuses the existing Rental trigger instance — no duplicate registration. */
export const rentalDrivingAnalysisRecomputeTriggerPortProviders = [
  {
    provide: RENTAL_DRIVING_ANALYSIS_RECOMPUTE_TRIGGER_PORT,
    useExisting: RentalDrivingAnalysisRecomputeTriggerService,
  },
] as const;