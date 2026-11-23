import type {
  HmOnlyRegistrationResultDto,
  RegisterHmOnlyVehicleDto,
} from '@modules/high-mobility/dto/high-mobility.dto';
import type { ConvergenceTenantAccess } from '../convergence/vehicle-registration-convergence.types';

export interface HmOnlyCanonicalOrchestrationInput {
  dto: RegisterHmOnlyVehicleDto;
  access: ConvergenceTenantAccess;
}

export type HmOnlyCanonicalOrchestrationResult = HmOnlyRegistrationResultDto;

export function hmOnlyCanonicalRegistrationIdempotencyKey(
  organizationId: string,
  hmVehicleId: string,
): string {
  return `hm-only-canonical-register:v1:${organizationId}:${hmVehicleId}`;
}