import { Injectable } from '@nestjs/common';
import type { VehicleRegistrationConvergencePort } from './vehicle-registration-convergence.port';
import type {
  HmOnlyCanonicalRegistrationInput,
  HmOnlyCanonicalRegistrationResult,
} from './vehicle-registration-convergence.types';
import { assertConvergenceOrganizationAuthorized } from './vehicle-registration-convergence.security';
import { HmOnlyCanonicalRegistrationService } from '../hm-only-canonical/hm-only-canonical-registration.service';

@Injectable()
export class VehicleRegistrationConvergenceService implements VehicleRegistrationConvergencePort {
  constructor(private readonly hmOnlyCanonical: HmOnlyCanonicalRegistrationService) {}

  async registerHmOnlyCanonical(
    input: HmOnlyCanonicalRegistrationInput,
  ): Promise<HmOnlyCanonicalRegistrationResult> {
    assertConvergenceOrganizationAuthorized(input.dto.organizationId, input.access);
    return this.hmOnlyCanonical.register({
      dto: input.dto,
      access: input.access,
      actorUserId: input.actorUserId ?? null,
    });
  }
}