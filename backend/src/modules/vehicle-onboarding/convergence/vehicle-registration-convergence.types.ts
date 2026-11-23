import type {
  HmOnlyRegistrationResultDto,
  RegisterHmOnlyVehicleDto,
} from '@modules/high-mobility/dto/high-mobility.dto';

export interface ConvergenceTenantAccess {
  tenantOrganizationId: string;
  isMasterAdmin: boolean;
  actorUserId: string | null;
}

export interface HmOnlyCanonicalRegistrationInput {
  dto: RegisterHmOnlyVehicleDto;
  access: ConvergenceTenantAccess;
}

export type HmOnlyCanonicalRegistrationResult = HmOnlyRegistrationResultDto;