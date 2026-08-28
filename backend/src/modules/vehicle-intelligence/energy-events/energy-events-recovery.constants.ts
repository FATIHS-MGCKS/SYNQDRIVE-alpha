/**
 * E3A — fixed outage/recovery window for read-only dry-run analysis.
 * Do not use unbounded Date.now() during recovery processing.
 */
export const ENERGY_EVENTS_OUTAGE_START_ISO = '2026-07-16T00:00:00.000Z';

/** Last known healthy refuel row ≈ 2026-07-16 05:52 UTC (audit). */
export const ENERGY_EVENTS_LAST_HEALTHY_REFUEL_ISO = '2026-07-16T05:52:00.000Z';

/** Last known healthy recharge row ≈ 2026-07-17 00:02 UTC (audit). */
export const ENERGY_EVENTS_LAST_HEALTHY_RECHARGE_ISO = '2026-07-17T00:02:00.000Z';

/** Fixed recovery cutoff for E3A dry-run (explicit, not runtime now). */
export const ENERGY_EVENTS_RECOVERY_CUTOFF_ISO = '2026-08-28T08:00:00.000Z';

/** Conservative bounded DIMO query window (24h). Inclusive start, exclusive end. */
export const ENERGY_EVENTS_RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Behavioral acceptance signature for CANONICAL_REFUEL_CASE (no production IDs).
 * Positive control shape: ~8 min, +16 L, ≤10 km apparent odometer spread.
 */
export const CANONICAL_REFUEL_ACCEPTANCE_BEHAVIOR = {
  monthPrefix: '2026-08',
  minDurationSeconds: 400,
  maxDurationSeconds: 600,
  minFuelDeltaLiters: 14,
  maxFuelDeltaLiters: 18,
  maxOdometerDeltaKm: 10,
} as const;

/** Proposed real backfill execution budget (E3A estimate only). */
export const ENERGY_EVENTS_BACKFILL_PROPOSED_CONCURRENCY = 2;
export const ENERGY_EVENTS_BACKFILL_INTER_REQUEST_DELAY_MS = 500;

export interface AuditedFleetSignalProfile {
  label: string;
  tokenId: number;
  provider: string;
  powertrain: 'ICE' | 'EV';
  relativeFuel: boolean;
  absoluteFuel: boolean;
  rechargeSoc: boolean;
  /** When true, DIMO token exchange is known to fail (e.g. HTTP 403). */
  knownDimoAccessFailure?: boolean;
}

/**
 * Synthetic QUICK-mode fleet only — used when DATABASE_URL is unavailable.
 * Production FULL runs load real vehicles from the database at runtime.
 */
export const QUICK_MODE_AUDIT_FLEET_PROFILES: AuditedFleetSignalProfile[] = [
  {
    label: 'AUDIT_CANONICAL_REFUEL',
    tokenId: 100001,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: true,
    absoluteFuel: true,
    rechargeSoc: false,
  },
  {
    label: 'AUDIT_ICE_A',
    tokenId: 100002,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: true,
    absoluteFuel: true,
    rechargeSoc: false,
  },
  {
    label: 'AUDIT_ICE_B',
    tokenId: 100003,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: false,
    absoluteFuel: true,
    rechargeSoc: false,
  },
  {
    label: 'AUDIT_ICE_C',
    tokenId: 100004,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: true,
    absoluteFuel: true,
    rechargeSoc: false,
  },
  {
    label: 'AUDIT_EV_A',
    tokenId: 100005,
    provider: 'LTE_R1',
    powertrain: 'EV',
    relativeFuel: false,
    absoluteFuel: false,
    rechargeSoc: true,
  },
  {
    label: 'AUDIT_INACCESSIBLE_ICE',
    tokenId: 100099,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: false,
    absoluteFuel: false,
    rechargeSoc: false,
    knownDimoAccessFailure: true,
  },
];

/** @deprecated Use QUICK_MODE_AUDIT_FLEET_PROFILES */
export const AUDITED_FLEET_SIGNAL_PROFILES = QUICK_MODE_AUDIT_FLEET_PROFILES;

/** Quick acceptance windows — each <= 24h. */
export const QUICK_ACCEPTANCE_WINDOWS: Array<{ from: string; to: string }> = [
  { from: '2026-08-23T00:00:00.000Z', to: '2026-08-24T00:00:00.000Z' },
  { from: '2026-06-15T00:00:00.000Z', to: '2026-06-16T00:00:00.000Z' },
  { from: '2026-06-17T00:00:00.000Z', to: '2026-06-18T00:00:00.000Z' },
];

export const QUICK_ARTIFACT_FILENAME = 'energy-events-recovery-quick-evidence-2026-08.json';
export const FULL_SANITIZED_SUMMARY_ARTIFACT_FILENAME =
  'energy-events-recovery-full-sanitized-summary-2026-08.json';

export function mechanismsForEnergyClass(
  energyClass:
    | 'REFUEL_CANDIDATE'
    | 'RECHARGE_CANDIDATE'
    | 'BOTH'
    | 'NO_ENERGY_SIGNAL'
    | 'DIMO_ACCESS_FAILED'
    | 'CAPABILITY_UNKNOWN',
): Array<'refuel' | 'recharge'> {
  switch (energyClass) {
    case 'REFUEL_CANDIDATE':
      return ['refuel'];
    case 'RECHARGE_CANDIDATE':
      return ['recharge'];
    case 'BOTH':
      return ['refuel', 'recharge'];
    default:
      return [];
  }
}
