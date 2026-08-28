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

/** Canonical acceptance fixtures. */
export const KS_MX_2024_TOKEN_ID = 187336;
export const KS_MX_2024_CANONICAL_REFUEL_START = '2026-08-23T16:15:15.000Z';
export const TESLA_KS_FH_660E_TOKEN_ID = 186946;
export const VW_GOLF_ICE_TOKEN_ID = 190497;

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

/** Audited DIMO-connected fleet from E2 inventory + known access failures. */
export const AUDITED_FLEET_SIGNAL_PROFILES: AuditedFleetSignalProfile[] = [
  {
    label: 'KS MX 2024',
    tokenId: 187336,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: true,
    absoluteFuel: true,
    rechargeSoc: false,
  },
  {
    label: 'VW Arteon ICE',
    tokenId: 187784,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: true,
    absoluteFuel: true,
    rechargeSoc: false,
  },
  {
    label: 'Audi A4 (KS MS 661)',
    tokenId: 187361,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: false,
    absoluteFuel: true,
    rechargeSoc: false,
  },
  {
    label: 'VW Tiguan ICE',
    tokenId: 192922,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: true,
    absoluteFuel: true,
    rechargeSoc: false,
  },
  {
    label: 'KS FH 660E Tesla',
    tokenId: 186946,
    provider: 'LTE_R1',
    powertrain: 'EV',
    relativeFuel: false,
    absoluteFuel: false,
    rechargeSoc: true,
  },
  {
    label: 'VW Golf ICE',
    tokenId: 190497,
    provider: 'LTE_R1',
    powertrain: 'ICE',
    relativeFuel: false,
    absoluteFuel: false,
    rechargeSoc: false,
    knownDimoAccessFailure: true,
  },
];

/** Quick acceptance windows — each <= 24h. */
export const QUICK_ACCEPTANCE_WINDOWS: Array<{ from: string; to: string }> = [
  { from: '2026-08-23T00:00:00.000Z', to: '2026-08-24T00:00:00.000Z' },
  { from: '2026-06-15T00:00:00.000Z', to: '2026-06-16T00:00:00.000Z' },
  { from: '2026-06-17T00:00:00.000Z', to: '2026-06-18T00:00:00.000Z' },
];

export const QUICK_ARTIFACT_FILENAME = 'energy-events-recovery-quick-evidence-2026-08.json';
export const FULL_DB_ARTIFACT_FILENAME = 'energy-events-recovery-full-db-preview-2026-08.json';

export function mechanismsForEnergyClass(
  energyClass:
    | 'REFUEL_CANDIDATE'
    | 'RECHARGE_CANDIDATE'
    | 'BOTH'
    | 'NO_ENERGY_SIGNAL'
    | 'DIMO_ACCESS_FAILED',
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
