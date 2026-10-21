/**
 * C4 adaptive L3 — explicit time / input-horizon semantics (offline, delayed-capable candidate).
 *
 * Estimate anchor: bucket label `t` (1 Hz bucket start), same as frozen L3.
 */
export const MOTION_CORE_C4_ESTIMATE_ANCHOR = 'BUCKET_LABEL_START_UTC';

/** C1 robust path slope window half-width (labels). */
export const MOTION_CORE_C4_C1_WINDOW_HALF_S = 2;

/**
 * Earliest calendar label that must be present in the input grid to finalize C4 at center `t`:
 * - L3-direct branch: t−1, t, t+1
 * - C1 fallback: present points in [t−2, t+2] with both sides
 * - Jitter on outgoing leg t→t+1 inspects ROW_ABSENT at t−1 and t+2
 *
 * Full input horizon end (inclusive bucket labels): **t+2**
 * Full input horizon start (inclusive): **t−2** when C1 may be needed; **t−1** for L3-only.
 */
export const MOTION_CORE_C4_INPUT_HORIZON_BACK_S = 2;
export const MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S = 2;

/** Labels beyond this offset from a finalized `t` must not change an already-finalized sample. */
export function c4FinalizationHorizonEndLabel(centerLabel: string, plusSeconds: (label: string, s: number) => string): string {
  return plusSeconds(centerLabel, MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S);
}

export const MOTION_CORE_C4_AVAILABILITY_MODE = 'OFFLINE_DELAYED_CAPABLE_NOT_LIVE_CAUSAL';
