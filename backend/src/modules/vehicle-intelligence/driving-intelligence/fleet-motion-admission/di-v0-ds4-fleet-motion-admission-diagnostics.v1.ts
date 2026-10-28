import { Logger } from '@nestjs/common';

const logger = new Logger('Ds4FleetMotionAdmissionDiagnosticsV1');

export type Ds4FleetMotionAdmissionDiagnosticKindV1 =
  | 'S4_DISCOVERY_NOT_CONFIGURED'
  | 'S4_WORKER_NOT_CONFIGURED'
  | 'MOTION_CORE_DISCOVERY_NOT_CONFIGURED'
  | 'LEGACY_ALLOWLIST_EMPTY'
  | 'GLOBAL_ROLLOUT_OFF'
  | 'GLOBAL_ROLLOUT_ON'
  | 'TENANCY_MISMATCH'
  | 'BOUNDARY_ADMISSION_REJECTED'
  | 'PROVIDER_CAPABILITY_UNKNOWN'
  | 'PROVIDER_CAPABILITY_UNSUPPORTED'
  | 'MISSING_EVIDENCE'
  | 'S4_ENABLEMENT_FAILED'
  | 'MOTION_CORE_ENABLEMENT_FAILED';

export type Ds4FleetMotionAdmissionDiagnosticV1 = {
  kind: Ds4FleetMotionAdmissionDiagnosticKindV1;
  organizationId?: string;
  vehicleId?: string;
  tripId?: string;
  detail?: string;
};

/** Bounded operational log line (no high-cardinality metrics). */
export function emitDs4FleetMotionAdmissionDiagnosticV1(event: Ds4FleetMotionAdmissionDiagnosticV1): void {
  const scope = [
    event.organizationId ? `org=${event.organizationId}` : null,
    event.vehicleId ? `vehicle=${event.vehicleId}` : null,
    event.tripId ? `trip=${event.tripId}` : null,
    event.detail ? `detail=${event.detail.slice(0, 120)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  logger.debug(`[${event.kind}]${scope ? ` ${scope}` : ''}`);
}
