import type { Vehicle } from '@prisma/client';
import type { VehicleRegistrationBrakeResult } from '@modules/vehicle-intelligence/brakes/registration-brake-outcome';

export type RegisterFromDimoPostActivationEnrichmentStatus = 'FAILED';

export interface RegisterFromDimoPostActivationEnrichment {
  tireTread?: {
    status: RegisterFromDimoPostActivationEnrichmentStatus;
    message: string;
  };
}

export interface RegisterFromDimoResult {
  vehicle: Vehicle;
  brakeRegistration: VehicleRegistrationBrakeResult;
  /** Vehicle registration succeeded; optional post-activation enrichment did not. */
  postActivationEnrichment?: RegisterFromDimoPostActivationEnrichment;
}
