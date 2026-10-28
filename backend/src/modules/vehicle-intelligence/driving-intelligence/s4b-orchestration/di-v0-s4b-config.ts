import { hostname } from 'os';
import { randomUUID } from 'crypto';
import {
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
} from '../s4a-foundation/di-v0-s4a-control-plane';
import {
  isDiV0S4DiscoverySchedulingConfiguredV1,
  isDiV0S4WorkerSchedulingConfiguredV1,
  parseDiV0Ds4FleetMotionAdmissionPolicyV1,
  type DiV0Ds4FleetMotionAdmissionPolicySnapshotV1,
} from '../fleet-motion-admission/di-v0-ds4-fleet-motion-admission-policy.v1';
import {
  isDiV0S4DiscoveryContainmentAvailable,
  loadDiV0S4bDiscoveryContainment,
  type DiV0S4DiscoveryContainmentState,
} from './di-v0-s4b-discovery-containment';

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

/** Parsed once at Nest composition; not re-read until process restart. */
export function loadDiV0S4bDiscoveryContainmentAtCompositionBoundary(): DiV0S4DiscoveryContainmentState {
  return loadDiV0S4bDiscoveryContainment(process.env);
}

/** Parsed once at Nest composition; not re-read until process restart. */
export function loadDiV0Ds4FleetMotionAdmissionPolicyAtCompositionBoundary(): DiV0Ds4FleetMotionAdmissionPolicySnapshotV1 {
  return parseDiV0Ds4FleetMotionAdmissionPolicyV1(process.env);
}

/** S4B scheduling constants. Not contract limits: lease/heartbeat/budget come from DI_V0_S4_LIMITS. */
export const DI_V0_S4B_TUNING = {
  discoveryIntervalMs: 5 * 60_000,
  discoveryBatchLimit: 50,
  discoveryMaxBatchLimit: 500,
  claimLoopIntervalMs: 30_000,
} as const;

/** True only when a discovery pass could create anything; otherwise no DB access is attempted. */
export function isDiV0S4DiscoveryConfigured(
  config: DiV0S4ControlPlaneConfig,
  containment: DiV0S4DiscoveryContainmentState = loadDiV0S4bDiscoveryContainmentAtCompositionBoundary(),
  fleetMotionPolicy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1 = loadDiV0Ds4FleetMotionAdmissionPolicyAtCompositionBoundary(),
): boolean {
  return (
    isDiV0S4DiscoverySchedulingConfiguredV1(config, fleetMotionPolicy) &&
    isDiV0S4DiscoveryContainmentAvailable(containment)
  );
}

/** Mirrors the `claim()` pre-transaction gate plus legacy allowlists when global rollout is OFF. */
export function isDiV0S4WorkerConfigured(
  config: DiV0S4ControlPlaneConfig,
  fleetMotionPolicy: DiV0Ds4FleetMotionAdmissionPolicySnapshotV1 = loadDiV0Ds4FleetMotionAdmissionPolicyAtCompositionBoundary(),
): boolean {
  return isDiV0S4WorkerSchedulingConfiguredV1(config, fleetMotionPolicy);
}

const LEASE_OWNER_UNSAFE = /[^A-Za-z0-9_-]/g;

/** Lease owner matching the repository pattern `^[A-Za-z0-9_-]{1,128}$`; identity only, never authority. */
export function buildDiV0S4LeaseOwner(host: string = hostname(), pid: number = process.pid): string {
  const safeHost = host.replace(LEASE_OWNER_UNSAFE, '_').slice(0, 64) || 'host';
  return `s4b-${safeHost}-${pid}-${randomUUID().slice(0, 8)}`;
}
