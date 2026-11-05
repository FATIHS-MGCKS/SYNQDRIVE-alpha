import { readOneAutoBooleanEnv } from '../oneauto-boolean-env.util';
import {
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_ACCOUNT_PRICING_VERIFIED_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ENABLED_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_OWNER_AUTHORIZED_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_ORG_ID_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VEHICLE_ID_ENV,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VIN_ENV,
} from './oneauto-oe-service-schedule-attestation-canary.constants';

export type OneAutoOeServiceScheduleAttestationCanaryCfg = {
  enabled: boolean;
  targetOrganizationId: string | null;
  targetVehicleId: string | null;
  targetVin: string | null;
  accountPricingVerified: boolean;
  ownerAuthorized: boolean;
};

export function loadOneAutoOeServiceScheduleAttestationCanaryFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OneAutoOeServiceScheduleAttestationCanaryCfg {
  return {
    enabled: readOneAutoBooleanEnv(ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_ENABLED_ENV, false, env),
    targetOrganizationId: (env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_ORG_ID_ENV] ?? '').trim() || null,
    targetVehicleId:
      (env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VEHICLE_ID_ENV] ?? '').trim() || null,
    targetVin: (env[ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_TARGET_VIN_ENV] ?? '').trim() || null,
    accountPricingVerified: readOneAutoBooleanEnv(
      ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_ACCOUNT_PRICING_VERIFIED_ENV,
      false,
      env,
    ),
    ownerAuthorized: readOneAutoBooleanEnv(
      ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_OWNER_AUTHORIZED_ENV,
      false,
      env,
    ),
  };
}
