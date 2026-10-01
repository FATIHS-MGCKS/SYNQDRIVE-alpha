import type { VehicleOffboardReasonCode } from './vehicle-offboard-reason.v1';

export const OFFBOARD_OUTBOX_PAYLOAD_VERSION = 1;

/** Durable lifecycle fact: `vehicle.offboarded` (outbox event type VEHICLE_OFFBOARDED). */
export type VehicleOffboardedOutboxPayloadV1 = {
  version: typeof OFFBOARD_OUTBOX_PAYLOAD_VERSION;
  vehicleId: string;
  organizationId: string;
  registryLifecycle: 'OFFBOARDED';
  offboardedAt: string;
  reason: VehicleOffboardReasonCode;
};
