export type {
  AvailabilityUiPresentation,
  ConnectivityUiPresentation,
  EnumFieldPresentation,
  HealthUiPresentation,
  MapVehicleOperationalUiProjectionOptions,
  OperatorUiPresentation,
  TechnicalDetailProjection,
  UiPresentationPresence,
  UiPresentationSlice,
  VehicleOperationalAudience,
  VehicleOperationalUiProjection,
} from './types';

export {
  mapPrimaryReasonPresentation,
  mapReasonCodeListPresentation,
  OPERATIONAL_PRIMARY_REASON_LABEL_KEYS,
  type OperationalTranslator,
  type PrimaryReasonPresentation,
} from './primary-reason-presentation';

export {
  mapAttentionUiPresentation,
  mapConnectivityUiPresentation,
  mapOperatorUiPresentation,
} from './map-connectivity-presentation';

export { mapAvailabilityUiPresentation } from './map-availability-ui-presentation';
export { mapHealthUiPresentation } from './map-health-ui-presentation';

export { mapVehicleOperationalUiProjection } from './map-vehicle-operational-ui-projection';
