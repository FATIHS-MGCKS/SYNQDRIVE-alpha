import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { VehicleRegistrationConvergencePort } from './vehicle-registration-convergence.port';
import type {
  HmOnlyCanonicalRegistrationInput,
  HmOnlyCanonicalRegistrationResult,
} from './vehicle-registration-convergence.types';
import { assertConvergenceOrganizationAuthorized } from './vehicle-registration-convergence.security';

@Injectable()
export class VehicleRegistrationConvergenceService implements VehicleRegistrationConvergencePort {
  async registerHmOnlyCanonical(
    input: HmOnlyCanonicalRegistrationInput,
  ): Promise<HmOnlyCanonicalRegistrationResult> {
    assertConvergenceOrganizationAuthorized(input.dto.organizationId, input.access);
    throw new ServiceUnavailableException({
      code: 'VEHICLE_REGISTRATION_CONVERGENCE_NOT_IMPLEMENTED',
      message:
        'HM_ONLY canonical convergence is armed but not yet implemented (V2B-PR2+). Disable VEHICLE_REGISTRATION_HM_ONLY_CANONICAL_ENABLED to restore legacy behavior.',
    });
  }
}