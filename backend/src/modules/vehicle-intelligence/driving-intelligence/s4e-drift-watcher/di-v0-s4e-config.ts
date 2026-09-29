import {
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4ControlPlaneConfig,
} from '../s4a-foundation/di-v0-s4a-control-plane';

/** Frozen contract horizon (`settlement.driftHorizonSeconds` in s4a-contract.v2.json). */
export const DI_V0_S4E_DRIFT_HORIZON_SECONDS = 864_000;

export const DI_V0_S4E_TUNING = {
  driftWatchIntervalMs: 5 * 60_000,
  defaultBatchLimit: 50,
  maxBatchLimit: 500,
} as const;

/**
 * Composition boundary for S4E: the only S4E file that reads `process.env` for control-plane flags.
 */
export function loadDiV0S4eControlPlaneConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DiV0S4ControlPlaneConfig {
  return parseDiV0S4ControlPlaneConfig(env);
}

/** Maintenance scheduling gate: contract `maintenanceActorsRequire` = MASTER ∧ NOT_KILLED (enforced in repository T11). */
export function isDiV0S4DriftWatcherConfigured(config: DiV0S4ControlPlaneConfig): boolean {
  return config.masterEnabled;
}
