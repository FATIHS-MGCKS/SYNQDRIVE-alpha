import type { ResearchGpsBucket, ResearchOsmWay } from './contracts';
import type { DirectedCarRoutingGraph } from './osm-directed-routing-graph';
import type { BaselineBucketMatch } from './baseline-matching';
import type { InternalMatchOutcome } from './labels';
import { projectBucketOntoWay } from './route-segment-projection';
import { queryRouteBetweenProjections, clearRouteQueryCache } from './route-query';
import { haversineMeters } from '../speed-qc/di-v0-speed-qc-geo';
import {
  DEFAULT_S4_DIRECTION_AWARE_P1_SAFETY_GATE_CONFIG,
  type S4DirectionAwareP1SafetyGateConfig,
} from './direction-aware-p1-safety-gates.config';

export const S4_RESEARCH_DIRECTION_AWARE_P1_SAFETY_GATES_V1 = 'S4_RESEARCH_DIRECTION_AWARE_P1_SAFETY_GATES_B6_V1';

export type SafetyGateReasonCode =
  | 'GATE_DIRECTED_ROUTE_NOT_CONNECTED'
  | 'GATE_DIRECTED_ROUTE_NOT_FOUND'
  | 'GATE_DIRECTED_TOPOLOGY_UNCERTAIN'
  | 'GATE_KINEMATIC_DETOUR_RATIO'
  | 'GATE_KINEMATIC_SPEED_IMPLAUSIBLE'
  | 'GATE_STATIONARY_WAY_CHANGE'
  | 'GATE_STATIONARY_SERVICE_TRANSITION'
  | 'GATE_GPS_POSITION_ABSENT'
  | 'GATE_NO_OP';

export type ShadowMotionEvidence = {
  motionState?: string | null;
  positionState?: string | null;
  estimatedSpeedKmh?: number | null;
  valueConfidence?: string | null;
  speedEvidenceState?: string | null;
};

export type SafetyGateAuditRecord = {
  bucketLabelUtc: string;
  originalOutcome: InternalMatchOutcome;
  gatedOutcome: InternalMatchOutcome;
  previousWayId: number | null;
  newWayId: number | null;
  triggeredGates: SafetyGateReasonCode[];
  routingStatus: string | null;
  routeDistanceM: number | null;
  gpsChordM: number | null;
  dtSec: number | null;
  routeImpliedSpeedKmh: number | null;
  gpsImpliedSpeedKmh: number | null;
  stationaryEvaluation: string | null;
  shadowMotionState: string | null;
};

export type GatedMatchResult = {
  algorithmId: string;
  matches: BaselineBucketMatch[];
  audits: SafetyGateAuditRecord[];
  triggerCounts: Record<SafetyGateReasonCode, number>;
};

function downgrade(outcome: InternalMatchOutcome, severe: boolean): InternalMatchOutcome {
  if (outcome !== 'CONFIRMED') return outcome;
  return severe ? 'UNKNOWN' : 'AMBIGUOUS';
}

function bucketDtSec(a: string, b: string): number {
  const dt = (Date.parse(b) - Date.parse(a)) / 1000;
  return dt > 0 ? dt : 1;
}

/**
 * Post-processes ungated Direction-Aware P1 Viterbi rows without mutating the input array.
 */
