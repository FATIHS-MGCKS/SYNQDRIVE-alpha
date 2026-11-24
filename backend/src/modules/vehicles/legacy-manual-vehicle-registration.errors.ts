import { ConflictException } from '@nestjs/common';

export const MANUAL_VEHICLE_REGISTRATION_RETIRED_CODE = 'MANUAL_VEHICLE_REGISTRATION_RETIRED';

export const CANONICAL_VEHICLE_REGISTRATION_CHANNELS = ['DIMO', 'HIGH_MOBILITY'] as const;

export const CANONICAL_DIMO_REGISTRATION_ROUTE =
  'POST /organizations/:orgId/vehicles/register-from-dimo';

export const CANONICAL_HM_ONLY_REGISTRATION_ROUTE = 'POST /vehicles/register/hm-only';

export function legacyManualVehicleRegistrationDisabledException(): ConflictException {
  return new ConflictException({
    code: MANUAL_VEHICLE_REGISTRATION_RETIRED_CODE,
    message:
      'Manual vehicle registration is retired. Register new vehicles only through DIMO or High Mobility.',
    action: 'USE_PROVIDER_REGISTRATION_CHANNEL',
    allowedChannels: [...CANONICAL_VEHICLE_REGISTRATION_CHANNELS],
    canonicalRoutes: {
      dimo: CANONICAL_DIMO_REGISTRATION_ROUTE,
      highMobility: CANONICAL_HM_ONLY_REGISTRATION_ROUTE,
    },
  });
}