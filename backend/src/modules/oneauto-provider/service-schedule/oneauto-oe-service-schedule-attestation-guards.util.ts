import { normalizeVin, isValidVin } from '../client/oneauto-vin.util';
import {
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_SKU,
  ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_PRICING_SOURCE_VERSION,
} from './oneauto-oe-service-schedule-attestation-canary.constants';
import type { OneAutoOeServiceScheduleAttestationCanaryCfg } from './oneauto-oe-service-schedule-attestation-canary.config';

export type AttestationScopeViolationCode =
  | 'ATTESTATION_CANARY_DISABLED'
  | 'ATTESTATION_TARGET_ORG_MISMATCH'
  | 'ATTESTATION_TARGET_VEHICLE_MISMATCH'
  | 'ATTESTATION_TARGET_VIN_MISMATCH'
  | 'ATTESTATION_TARGET_BINDING_INCOMPLETE'
  | 'ATTESTATION_ACCOUNT_PRICING_NOT_VERIFIED'
  | 'ATTESTATION_OWNER_NOT_AUTHORIZED';

export function assertAttestationCanaryFeatureConfigured(
  cfg: OneAutoOeServiceScheduleAttestationCanaryCfg,
): void {
  if (!cfg.enabled) {
    throw attestationScopeError('ATTESTATION_CANARY_DISABLED', 'Attestation canary is disabled');
  }
  if (!cfg.targetOrganizationId || !cfg.targetVehicleId || !cfg.targetVin) {
    throw attestationScopeError(
      'ATTESTATION_TARGET_BINDING_INCOMPLETE',
      'Attestation canary target org, vehicle, and VIN must be configured',
    );
  }
  if (!cfg.accountPricingVerified) {
    throw attestationScopeError(
      'ATTESTATION_ACCOUNT_PRICING_NOT_VERIFIED',
      'Operator-verified account pricing latch is not set',
    );
  }
  if (!cfg.ownerAuthorized) {
    throw attestationScopeError(
      'ATTESTATION_OWNER_NOT_AUTHORIZED',
      'Explicit owner authorization latch is not set',
    );
  }
}

export function assertAttestationRequestScope(input: {
  cfg: OneAutoOeServiceScheduleAttestationCanaryCfg;
  organizationId: string;
  vehicleId: string;
  vehicleVin: string | null | undefined;
  serviceSku: string;
}): void {
  assertAttestationCanaryFeatureConfigured(input.cfg);
  if (input.serviceSku !== ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_CANARY_SKU) {
    throw attestationScopeError(
      'ATTESTATION_TARGET_BINDING_INCOMPLETE',
      'Attestation canary is locked to OE_SERVICE_SCHEDULE',
    );
  }
  if (input.organizationId !== input.cfg.targetOrganizationId) {
    throw attestationScopeError(
      'ATTESTATION_TARGET_ORG_MISMATCH',
      'Organization is outside attestation canary scope',
    );
  }
  if (input.vehicleId !== input.cfg.targetVehicleId) {
    throw attestationScopeError(
      'ATTESTATION_TARGET_VEHICLE_MISMATCH',
      'Vehicle is outside attestation canary scope',
    );
  }
  const vin = normalizeVin(input.vehicleVin);
  const expectedVin = normalizeVin(input.cfg.targetVin);
  if (!isValidVin(vin) || !isValidVin(expectedVin) || vin !== expectedVin) {
    throw attestationScopeError(
      'ATTESTATION_TARGET_VIN_MISMATCH',
      'Vehicle VIN does not match attestation canary target',
    );
  }
}

export function resolveAttestationPricingSourceVersion(): string {
  return ONEAUTO_OE_SERVICE_SCHEDULE_ATTESTATION_PRICING_SOURCE_VERSION;
}

function attestationScopeError(code: AttestationScopeViolationCode, message: string): Error {
  return Object.assign(new Error(message), { code });
}
