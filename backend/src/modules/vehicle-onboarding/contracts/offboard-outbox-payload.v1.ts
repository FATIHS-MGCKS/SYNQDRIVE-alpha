import type { VehicleOffboardReasonCode } from './vehicle-offboard-reason.v1';

/** Current governed payload version for new VEHICLE_OFFBOARDED facts. */
export const OFFBOARD_OUTBOX_PAYLOAD_VERSION = 2;

/** Durable lifecycle fact: `vehicle.offboarded` (outbox event type VEHICLE_OFFBOARDED). */
export type VehicleOffboardedOutboxPayloadV1 = {
  version: 1;
  vehicleId: string;
  organizationId: string;
  registryLifecycle: 'OFFBOARDED';
  offboardedAt: string;
  reason: VehicleOffboardReasonCode;
};

export type VehicleOffboardedOutboxPayloadV2 = {
  version: 2;
  vehicleId: string;
  organizationId: string;
  registryLifecycle: 'OFFBOARDED';
  offboardedAt: string;
  reason: VehicleOffboardReasonCode;
  actorUserId: string | null;
};
