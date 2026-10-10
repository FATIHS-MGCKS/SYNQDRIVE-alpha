/**
 * EXP-021 — S4 fleet rollout waves (ops authority; Production inventory 2026-10-10 read-only).
 */
import {
  DI_V0_S4_ENV_ALLOWLISTS,
  parseDiV0S4Allowlist,
  parseDiV0S4ControlPlaneConfig,
} from '../../../src/modules/vehicle-intelligence/driving-intelligence/s4a-foundation/di-v0-s4a-control-plane';
import {
  CANONICAL_TINY_ORGANIZATION_ID,
  CANONICAL_TINY_VEHICLE_ID,
} from '../di-v0-s4-fresh-tiny-staging-production/di-v0-s4-fresh-tiny-staging-authority';

export const DI_S4_GATE6_ROLLOUT_WAVE_ENV = 'DI_S4_GATE6_ROLLOUT_WAVE';

/** Production-verified LTE_R1 + active DIMO consent + dimo_vehicle_id (2026-10-10). */
export const S4_ELIGIBLE_FLEET_VEHICLE_IDS = [
  '19fedd4b-c4e8-4de8-a125-dab293326e7e',
  '68868291-5478-42cd-b0c4-cc77b2a78e21',
  '8c850ff1-4201-432b-af2e-2711dbc7ca48',
  'a60c0749-a7cd-494e-b5b9-dea3c6b97d63',
  CANONICAL_TINY_VEHICLE_ID,
  'c43c3b45-b911-498f-baf9-4376dd585588',
] as const;

/** Active vehicles without LTE_R1 / DIMO — must remain outside S4 allowlists. */
export const S4_UNSUPPORTED_VEHICLE_IDS = [
  '17ae4a96-f658-43d4-b262-65d4624a5320',
  '1469e60d-afba-4c35-81ad-a38b02544102',
  'staging-synthetic-vehicle',
] as const;

export const S4_FLEET_ORGANIZATION_ID = CANONICAL_TINY_ORGANIZATION_ID;

export const ROLLOUT_WAVE_VEHICLE_IDS: Record<1 | 2 | 3, readonly string[]> = {
  1: [CANONICAL_TINY_VEHICLE_ID],
  2: [CANONICAL_TINY_VEHICLE_ID, '19fedd4b-c4e8-4de8-a125-dab293326e7e', '68868291-5478-42cd-b0c4-cc77b2a78e21'],
  3: S4_ELIGIBLE_FLEET_VEHICLE_IDS,
};

export type RolloutWave = 1 | 2 | 3;

export type FleetRolloutFailure =
  | 'ROLLOUT_WAVE_INVALID'
  | 'ROLLOUT_WAVE_MISSING'
  | 'ORG_ALLOWLIST_MISMATCH'
  | 'VEHICLE_ALLOWLIST_MISMATCH'
  | 'VEHICLE_ALLOWLIST_EXCEEDS_WAVE'
  | 'VEHICLE_ALLOWLIST_BELOW_WAVE'
  | 'UNSUPPORTED_VEHICLE_IN_ALLOWLIST'
  | 'NATIVE_MUST_REMAIN_OFF';

export function parseRolloutWave(value: string | undefined): RolloutWave | undefined {
  const v = (value ?? '').trim();
  if (v === '1') return 1;
  if (v === '2') return 2;
  if (v === '3') return 3;
  return undefined;
}

export function evaluateRolloutWaveAllowlists(
  envMap: Readonly<Record<string, string | undefined>>,
  wave: RolloutWave,
): { ok: true } | { ok: false; failures: FleetRolloutFailure[] } {
  const failures: FleetRolloutFailure[] = [];
  const cfg = parseDiV0S4ControlPlaneConfig(envMap);
  if (cfg.nativeEnabled) failures.push('NATIVE_MUST_REMAIN_OFF');

  const expectedVehicles = new Set(ROLLOUT_WAVE_VEHICLE_IDS[wave]);
  const expectedOrgs = new Set([S4_FLEET_ORGANIZATION_ID]);

  if (!setsEqual(cfg.organizationAllowlist, expectedOrgs)) {
    failures.push('ORG_ALLOWLIST_MISMATCH');
  }
  if (!setsEqual(cfg.vehicleAllowlist, expectedVehicles)) {
    if (cfg.vehicleAllowlist.size > expectedVehicles.size) failures.push('VEHICLE_ALLOWLIST_EXCEEDS_WAVE');
    else if (cfg.vehicleAllowlist.size < expectedVehicles.size) failures.push('VEHICLE_ALLOWLIST_BELOW_WAVE');
    else failures.push('VEHICLE_ALLOWLIST_MISMATCH');
  }

  for (const id of cfg.vehicleAllowlist) {
    if ((S4_UNSUPPORTED_VEHICLE_IDS as readonly string[]).includes(id)) {
      failures.push('UNSUPPORTED_VEHICLE_IN_ALLOWLIST');
    }
    if (!(S4_ELIGIBLE_FLEET_VEHICLE_IDS as readonly string[]).includes(id)) {
      failures.push('UNSUPPORTED_VEHICLE_IN_ALLOWLIST');
    }
  }

  return failures.length ? { ok: false, failures } : { ok: true };
}

function setsEqual(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Measurable wave progression gates (observed via ops / metrics; fail-closed on breach). */
export const ROLLOUT_WAVE_HEALTH_CRITERIA = {
  tripBoundariesCorrect: 'Canonical trip start/end for allowlisted vehicles only',
  noDuplicateWorkItems: 'At most one active PRIMARY work item per trip boundary',
  tenantIsolation: 'No di_v0_s4_work_items outside rollout org/vehicle allowlists',
  workerAndDbHealthy: 'Replica health 200; no sustained S4_PERSISTENCE_READ_FAILED',
  providerBudgetHealthy: 'synqdrive_dimo_global_budget_enabled=1; no sustained budget cooldown',
  s4OutputsProduced: 'Evidence snapshots / completed work items when trips occur',
  latencyAndErrors: 'Within prior S4F pilot thresholds documented in Gate-6 monitoring',
} as const;

export function formatAllowlistEnvValue(ids: readonly string[]): string {
  return ids.join(',');
}

export function expectedOrganizationAllowlistValue(): string {
  return S4_FLEET_ORGANIZATION_ID;
}

export function expectedVehicleAllowlistForWave(wave: RolloutWave): string {
  return formatAllowlistEnvValue(ROLLOUT_WAVE_VEHICLE_IDS[wave]);
}
