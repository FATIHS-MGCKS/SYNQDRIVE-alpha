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
  readCanonicalField,
  type MapCanonicalVehicleOperationalViewOptions,
} from './map-fleet-map-to-canonical';