export function applyDirectionAwareP1SafetyGates(
  ungated: readonly BaselineBucketMatch[],
  buckets: readonly ResearchGpsBucket[],
  ways: readonly ResearchOsmWay[],
  directedGraph: DirectedCarRoutingGraph,
  shadowByBucket: ReadonlyMap<string, ShadowMotionEvidence> = new Map(),
  gateConfig: S4DirectionAwareP1SafetyGateConfig = DEFAULT_S4_DIRECTION_AWARE_P1_SAFETY_GATE_CONFIG,
): GatedMatchResult {
  clearRouteQueryCache(directedGraph);
  const waysById = new Map(ways.map((w) => [w.osmWayId, w]));
  const triggerCounts: Record<SafetyGateReasonCode, number> = {
    GATE_DIRECTED_ROUTE_NOT_CONNECTED: 0,
    GATE_DIRECTED_ROUTE_NOT_FOUND: 0,
    GATE_DIRECTED_TOPOLOGY_UNCERTAIN: 0,
    GATE_KINEMATIC_DETOUR_RATIO: 0,
    GATE_KINEMATIC_SPEED_IMPLAUSIBLE: 0,
    GATE_STATIONARY_WAY_CHANGE: 0,
    GATE_STATIONARY_SERVICE_TRANSITION: 0,
    GATE_GPS_POSITION_ABSENT: 0,
    GATE_NO_OP: 0,
  };

  const matches: BaselineBucketMatch[] = [];
  const audits: SafetyGateAuditRecord[] = [];

  for (let i = 0; i < ungated.length; i++) {
    const row = ungated[i];
    const bucket = buckets[i];
    const shadow = shadowByBucket.get(row.bucketLabelUtc);
    let outcome = row.outcome;
    const triggered: SafetyGateReasonCode[] = [];

    if (
      shadow?.positionState === 'ROW_ABSENT' ||
      shadow?.positionState === 'SIGNAL_NULL'
    ) {
      triggered.push('GATE_GPS_POSITION_ABSENT');
      outcome = 'UNKNOWN';
      const gatedRow: BaselineBucketMatch = {
        ...row,
        outcome,
        osmWayId: null,
        ambiguityReasons: [...row.ambiguityReasons, 'GATE_GPS_POSITION_ABSENT'],
      };
      matches.push(gatedRow);
      for (const t of triggered) triggerCounts[t] += 1;
      audits.push({
        bucketLabelUtc: row.bucketLabelUtc,
        originalOutcome: row.outcome,
        gatedOutcome: outcome,
        previousWayId: i > 0 ? matches[i - 1]?.osmWayId ?? null : null,
        newWayId: null,
        triggeredGates: triggered,
        routingStatus: null,
        routeDistanceM: null,
        gpsChordM: null,
        dtSec: null,
        routeImpliedSpeedKmh: null,
        gpsImpliedSpeedKmh: null,
        stationaryEvaluation: null,
        shadowMotionState: shadow?.motionState ?? null,
      });
      continue;
    }
    let routingStatus: string | null = null;
    let routeDistanceM: number | null = null;
    let gpsChordM: number | null = null;
    let dtSec: number | null = null;
    let routeImpliedSpeedKmh: number | null = null;
    let gpsImpliedSpeedKmh: number | null = null;
    let stationaryEval: string | null = null;

    const prevOut = i > 0 ? matches[i - 1] : null;
    const prevBucket = i > 0 ? buckets[i - 1] : null;
    const prevWay = prevOut?.osmWayId ?? null;
    const newWay = row.osmWayId;

    const wayChange =
      outcome === 'CONFIRMED' &&
      newWay != null &&
      prevWay !== null &&
      prevWay !== newWay &&
      bucket?.availability === 'PRESENT' &&
      prevBucket?.availability === 'PRESENT';

    if (wayChange && bucket && prevBucket) {
      dtSec = bucketDtSec(prevBucket.bucketLabelUtc, bucket.bucketLabelUtc);
      if (
        bucket.latitude != null &&
        bucket.longitude != null &&
        prevBucket.latitude != null &&
        prevBucket.longitude != null
      ) {
        gpsChordM = haversineMeters(
          prevBucket.latitude!,
          prevBucket.longitude!,
          bucket.latitude!,
          bucket.longitude!,
        );
        gpsImpliedSpeedKmh = (gpsChordM / dtSec) * 3.6;
      }

      const wA = waysById.get(prevWay!);
      const wB = waysById.get(newWay!);
      if (wA && wB) {
        const rawA = directedGraph.rawWaysById.get(prevWay!);
        const rawB = directedGraph.rawWaysById.get(newWay!);
        const fromProj = projectBucketOntoWay(prevBucket, wA, rawA?.nodeIds ?? null);
        const toProj = projectBucketOntoWay(bucket, wB, rawB?.nodeIds ?? null);
        if (fromProj && toProj) {
          const route = queryRouteBetweenProjections(directedGraph, fromProj, toProj);
          routingStatus = route.status;
          routeDistanceM = route.routeDistanceM;
          routeImpliedSpeedKmh = (route.routeDistanceM / dtSec) * 3.6;

          if (route.status === 'ROUTE_NOT_FOUND_IN_EXTRACT') {
            triggered.push('GATE_DIRECTED_ROUTE_NOT_FOUND');
            outcome = downgrade(outcome, false);
          } else if (route.status !== 'CONNECTED_AND_DIRECTION_ALLOWED') {
            triggered.push('GATE_DIRECTED_ROUTE_NOT_CONNECTED');
            outcome = downgrade(outcome, false);
          }
          if (route.turnRestrictionUnknown || route.topologyUncertainty) {
            triggered.push('GATE_DIRECTED_TOPOLOGY_UNCERTAIN');
            outcome = downgrade(outcome, false);
          }

          if (
            route.routeDistanceM >= gateConfig.minRouteDistanceForRatioM &&
            gpsChordM != null &&
            gpsChordM > 0.5 &&
            route.routeDistanceM / gpsChordM > gateConfig.maxRouteToChordRatio
          ) {
            triggered.push('GATE_KINEMATIC_DETOUR_RATIO');
            outcome = downgrade(outcome, false);
          }
          if (
            routeImpliedSpeedKmh != null &&
            routeImpliedSpeedKmh > gateConfig.maxRouteImpliedSpeedKmh &&
            gpsImpliedSpeedKmh != null &&
            gpsImpliedSpeedKmh < routeImpliedSpeedKmh * 0.35
          ) {
            triggered.push('GATE_KINEMATIC_SPEED_IMPLAUSIBLE');
            outcome = downgrade(outcome, false);
          }
        }
      }

      const motion = shadow?.motionState ?? null;
      const disp = gpsChordM ?? 0;
      const serviceDest = wB?.highway === 'service';
      const turnBypass =
        routeDistanceM != null &&
        routingStatus === 'CONNECTED_AND_DIRECTION_ALLOWED' &&
        routeDistanceM <= gateConfig.turnRouteDistanceBypassM &&
        disp >= gateConfig.turnDisplacementBypassM;

      if (motion === 'STATIONARY_SUPPORTED' && !turnBypass) {
        if (disp < gateConfig.stationaryDisplacementThresholdM) {
          triggered.push('GATE_STATIONARY_WAY_CHANGE');
          stationaryEval = 'STATIONARY_LOW_DISPLACEMENT';
          outcome = downgrade(outcome, false);
        }
        if (serviceDest && disp < gateConfig.turnDisplacementBypassM) {
          triggered.push('GATE_STATIONARY_SERVICE_TRANSITION');
          stationaryEval = 'STATIONARY_SERVICE';
          outcome = downgrade(outcome, false);
        }
      } else if (motion === 'STATIONARY_SUPPORTED' && turnBypass) {
        stationaryEval = 'STATIONARY_TURN_BYPASS';
      }
    }

    if (triggered.length === 0) triggerCounts.GATE_NO_OP += 1;
    for (const t of triggered) triggerCounts[t] += 1;

    const gatedRow: BaselineBucketMatch = {
      ...row,
      outcome,
      ambiguityReasons: triggered.length
        ? [...row.ambiguityReasons, ...triggered]
        : row.ambiguityReasons,
    };
    matches.push(gatedRow);
    audits.push({
      bucketLabelUtc: row.bucketLabelUtc,
      originalOutcome: row.outcome,
      gatedOutcome: outcome,
      previousWayId: prevWay,
      newWayId: newWay,
      triggeredGates: triggered.length ? triggered : ['GATE_NO_OP'],
      routingStatus,
      routeDistanceM,
      gpsChordM,
      dtSec,
      routeImpliedSpeedKmh,
      gpsImpliedSpeedKmh,
      stationaryEvaluation: stationaryEval,
      shadowMotionState: shadow?.motionState ?? null,
    });
  }

  return {
    algorithmId: S4_RESEARCH_DIRECTION_AWARE_P1_SAFETY_GATES_V1,
    matches,
    audits,
    triggerCounts,
  };
}
