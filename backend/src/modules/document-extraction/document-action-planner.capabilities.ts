import type { DocumentActionType } from '@prisma/client';
import type { DocumentDownstreamCapabilities } from './document-action-planner.types';

export const DEFAULT_DOCUMENT_DOWNSTREAM_CAPABILITIES: DocumentDownstreamCapabilities = {
  serviceEvents: true,
  vehicleInspections: true,
  invoices: true,
  fines: true,
  damages: true,
  tireMeasurements: true,
  brakeEvidence: true,
  batteryEvidence: true,
  tasks: true,
};

export const DOCUMENT_ACTION_CAPABILITY_KEYS: Record<
  DocumentActionType,
  keyof DocumentDownstreamCapabilities
> = {
  CREATE_SERVICE_EVENT: 'serviceEvents',
  UPDATE_VEHICLE_INSPECTION: 'vehicleInspections',
  CREATE_INVOICE: 'invoices',
  CREATE_FINE: 'fines',
  CREATE_DAMAGE: 'damages',
  RECORD_TIRE_MEASUREMENT: 'tireMeasurements',
  RECORD_BRAKE_EVIDENCE: 'brakeEvidence',
  RECORD_BATTERY_EVIDENCE: 'batteryEvidence',
  ARCHIVE_ONLY: 'serviceEvents',
  SUGGEST_TASK: 'tasks',
};

export function isDownstreamCapabilityEnabled(
  capabilities: DocumentDownstreamCapabilities,
  capabilityKey: keyof DocumentDownstreamCapabilities,
): boolean {
  return capabilities[capabilityKey] === true;
}
