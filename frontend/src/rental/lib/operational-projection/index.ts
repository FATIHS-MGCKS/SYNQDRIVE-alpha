export type {
  BusinessOperationalState,
  CanonicalField,
  CanonicalVehicleOperationalView,
  FieldPresence,
  OperationalFieldSource,
} from './types';

export {
  absentField,
  fieldPresence,
  isFieldPresent,
  presentField,
} from './provenance';

export {
  mapFleetMapToCanonicalVehicleOperationalView,
  mapFleetStoreVehicleToCanonicalVehicleOperationalView,
  readCanonicalField,
  type FleetStoreCanonicalVehicleInput,
  type MapCanonicalVehicleOperationalViewOptions,
} from './map-fleet-map-to-canonical';

export {
  mapVehicleOperationalUiProjection,
  type MapVehicleOperationalUiProjectionOptions,
  type VehicleOperationalUiProjection,
  type VehicleOperationalAudience,
} from './ui';
