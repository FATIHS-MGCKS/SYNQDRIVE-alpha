import { VEHICLE_ADMIN_BASELINE_DRAFT_VERSION } from './vo-document-versions';

export interface VehicleAdministrativeBaselineDraftV1 {
  version: typeof VEHICLE_ADMIN_BASELINE_DRAFT_VERSION;
  vehicleName: string | null;
  licensePlate: string | null;
  stationId: string | null;
  notes: string | null;
}
