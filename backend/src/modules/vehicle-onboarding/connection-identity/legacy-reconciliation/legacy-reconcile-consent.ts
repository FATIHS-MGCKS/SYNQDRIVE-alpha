import type { VehicleProviderConsent } from '@prisma/client';
import {
  VehicleProviderConsentGrantType,
  VehicleProviderConsentStatus,
} from '@prisma/client';

const CONSENT_PROVIDER = 'DIMO';

export type LegacyReconcileConsentCheckInput = {
  consent: Pick<
    VehicleProviderConsent,
    | 'id'
    | 'vehicleId'
    | 'organizationId'
    | 'provider'
    | 'grantType'
    | 'status'
    | 'revokedAt'
    | 'expiresAt'
    | 'providerVehicleRef'
  > | null;
  vehicleId: string;
  organizationId: string;
  dimoExternalId: string | null | undefined;
  now: Date;
};

export function validateLegacyReconcileConsent(
  input: LegacyReconcileConsentCheckInput,
): { ok: true } | { ok: false; reasonCode: string } {
  const { consent } = input;
  if (!consent) {
    return { ok: false, reasonCode: 'CONSENT_MISSING' };
  }
  if (consent.vehicleId !== input.vehicleId || consent.organizationId !== input.organizationId) {
    return { ok: false, reasonCode: 'CONSENT_OWNERSHIP_MISMATCH' };
  }
  if (consent.provider !== CONSENT_PROVIDER) {
    return { ok: false, reasonCode: 'CONSENT_PROVIDER_MISMATCH' };
  }
  if (consent.grantType !== VehicleProviderConsentGrantType.DIMO_DIRECT) {
    return { ok: false, reasonCode: 'CONSENT_GRANT_MISMATCH' };
  }
  if (consent.status !== VehicleProviderConsentStatus.ACTIVE) {
    return { ok: false, reasonCode: 'CONSENT_NOT_ACTIVE' };
  }
  if (consent.revokedAt) {
    return { ok: false, reasonCode: 'CONSENT_REVOKED' };
  }
  if (consent.expiresAt && consent.expiresAt.getTime() <= input.now.getTime()) {
    return { ok: false, reasonCode: 'CONSENT_EXPIRED' };
  }
  const providerRef = consent.providerVehicleRef?.trim();
  const mirrorExt = input.dimoExternalId?.trim();
  if (providerRef && mirrorExt && providerRef !== mirrorExt) {
    return { ok: false, reasonCode: 'CONSENT_PROVIDER_VEHICLE_REF_MISMATCH' };
  }
  return { ok: true };
}
