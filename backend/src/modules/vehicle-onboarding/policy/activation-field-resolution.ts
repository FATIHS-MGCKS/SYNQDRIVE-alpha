import type { FuelType } from '@prisma/client';
import type { VehicleIdentityDraftV1 } from '../contracts/vehicle-identity-draft.v1';
import type { VehicleAdministrativeBaselineDraftV1 } from '../contracts/vehicle-admin-baseline-draft.v1';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';

const FUEL_ALIASES: Record<string, FuelType> = {
  GASOLINE: 'GASOLINE',
  PETROL: 'GASOLINE',
  GAS: 'GASOLINE',
  DIESEL: 'DIESEL',
  ELECTRIC: 'ELECTRIC',
  EV: 'ELECTRIC',
  HYBRID: 'HYBRID',
  PLUGIN_HYBRID: 'PLUGIN_HYBRID',
  PHEV: 'PLUGIN_HYBRID',
  PLUGINHYBRID: 'PLUGIN_HYBRID',
  OTHER: 'OTHER',
};

const MIN_VEHICLE_YEAR = 1980;

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

export function resolveFuelTypeStrict(raw: string | null | undefined): FuelType {
  if (raw == null || String(raw).trim() === '') {
    throw new VehicleOnboardingError(
      'SCHEMA_REQUIRED_FIELDS_MISSING',
      'Activation requires explicit fuel type',
    );
  }
  const key = String(raw).trim().toUpperCase().replace(/-/g, '_').replace(/\s+/g, '');
  const mapped = FUEL_ALIASES[key];
  if (!mapped) {
    throw new VehicleOnboardingError(
      'UNSUPPORTED_FUEL_TYPE',
      'Unrecognized fuel type for activation',
      { raw },
    );
  }
  return mapped;
}

export function validateActivationYear(year: number): number {
  if (!Number.isInteger(year)) {
    throw new VehicleOnboardingError('SCHEMA_REQUIRED_FIELDS_MISSING', 'Year must be an integer');
  }
  if (year < MIN_VEHICLE_YEAR) {
    throw new VehicleOnboardingError('SCHEMA_REQUIRED_FIELDS_MISSING', 'Year is not plausible');
  }
  const maxYear = new Date().getFullYear() + 1;
  if (year > maxYear) {
    throw new VehicleOnboardingError('SCHEMA_REQUIRED_FIELDS_MISSING', 'Year is not plausible');
  }
  return year;
}

export function resolveActivationVehicleFields(
  identity: VehicleIdentityDraftV1,
  admin: VehicleAdministrativeBaselineDraftV1 | null,
): ResolvedActivationVehicleFields {
  const make = identity.make?.trim();
  const model = identity.model?.trim();
  const yearRaw = identity.year;

  if (!make || !model || yearRaw == null || Number.isNaN(yearRaw)) {
    throw new VehicleOnboardingError(
      'SCHEMA_REQUIRED_FIELDS_MISSING',
      'Activation requires resolvable make, model, and year',
      { make: !!make, model: !!model, year: yearRaw },
    );
  }

  const year = validateActivationYear(yearRaw);

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
    fuelType: resolveFuelTypeStrict(identity.fuelType),
    vehicleName: admin?.vehicleName?.trim() || null,
    licensePlate: admin?.licensePlate?.trim() || null,
    stationId: admin?.stationId?.trim() || null,
    notes: admin?.notes?.trim() || null,
  };
}
