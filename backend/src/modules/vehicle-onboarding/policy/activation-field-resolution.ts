import type { FuelType } from '@prisma/client';
import type { VehicleIdentityDraftV1 } from '../contracts/vehicle-identity-draft.v1';
import type { VehicleAdministrativeBaselineDraftV1 } from '../contracts/vehicle-admin-baseline-draft.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

const FUEL_MAP: Record<string, FuelType> = {
  GASOLINE: 'GASOLINE',
  PETROL: 'GASOLINE',
  DIESEL: 'DIESEL',
  ELECTRIC: 'ELECTRIC',
  EV: 'ELECTRIC',
  HYBRID: 'HYBRID',
  PLUGIN_HYBRID: 'PLUGIN_HYBRID',
  OTHER: 'OTHER',
};

export interface ResolvedActivationVehicleFields {
  vin: string | null;
  vinProvenance: 'PROVIDER' | 'MANUAL' | 'DOCUMENT' | 'LEGACY_UNKNOWN';
  vinVerificationState: 'UNVERIFIED' | 'VERIFIED' | 'CONFLICT' | 'LEGACY_UNKNOWN';
  make: string;
  model: string;
  year: number;
  fuelType: FuelType;
  vehicleName: string | null;
  licensePlate: string | null;
  stationId: string | null;
  notes: string | null;
}

export function resolveFuelType(raw: string | null | undefined): FuelType {
  if (!raw) return 'OTHER';
  const key = raw.trim().toUpperCase().replace(/-/g, '_');
  return FUEL_MAP[key] ?? 'OTHER';
}

export function resolveActivationVehicleFields(
  identity: VehicleIdentityDraftV1,
  admin: VehicleAdministrativeBaselineDraftV1 | null,
): ResolvedActivationVehicleFields {
  const make = identity.make?.trim();
  const model = identity.model?.trim();
  const year = identity.year;

  if (!make || !model || year == null || Number.isNaN(year)) {
    throw new VehicleOnboardingError(
      'SCHEMA_REQUIRED_FIELDS_MISSING',
      'Activation requires resolvable make, model, and year',
      { make: !!make, model: !!model, year },
    );
  }

  const vin = identity.vin?.trim() || null;
  if (vin && (vin.startsWith('DIMO-') || vin.length === 0)) {
    throw new VehicleOnboardingError(
      'ACTIVATION_PRECONDITION_FAILED',
      'Invalid VIN value for activation',
    );
  }

  return {
    vin,
    vinProvenance: identity.vinProvenance ?? 'LEGACY_UNKNOWN',
    vinVerificationState: identity.vinVerificationState ?? 'LEGACY_UNKNOWN',
    make,
    model,
    year,
    fuelType: resolveFuelType(identity.fuelType),
    vehicleName: admin?.vehicleName?.trim() || null,
    licensePlate: admin?.licensePlate?.trim() || null,
    stationId: admin?.stationId?.trim() || null,
    notes: admin?.notes?.trim() || null,
  };
}

export function assertCompositeVinConsistency(
  drafts: VehicleIdentityDraftV1[],
): void {
  const vins = drafts.map((d) => d.vin?.trim() || null).filter((v): v is string => !!v);
  const unique = new Set(vins);
  if (unique.size > 1) {
    throw new VehicleOnboardingError(
      'IDENTITY_REVIEW_REQUIRED',
      'Source refs disagree on VIN evidence',
      { vins: [...unique] },
    );
  }
}
