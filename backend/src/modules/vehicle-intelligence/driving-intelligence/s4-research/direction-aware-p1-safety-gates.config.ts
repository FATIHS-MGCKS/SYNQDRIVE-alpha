/** EXP021 B6 — offline research safety gates for Direction-Aware P1 post-Viterbi outcomes. */
export type S4DirectionAwareP1SafetyGateConfig = {
  /** Max ratio routeDistanceM / gpsChordM to accept CONFIRMED way change in one step. */
  maxRouteToChordRatio: number;
  /** Minimum route distance (m) before ratio check applies. */
  minRouteDistanceForRatioM: number;
  /** Max implied speed (km/h) from route distance / dt without downgrade. */
  maxRouteImpliedSpeedKmh: number;
  /** GPS displacement below this (m) with stationary motion triggers stationary gate. */
  stationaryDisplacementThresholdM: number;
  /** Displacement above this (m) allows stationary gate bypass when directed route CONNECTED. */
  turnDisplacementBypassM: number;
  /** Directed route max distance (m) for turn bypass under stationary shadow. */
  turnRouteDistanceBypassM: number;
};

export const DEFAULT_S4_DIRECTION_AWARE_P1_SAFETY_GATE_CONFIG: S4DirectionAwareP1SafetyGateConfig = {
  maxRouteToChordRatio: 4,
  minRouteDistanceForRatioM: 80,
  maxRouteImpliedSpeedKmh: 130,
  stationaryDisplacementThresholdM: 3,
  turnDisplacementBypassM: 5,
  turnRouteDistanceBypassM: 35,
};
