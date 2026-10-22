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
 * Value-support horizon end (inclusive bucket labels): **t+2**. This is NOT the full finalization
 * horizon — see {@link MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S} (t+6).
 * Input horizon start (inclusive): **t−2** when C1 may be needed; **t−1** for L3-only.
 */
export const MOTION_CORE_C4_INPUT_HORIZON_BACK_S = 2;
export const MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S = 2;

/**
 * Earliest label at which the C1/L3 **value** support is complete (t+2). Quality flags and outlier
 * coupling may still change until {@link MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S}.
 */
export function c4FinalizationHorizonEndLabel(centerLabel: string, plusSeconds: (label: string, s: number) => string): string {
  return plusSeconds(centerLabel, MOTION_CORE_C4_INPUT_HORIZON_FORWARD_S);
}

export const MOTION_CORE_C4_AVAILABILITY_MODE = 'OFFLINE_DELAYED_CAPABLE_NOT_LIVE_CAUSAL';

/**
 * Jitter signature on the **outgoing** leg t→t+1 consults neighbour legs at offsets +1..+3, i.e. leg
 * t+3 → t+4, so the jitter decision for center t needs grid label **t+4**. (The earlier value 3 only
 * covered the incoming leg t−1 and was contradicted by truncation on both Tesla development grids:
 * C4 quality at a label flipped SPARSE_SUPPORT ↔ JITTER_SUSPECT when t+4 arrived.)
 */
export const MOTION_CORE_C4_JITTER_COUPLED_HORIZON_FORWARD_S = 4;

/**
 * Full finalization horizon of a C4 sample at center t (inclusive grid labels), derived from every
 * forward-looking dependency in the chain:
 * - L3-direct / C1 points: t+1 / t+2
 * - jitter signature of legs t−2..t+1 (C1 window flag): leg (t+1)+3 → endpoint **t+5**
 * - chord-outlier rejection of point t+2 (removes it from the C1 window): neighbour legs
 *   (t+2)+2, (t+2)+3 → endpoint **t+6**
 * Labels beyond t+6 cannot change value, quality, support or flags of a finalized sample.
 */
export const MOTION_CORE_C4_FULL_FINALIZATION_HORIZON_FORWARD_S = 6;

