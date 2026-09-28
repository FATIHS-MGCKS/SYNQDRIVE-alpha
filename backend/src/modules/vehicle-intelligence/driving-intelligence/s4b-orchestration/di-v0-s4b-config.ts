import { hostname } from 'os';
import { randomUUID } from 'crypto';
import {
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
} from '../s4a-foundation/di-v0-s4a-control-plane';

/**
 * Composition boundary for S4B: the only S4B file that touches `process.env`. The control plane
 * itself stays pure (`di-v0-s4a-control-plane.ts`); this reads one snapshot at construction and
 * never re-reads, so a flag change needs a process restart (S4A_CONTROL_PLANE §2).
 */
export function loadDiV0S4bControlPlaneConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiV0S4ControlPlaneConfig {
  return parseDiV0S4ControlPlaneConfig(env);
}

/** S4B scheduling constants. Not contract limits: lease/heartbeat/budget come from DI_V0_S4_LIMITS. */
export const DI_V0_S4B_TUNING = {
  discoveryIntervalMs: 5 * 60_000,
  discoveryBatchLimit: 50,
  discoveryMaxBatchLimit: 500,
  claimLoopIntervalMs: 30_000,
} as const;

/** True only when a discovery pass could create anything; otherwise no DB access is attempted. */
export function isDiV0S4DiscoveryConfigured(config: DiV0S4ControlPlaneConfig): boolean {
  return (
    config.masterEnabled &&
    config.discoveryEnabled &&
    config.positionEnabled &&
    config.organizationAllowlist.size > 0 &&
    config.vehicleAllowlist.size > 0
  );
}

/** Mirrors the `claim()` pre-transaction gate plus non-empty allowlists. */
export function isDiV0S4WorkerConfigured(config: DiV0S4ControlPlaneConfig): boolean {
  return (
    config.masterEnabled &&
    config.workerEnabled &&
    config.positionEnabled &&
    config.organizationAllowlist.size > 0 &&
    config.vehicleAllowlist.size > 0
  );
}

const LEASE_OWNER_UNSAFE = /[^A-Za-z0-9_-]/g;

/** Lease owner matching the repository pattern `^[A-Za-z0-9_-]{1,128}$`; identity only, never authority. */
export function buildDiV0S4LeaseOwner(host: string = hostname(), pid: number = process.pid): string {
  const safeHost = host.replace(LEASE_OWNER_UNSAFE, '_').slice(0, 64) || 'host';
  return `s4b-${safeHost}-${pid}-${randomUUID().slice(0, 8)}`;
}
