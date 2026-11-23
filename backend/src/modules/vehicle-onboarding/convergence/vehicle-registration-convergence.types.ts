import type {
  HmOnlyRegistrationResultDto,
  RegisterHmOnlyVehicleDto,
} from '@modules/high-mobility/dto/high-mobility.dto';

export interface ConvergenceTenantAccess {
  tenantOrganizationId: string;
  isMasterAdmin: boolean;
}

export interface HmOnlyCanonicalRegistrationInput {
  dto: RegisterHmOnlyVehicleDto;
  access: ConvergenceTenantAccess;
  actorUserId?: string | null;
}

export type HmOnlyCanonicalRegistrationResult = HmOnlyRegistrationResultDto;