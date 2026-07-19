import { createHash } from 'crypto';
import { RECONCILIATION_AUDIT_ID } from './device-connection-episode-reconciliation.types';

const SALT = `${RECONCILIATION_AUDIT_ID}:vehicle`;

export function anonymizeVehicleId(vehicleId: string): string {
  const digest = createHash('sha256').update(`${SALT}:${vehicleId}`).digest('hex').slice(0, 8);
  return `VEHICLE_${digest.toUpperCase()}`;
}

/** Fixed aliases for committed fixture outputs — never map to production IDs. */
export const FIXTURE_VEHICLE_ALIASES = {
  INCIDENT: 'FIXTURE_INCIDENT_001',
  EXPLICIT_PLUG: 'FIXTURE_EXPLICIT_PLUG_002',
  STALE_SNAPSHOT: 'FIXTURE_STALE_SNAPSHOT_003',
  OEM_TELEMETRY: 'FIXTURE_OEM_TELEMETRY_004',
  BINDING_CHANGE: 'FIXTURE_BINDING_CHANGE_005',
  DUPLICATE: 'FIXTURE_DUPLICATE_006',
  OUT_OF_ORDER: 'FIXTURE_OUT_OF_ORDER_007',
  UNRESOLVED: 'FIXTURE_UNRESOLVED_008',
} as const;
