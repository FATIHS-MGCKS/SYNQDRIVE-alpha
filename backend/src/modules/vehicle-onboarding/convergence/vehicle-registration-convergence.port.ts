import type {
  HmOnlyCanonicalRegistrationInput,
  HmOnlyCanonicalRegistrationResult,
} from './vehicle-registration-convergence.types';

export const VEHICLE_REGISTRATION_CONVERGENCE_PORT = Symbol(
  'VEHICLE_REGISTRATION_CONVERGENCE_PORT',
);

/**
 * Future canonical convergence entry (V2B-PR2+). PR1 ships fail-closed stub when armed.
 */
export interface VehicleRegistrationConvergencePort {
  registerHmOnlyCanonical(
    input: HmOnlyCanonicalRegistrationInput,
  ): Promise<HmOnlyCanonicalRegistrationResult>;
}