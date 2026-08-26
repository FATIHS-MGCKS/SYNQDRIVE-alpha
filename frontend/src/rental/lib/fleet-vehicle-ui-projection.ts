import type { VehicleData } from '../data/vehicles';
import { de } from '../i18n/translations/de';
import { en } from '../i18n/translations/en';
import type { TranslationKey } from '../i18n/translations/en';
import {
  mapFleetStoreVehicleToCanonicalVehicleOperationalView,
  mapVehicleOperationalUiProjection,
  type VehicleOperationalUiProjection,
} from './operational-projection';
import type { FleetMapVehicleRow } from './fleet-map-vehicle-mapper';

export type FleetProjectionVehicle = VehicleData &
  Pick<FleetMapVehicleRow, 'connectivityRuntime'>;

function tFor(locale: 'en' | 'de'): (key: TranslationKey) => string {
  const dict = locale === 'de' ? de : en;
  return (key: TranslationKey) => dict[key] ?? key;
}

export function buildFleetVehicleUiProjection(
  vehicle: FleetProjectionVehicle,
  options: { locale?: 'en' | 'de' } = {},
): VehicleOperationalUiProjection {
  const canonical = mapFleetStoreVehicleToCanonicalVehicleOperationalView({
    id: vehicle.id,
    connectivityRuntime: vehicle.connectivityRuntime,
    operationalAvailability: vehicle.operationalAvailability,
    healthEvaluation: vehicle.healthEvaluation,
  });
  return mapVehicleOperationalUiProjection(canonical, {
    audience: 'org_admin',
    t: tFor(options.locale ?? 'de'),
  });
}
