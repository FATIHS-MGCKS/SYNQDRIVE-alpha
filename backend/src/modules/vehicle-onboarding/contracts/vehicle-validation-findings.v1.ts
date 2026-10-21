import { VEHICLE_VALIDATION_FINDINGS_VERSION } from './vo-document-versions';

export interface VehicleValidationFindingV1 {
  code: string;
  severity: 'INFO' | 'WARNING' | 'BLOCKING';
  message: string;
  field?: string;
}

export interface VehicleValidationFindingsV1 {
  version: typeof VEHICLE_VALIDATION_FINDINGS_VERSION;
  findings: VehicleValidationFindingV1[];
}
