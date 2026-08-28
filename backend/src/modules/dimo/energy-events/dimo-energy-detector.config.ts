/**
 * E2 — centralized DIMO native energy-event detector configuration.
 *
 * Calibration evidence: docs/architecture/ENERGY_EVENTS_E2_DETECTOR_CALIBRATION_2026-08.md
 * Live matrix artifact: scripts/ops/calibrate-energy-event-detectors.ts
 */

/** Version stamp for persisted rawDetectionMeta / ops correlation (future E3). */
export const DIMO_ENERGY_DETECTOR_CONFIG_VERSION = 'e2-2026-08';

/**
 * DIMO RefuelDetector `config` argument (Telemetry GraphQL `segments`).
 * Verified live Aug 2026 — only `minIncreasePercent` exercised; other fields
 * not confirmed in this environment (DIMO MCP unavailable).
 */
export interface DimoRefuelDetectorConfig {
  minIncreasePercent: number;
}

/**
 * DIMO RechargeDetector `config` argument shape (subset verified).
 * Production uses DIMO defaults — Tesla EV audit (tokenId 186946, Jun 2026)
 * returned 8 reliable recharge segments with default config; Aug 2026 sweep
 * showed no benefit from minIncreasePercent tuning.
 */
export interface DimoRechargeDetectorConfig {
  minIncreasePercent?: number;
}

/**
 * Production refuel sensitivity.
 *
 * KS MX 2024 canonical refuel (tokenId 187336, 2026-08-23, ~13%→~42%):
 * - default config: 0 segments in 22–24 Aug window
 * - minIncreasePercent 2–10: identical single segment (16:15:15–16:23:16 UTC)
 *
 * 5% chosen (not 2%) as conservative margin identical to audit reference
 * across Apr–Aug 2026 monthly windows — no extra segments vs default in months
 * where default already detects large refuels; fixes default-blind cases.
 */
export const DIMO_PRODUCTION_REFUEL_DETECTOR_CONFIG: DimoRefuelDetectorConfig = {
  minIncreasePercent: 5,
};

/** Recharge: DIMO default detector (omit `config` in GraphQL). */
export const DIMO_PRODUCTION_RECHARGE_DETECTOR_CONFIG:
  | DimoRechargeDetectorConfig
  | undefined = undefined;

export function renderDimoDetectorConfigArg(
  config: DimoRefuelDetectorConfig | DimoRechargeDetectorConfig | undefined,
): string {
  if (!config || config.minIncreasePercent == null) return '';
  return `\n        config: { minIncreasePercent: ${config.minIncreasePercent} }`;
}
