/** Tunables for offline route-aware Viterbi R1 (research only). */
export type S4RouteAwareResearchConfig = {
  /** Max Dijkstra edge expansions per transition query. */
  maxRoutingExpansions: number;
  /** Abort routing search beyond this graph distance (m). */
  maxRouteDistanceM: number;
  /** L3 speed treated as unreliable below this km/h (standstill / jitter). */
  l3MinTrustSpeedKmh: number;
  /** Allow required average speed up to this factor above L3 reference. */
  l3SpeedSlackFactor: number;
  /** Hard cap for plausible average speed (km/h) when L3 missing. */
  fallbackMaxPlausibleSpeedKmh: number;
  /** Cost weight: route distance (dimensionless, per meter). */
  weightRouteDistancePerM: number;
  /** Cost weight: time plausibility violation (per km/h over slack). */
  weightTimeViolationPerKmh: number;
  /** Cost weight: topology uncertainty lump per transition. */
  weightTopologyUncertainty: number;
  /** Cost weight: each direction change along routed polyline. */
  weightDirectionChange: number;
  /** Penalty when routing status is explicitly forbidden. */
  penaltyDirectionForbidden: number;
  /** Penalty when route not found (not treated as physical impossibility). */
  penaltyRouteNotFound: number;
};

export const DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG: S4RouteAwareResearchConfig = {
  maxRoutingExpansions: 12_000,
  maxRouteDistanceM: 8_000,
  l3MinTrustSpeedKmh: 8,
  l3SpeedSlackFactor: 1.85,
  fallbackMaxPlausibleSpeedKmh: 130,
  weightRouteDistancePerM: 0.02,
  weightTimeViolationPerKmh: 4,
  weightTopologyUncertainty: 6,
  weightDirectionChange: 3,
  penaltyDirectionForbidden: 1_000_000,
  penaltyRouteNotFound: 250,
};
