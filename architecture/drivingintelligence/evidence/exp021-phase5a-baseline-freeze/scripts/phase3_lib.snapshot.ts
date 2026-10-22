/**
 * EXP021 Phase 2 — research-only ablation library (NO product code touched).
 *
 * All decoders here are composed from the pinned s4-research library primitives
 * (emission, transition, candidate generation, directed routing) so that every
 * model family member M0..M8 shares identical candidate budget, OSM snapshot,
 * geometry projection and evidence. Library decoders are used 1:1 where they exist;
 * composed decoders are parity-checked against them in the runner.
 *
 * Run from the pinned worktree backend dir with ts-node transpile-only.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';

export const WORKTREE = '/workspace/.worktrees/di-master-architecture-research-20261021';
export const DI = path.join(WORKTREE, 'backend/src/modules/vehicle-intelligence/driving-intelligence');
export const S4 = path.join(DI, 's4-research');

/* eslint-disable @typescript-eslint/no-var-requires */
const osmParse = require(path.join(S4, 'osm-parse'));
const dpCosts = require(path.join(S4, 'viterbi-dp-costs'));
const p1 = require(path.join(S4, 'emission-direction-aware-p1'));
const routeTrans = require(path.join(S4, 'route-aware-transition'));
const routeQuery = require(path.join(S4, 'route-query'));
const routeCfgMod = require(path.join(S4, 'route-aware-config'));
const directedGraph = require(path.join(S4, 'osm-directed-routing-graph'));
const projection = require(path.join(S4, 'route-segment-projection'));
const baselineMod = require(path.join(S4, 'baseline-matching'));
const viterbiMod = require(path.join(S4, 'viterbi-matching'));
const backtrackMod = require(path.join(S4, 'viterbi-matching-backtrack'));
const p1ViterbiMod = require(path.join(S4, 'viterbi-matching-direction-aware-p1'));
const routeAwareMod = require(path.join(S4, 'viterbi-matching-route-aware'));
const configMod = require(path.join(S4, 'config'));
const geo = require(path.join(S4, 'geo'));
const b6 = require('/opt/cursor/artifacts/exp021-scientific-audit-phase2/scripts/vendored_b6_180c74da8/direction-aware-p1-safety-gates');
/* eslint-enable @typescript-eslint/no-var-requires */

export const lib = {
  nearestWayCandidates: osmParse.nearestWayCandidates as (...a: any[]) => any[],
  buildWayAdjacency: osmParse.buildWayAdjacency as (ways: any[]) => Map<number, Set<number>>,
  graphReachableMultiHop: osmParse.graphReachableMultiHop as (...a: any[]) => boolean,
  buildRoadContextFromOverpass: osmParse.buildRoadContextFromOverpass as (...a: any[]) => any,
  parseOverpassElements: osmParse.parseOverpassElements as (...a: any[]) => any,
  emissionCostFromHits: dpCosts.emissionCostFromHits as (...a: any[]) => number,
  transitionCost: dpCosts.transitionCost as (...a: any[]) => number,
  tieBreakWayId: dpCosts.tieBreakWayId as (w: number | null) => number,
  emissionP1: p1.emissionCostFromHitsDirectionAwareP1 as (...a: any[]) => number,
  emissionP1Detailed: p1.emissionCostFromHitsDirectionAwareP1Detailed as (...a: any[]) => any,
  resolveWayTravelDirectionPolicy: p1.resolveWayTravelDirectionPolicy as (w: any) => string,
  computeRouteAwareTransitionCost: routeTrans.computeRouteAwareTransitionCost as (...a: any[]) => any,
  queryRouteBetweenProjections: routeQuery.queryRouteBetweenProjections as (...a: any[]) => any,
  clearRouteQueryCache: routeQuery.clearRouteQueryCache as (g?: any) => void,
  routeQueryRuntimeProfile: routeQuery.routeQueryRuntimeProfile as any,
  resetRouteQueryRuntimeProfile: routeQuery.resetRouteQueryRuntimeProfile as () => void,
  DEFAULT_ROUTE_CFG: routeCfgMod.DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG as any,
  buildDirectedCarRoutingGraph: directedGraph.buildDirectedCarRoutingGraph as (...a: any[]) => any,
  projectBucketOntoWay: projection.projectBucketOntoWay as (...a: any[]) => any,
  buildBaselineMatches: baselineMod.buildBaselineMatches as (...a: any[]) => any[],
  buildViterbiMatches: viterbiMod.buildViterbiMatches as (...a: any[]) => any[],
  headingsFromBaseline: viterbiMod.headingsFromBaseline as (b: any[]) => (number | null)[],
  buildViterbiMatchesBacktrackR1: backtrackMod.buildViterbiMatchesBacktrackR1 as (...a: any[]) => any,
  buildViterbiMatchesDirectionAwareEmissionP1: p1ViterbiMod.buildViterbiMatchesDirectionAwareEmissionP1 as (
    ...a: any[]
  ) => any[],
  buildViterbiMatchesRouteAwareR4_1: routeAwareMod.buildViterbiMatchesRouteAwareR4_1 as (...a: any[]) => any,
  DEFAULT_CFG: configMod.DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG as any,
  bearingDeg: geo.bearingDeg as (...a: number[]) => number,
  headingDeltaDeg: geo.headingDeltaDeg as (a: number, b: number) => number,
  applyDirectionAwareP1SafetyGates: b6.applyDirectionAwareP1SafetyGates as (...a: any[]) => any,
};

export type Bucket = {
  bucketLabelUtc: string;
  availability: 'PRESENT' | 'ROW_ABSENT' | 'SIGNAL_NULL' | 'OTHER';
  latitude: number | null;
  longitude: number | null;
  l3SpeedKmh?: number | null;
  qcTrustLevel?: string | null;
  motionState?: string | null;
};
export type Outcome = 'CONFIRMED' | 'AMBIGUOUS' | 'UNKNOWN';
export type Match = {
  bucketLabelUtc: string;
  gpsStatus: string;
  headingDeg: number | null;
  outcome: Outcome;
  osmWayId: number | null;
  candidateWayIds: number[];
  ambiguityReasons: string[];
  nearestConfirmedJunctionM: number | null;
  confirmedJunctionNodeId: number | null;
  trafficSignalNodeId: number | null;
  trafficSignalDistanceM: number | null;
  /** Phase-2 extras (research only). */
  pathMargin?: number | null;
  posteriorMax?: number | null;
  posteriorSecond?: number | null;
};

export type EmissionKind = 'LEGACY' | 'P1';
export type TransitionKind = 'ADJACENCY' | 'ROUTE_AWARE';
/** GAP = library semantics; PATH_MARGIN = margin-only (run-1 reference); MARGIN_AND_GAP = conjunction; POSTERIOR = sum-product. */
export type ConfidenceKind = 'GAP' | 'PATH_MARGIN' | 'MARGIN_AND_GAP' | 'POSTERIOR' | 'ABSTAIN';
/** Conservative abstention baseline (pre-registered): CONFIRMED iff chosen = nearest AND (single candidate OR gap >= ABSTAIN_GAP_M). */
export const ABSTAIN_GAP_M = 15;
export type DecodeKind = 'BACKTRACK' | 'POSTERIOR_MAP';

export type GenericDecoderOpts = {
  emission: EmissionKind;
  transition: TransitionKind;
  decode: DecodeKind;
  confidence: ConfidenceKind;
  adj?: Map<number, Set<number>>;
  graph?: any;
  routeCfg?: any;
  /** PATH_MARGIN: CONFIRMED iff margin >= tau (cost units; 2/m distance weight => 10 == 5 m gap). */
  marginTau?: number;
  /** POSTERIOR: cost temperature (cost units per nat). */
  posteriorTemperature?: number;
  posteriorConfirm?: number;
  posteriorUnknown?: number;
  /**
   * Null-state memory: off-road states remember the last on-road way, so re-entry pays the
   * topological transition cost from that way (closes the way->null->way teleport bypass found in S01).
   */
  nullMemory?: boolean;
  /** Same-way transition cost forced to 0 when GPS displacement < this (m) (closes R4.1 oneway backward-jitter hazard, S15). */
  standstillGuardM?: number;
};

type DpState = { w: number | null; last: number | null };

const NULL_EMISSION = 100;

function emptyMatch(b: Bucket, reasons: string[]): Match {
  return {
    bucketLabelUtc: b.bucketLabelUtc,
    gpsStatus: b.availability,
    headingDeg: null,
    outcome: 'UNKNOWN',
    osmWayId: null,
    candidateWayIds: [],
    ambiguityReasons: reasons,
    nearestConfirmedJunctionM: null,
    confirmedJunctionNodeId: null,
    trafficSignalNodeId: null,
    trafficSignalDistanceM: null,
  };
}

function gapOutcome(chosen: number | null, hits: any[], cfg: any): Outcome {
  if (chosen == null) return 'UNKNOWN';
  if (!hits.some((h) => h.way.osmWayId === chosen)) return 'UNKNOWN';
  if (hits.length > 1 && hits[1].distanceM - hits[0].distanceM < cfg.competitorGapM) return 'AMBIGUOUS';
  return 'CONFIRMED';
}

function logsumexp(xs: number[]): number {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  if (m === -Infinity) return -Infinity;
  let s = 0;
  for (const x of xs) s += Math.exp(x - m);
  return m + Math.log(s);
}

/**
 * Generic segment decoder (state-based). With nullMemory=false and standstillGuardM undefined it mirrors the
 * library DP exactly: candidates = topK hits + one null; transition null<->way 5, null->null 0; null emission 100;
 * tie-break lower cost, lower wayId, lower prevIndex. With nullMemory=true, null states carry `last` (the last
 * on-road way) and re-entry pays the topological transition from `last`.
 */
function decodeSegmentGeneric(
  segB: Bucket[],
  segH: (number | null)[],
  ways: any[],
  cfg: any,
  o: GenericDecoderOpts,
): Match[] {
  const K = cfg.viterbiTopK;
  const waysById = new Map(ways.map((w: any) => [w.osmWayId, w]));
  const hitsPer: any[][] = [];
  for (const b of segB) {
    hitsPer.push(
      lib
        .nearestWayCandidates(b.latitude!, b.longitude!, ways, cfg.uncertaintyRadiusM, cfg.pointToSegmentDistanceM)
        .slice(0, K),
    );
  }
  const T = segB.length;
  const alpha: number[][] = [];
  const bp: number[][] = [];
  const TR: number[][][] = [];
  const Ecache: number[][] = [];

  const emit = (t: number, w: number | null): number => {
    if (w == null) return NULL_EMISSION;
    return o.emission === 'P1'
      ? lib.emissionP1(segH[t], w, hitsPer[t], cfg)
      : lib.emissionCostFromHits(segH[t], w, hitsPer[t], cfg);
  };
  const dispM = (t: number) =>
    haversine(segB[t - 1].latitude!, segB[t - 1].longitude!, segB[t].latitude!, segB[t].longitude!);
  const wayToWay = (t: number, pw: number, cw: number): number => {
    if (o.standstillGuardM != null && pw === cw && dispM(t) < o.standstillGuardM) return 0;
    if (o.transition === 'ADJACENCY') return lib.transitionCost(pw, cw, o.adj!, segB[t].l3SpeedKmh);
    const parts = lib.computeRouteAwareTransitionCost(
      o.graph,
      segB[t - 1],
      segB[t],
      waysById.get(pw),
      waysById.get(cw),
      cfg,
      o.routeCfg ?? lib.DEFAULT_ROUTE_CFG,
    );
    return parts.total;
  };
  const trans = (t: number, p: DpState, c: DpState): number => {
    if (p.w != null && c.w != null) return wayToWay(t, p.w, c.w);
    if (!o.nullMemory) {
      if (p.w == null && c.w == null) return 0;
      return 5;
    }
    if (p.w != null && c.w == null) return c.last === p.w ? 5 : Infinity;
    if (p.w == null && c.w == null) return c.last === p.last ? 0 : Infinity;
    // null -> way
    if (p.last == null) return 5;
    return 5 + wayToWay(t, p.last, c.w!);
  };

  // Build state layers
  const layers: DpState[][] = [];
  for (let t = 0; t < T; t++) {
    const st: DpState[] = hitsPer[t].map((h: any) => ({ w: h.way.osmWayId, last: h.way.osmWayId }));
    st.push({ w: null, last: null });
    if (o.nullMemory && t > 0) {
      const lasts = new Set<number>();
      for (const s of layers[t - 1]) if (s.last != null) lasts.add(s.last);
      // bound: keep at most K memory states (lowest previous alpha)
      const ranked = [...lasts]
        .map((l) => ({ l, a: Math.min(...layers[t - 1].map((s, i) => (s.last === l ? alpha[t - 1][i] : Infinity))) }))
        .sort((x, y) => x.a - y.a)
        .slice(0, K);
      for (const r of ranked) st.push({ w: null, last: r.l });
    }
    layers.push(st);
    // forward step for this layer (alpha defined below; computed incrementally)
    const E = st.map((s) => emit(t, s.w));
    Ecache.push(E);
    if (t === 0) {
      alpha.push(st.map((s, ci) => (s.w == null ? (s.last == null ? 0 : Infinity) : 5) + E[ci]));
      bp.push(st.map(() => -1));
      TR.push([]);
    } else {
      const prev = layers[t - 1];
      const m: number[][] = prev.map((p) => st.map((c) => trans(t, p, c)));
      TR.push(m);
      const a: number[] = [];
      const p: number[] = [];
      for (let ci = 0; ci < st.length; ci++) {
        let best = Infinity;
        let bestPi = -1;
        for (let pi = 0; pi < prev.length; pi++) {
          const c = alpha[t - 1][pi] + m[pi][ci] + E[ci];
          if (bestPi === -1 || c < best) {
            best = c;
            bestPi = pi;
          }
        }
        a.push(best);
        p.push(bestPi);
      }
      alpha.push(a);
      bp.push(p);
    }
  }
  // Backward min-sum beta
  const beta: number[][] = new Array(T);
  beta[T - 1] = layers[T - 1].map(() => 0);
  for (let t = T - 2; t >= 0; t--) {
    beta[t] = layers[t].map((_, pi) => {
      let best = Infinity;
      for (let ci = 0; ci < layers[t + 1].length; ci++) {
        const c = TR[t + 1][pi][ci] + Ecache[t + 1][ci] + beta[t + 1][ci];
        if (c < best) best = c;
      }
      return best;
    });
  }

  const chosenIdx: number[] = new Array(T);
  const postMax: (number | null)[] = new Array(T).fill(null);
  const postSecond: (number | null)[] = new Array(T).fill(null);
  if (o.decode === 'BACKTRACK') {
    const L = layers[T - 1];
    let end = 0;
    for (let i = 1; i < L.length; i++) {
      const a = alpha[T - 1][i];
      const b = alpha[T - 1][end];
      if (a < b) end = i;
      else if (a === b) {
        const wd = lib.tieBreakWayId(L[i].w) - lib.tieBreakWayId(L[end].w);
        if (wd < 0 || (wd === 0 && bp[T - 1][i] < bp[T - 1][end])) end = i;
      }
    }
    let cur = end;
    for (let t = T - 1; t >= 0; t--) {
      chosenIdx[t] = cur;
      cur = bp[t][cur];
    }
  } else {
    const temp = o.posteriorTemperature ?? 10;
    const la: number[][] = [];
    la.push(layers[0].map((s, ci) => -((s.w == null ? (s.last == null ? 0 : Infinity) : 5) + Ecache[0][ci]) / temp));
    for (let t = 1; t < T; t++) {
      la.push(
        layers[t].map((_, ci) =>
          logsumexp(layers[t - 1].map((_, pi) => la[t - 1][pi] - (TR[t][pi][ci] + Ecache[t][ci]) / temp)),
        ),
      );
    }
    const lb: number[][] = new Array(T);
    lb[T - 1] = layers[T - 1].map(() => 0);
    for (let t = T - 2; t >= 0; t--) {
      lb[t] = layers[t].map((_, pi) =>
        logsumexp(layers[t + 1].map((_, ci) => -(TR[t + 1][pi][ci] + Ecache[t + 1][ci]) / temp + lb[t + 1][ci])),
      );
    }
    for (let t = 0; t < T; t++) {
      const lp = layers[t].map((_, ci) => la[t][ci] + lb[t][ci]);
      const z = logsumexp(lp);
      // marginalise over states sharing the same way (all null states -> "off-road")
      const pw = new Map<number | null, number>();
      layers[t].forEach((s, ci) => pw.set(s.w, (pw.get(s.w) ?? 0) + Math.exp(lp[ci] - z)));
      let bestW: number | null = null;
      let bestP = -1;
      for (const [w, p] of pw) if (p > bestP) {
        bestP = p;
        bestW = w;
      }
      chosenIdx[t] = layers[t].findIndex((s) => s.w === bestW);
      const sorted = [...pw.values()].sort((a, b) => b - a);
      postMax[t] = sorted[0];
      postSecond[t] = sorted[1] ?? 0;
    }
  }

  const out: Match[] = [];
  for (let t = 0; t < T; t++) {
    const ci = chosenIdx[t];
    const w = layers[t][ci].w;
    const hits = hitsPer[t];
    let outcome: Outcome;
    let margin: number | null = null;
    const gap = gapOutcome(w, hits, cfg);
    if (o.confidence === 'GAP') {
      outcome = gap;
    } else if (o.confidence === 'ABSTAIN') {
      if (w == null || !hits.some((h: any) => h.way.osmWayId === w)) outcome = 'UNKNOWN';
      else if (hits[0]?.way.osmWayId !== w) outcome = 'AMBIGUOUS';
      else if (hits.length === 1 || hits[1].distanceM - hits[0].distanceM >= ABSTAIN_GAP_M) outcome = 'CONFIRMED';
      else outcome = 'AMBIGUOUS';
    } else if (o.confidence === 'PATH_MARGIN' || o.confidence === 'MARGIN_AND_GAP') {
      const best = alpha[t][ci] + beta[t][ci];
      let second = Infinity;
      for (let i = 0; i < layers[t].length; i++) {
        if (i === ci || layers[t][i].w === w) continue;
        const v = alpha[t][i] + beta[t][i];
        if (v < second) second = v;
      }
      margin = second === Infinity ? Infinity : second - best;
      if (w == null) outcome = 'UNKNOWN';
      else if (margin >= (o.marginTau ?? 10)) {
        if (o.confidence === 'MARGIN_AND_GAP') {
          const nearest = hits[0]?.way.osmWayId === w;
          outcome = gap === 'CONFIRMED' && nearest ? 'CONFIRMED' : 'AMBIGUOUS';
        } else outcome = 'CONFIRMED';
      } else outcome = 'AMBIGUOUS';
    } else {
      const pm = postMax[t] ?? 0;
      if (w == null) outcome = 'UNKNOWN';
      else if (pm >= (o.posteriorConfirm ?? 0.8)) outcome = 'CONFIRMED';
      else if (pm >= (o.posteriorUnknown ?? 0.5)) outcome = 'AMBIGUOUS';
      else outcome = 'UNKNOWN';
    }
    out.push({
      bucketLabelUtc: segB[t].bucketLabelUtc,
      gpsStatus: 'PRESENT',
      headingDeg: segH[t],
      outcome,
      osmWayId: o.confidence === 'POSTERIOR' && outcome === 'UNKNOWN' ? null : w,
      candidateWayIds: hits.map((h: any) => h.way.osmWayId),
      ambiguityReasons: outcome === 'AMBIGUOUS' ? ['VITERBI_COMPETING_OR_HIGH_COST'] : [],
      nearestConfirmedJunctionM: null,
      confirmedJunctionNodeId: null,
      trafficSignalNodeId: null,
      trafficSignalDistanceM: null,
      pathMargin: margin,
      posteriorMax: postMax[t],
      posteriorSecond: postSecond[t],
    });
  }
  return out;
}

export function decodeGeneric(
  buckets: Bucket[],
  ways: any[],
  headings: (number | null)[],
  cfg: any,
  o: GenericDecoderOpts,
): Match[] {
  if (o.transition === 'ROUTE_AWARE') lib.clearRouteQueryCache(o.graph);
  const out: Match[] = [];
  let segB: Bucket[] = [];
  let segH: (number | null)[] = [];
  const flush = () => {
    if (!segB.length) return;
    out.push(...decodeSegmentGeneric(segB, segH, ways, cfg, o));
    segB = [];
    segH = [];
  };
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      flush();
      out.push(emptyMatch(b, ['NO_GPS']));
      continue;
    }
    segB.push(b);
    segH.push(headings[i]);
  }
  flush();
  return out;
}

/** Heading guard: null heading when consecutive displacement below `minDispM` (prevents atan2(0,0)=0° contamination). */
export function guardedHeadings(
  buckets: Bucket[],
  headings: (number | null)[],
  minDispM = 1.5,
  minSpeedKmh: number | null = 5,
): (number | null)[] {
  const out = [...headings];
  for (let i = 1; i < buckets.length; i++) {
    const p = buckets[i - 1];
    const c = buckets[i];
    if (p.availability !== 'PRESENT' || c.availability !== 'PRESENT') continue;
    if (p.latitude == null || c.latitude == null || p.longitude == null || c.longitude == null) continue;
    const d = haversine(p.latitude, p.longitude, c.latitude, c.longitude);
    if (d < minDispM) out[i] = null;
    else if (minSpeedKmh != null && c.l3SpeedKmh != null && c.l3SpeedKmh < minSpeedKmh) out[i] = null;
  }
  return out;
}

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toR = (x: number) => (x * Math.PI) / 180;
  const dLat = toR(lat2 - lat1);
  const dLon = toR(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* ------------------------------------------------------------------ model registry */
export type ModelId =
  | 'M0' | 'M1' | 'M1P1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' | 'M7A' | 'M7' | 'M8'
  | 'M5ABST' | 'M7ABST' | 'M7C';
export const MODEL_DESCRIPTIONS: Record<ModelId, string> = {
  M5ABST: 'Phase-3 baseline: M5 path with conservative abstention label (CONFIRMED iff nearest and single candidate or gap >= 15 m)',
  M7ABST: 'Phase-3 baseline: M7A path with conservative abstention label',
  M7C: 'Phase-3 causality variant: M7 with displacement-only heading guard (no L3 input, strictly causal evidence gating)',
  M0: 'Baseline bucket matcher (S4_RESEARCH_BASELINE_BUCKET_V2, library 1:1)',
  M1: 'Viterbi forward V2 greedy layer-argmin (library 1:1)',
  M1P1: 'Forward V2 + Direction-Aware P1 emission — the ACTUAL merged P1 decoder (library 1:1)',
  M2: 'Viterbi backtrack R1 (library 1:1)',
  M3: 'Backtrack R1 + Direction-Aware P1 emission (COMPOSED; no library decoder exists)',
  M4: 'Backtrack + Route-Aware R4.1 transitions, legacy emission (library 1:1)',
  M5: 'Backtrack + P1 emission + Route-Aware R4.1 transitions (COMPOSED; no library decoder exists)',
  M6: 'M5 + B6 safety gates (vendored 180c74da8; gates applied post-decode)',
  M7A: 'M5 + cost calibration only: heading guard (<1.5 m or L3<5 km/h -> heading null), standstill same-way guard (<2 m), null-state memory; GAP confidence (PROPOSED)',
  M7: 'M7A + confidence calibration: CONFIRMED iff path-margin>=10 AND chosen is nearest AND nearest-gap>=5 m (PROPOSED)',
  M8: 'Architecture-C road component SIMULATION: M7A evidence layer, sum-product posterior (T=10), per-step MAP, posterior thresholds 0.8/0.5',
};

export type DriveContext = {
  name: string;
  buckets: Bucket[];
  ways: any[];
  roadContext: any;
  adj: Map<number, Set<number>>;
  graph: any;
  shadow: Map<string, any>;
  cfg: any;
};

export type ModelRun = { model: ModelId; matches: Match[]; cpuMs: number; heapDeltaMb: number; extra?: any };

function timed<T>(fn: () => T): { v: T; cpuMs: number; heapDeltaMb: number } {
  if ((global as any).gc) (global as any).gc();
  const h0 = process.memoryUsage().heapUsed;
  const c0 = process.cpuUsage();
  const v = fn();
  const c1 = process.cpuUsage(c0);
  const h1 = process.memoryUsage().heapUsed;
  return { v, cpuMs: (c1.user + c1.system) / 1000, heapDeltaMb: (h1 - h0) / 1048576 };
}

export function runModel(ctx: DriveContext, model: ModelId, headings: (number | null)[]): ModelRun {
  const { buckets, ways, cfg, adj, graph, roadContext } = ctx;
  const g = (o: GenericDecoderOpts, h = headings) => decodeGeneric(buckets, ways, h, cfg, o);
  const r = timed<Match[]>(() => {
    switch (model) {
      case 'M0':
        return lib.buildBaselineMatches(buckets, roadContext, cfg) as Match[];
      case 'M1':
        return lib.buildViterbiMatches(buckets, ways, headings, cfg, { wayAdjacency: adj }) as Match[];
      case 'M1P1':
        return lib.buildViterbiMatchesDirectionAwareEmissionP1(buckets, ways, headings, cfg, {
          wayAdjacency: adj,
        }) as Match[];
      case 'M2':
        return lib.buildViterbiMatchesBacktrackR1(buckets, ways, headings, cfg, { wayAdjacency: adj })
          .matches as Match[];
      case 'M3':
        return g({ emission: 'P1', transition: 'ADJACENCY', decode: 'BACKTRACK', confidence: 'GAP', adj });
      case 'M4':
        return lib.buildViterbiMatchesRouteAwareR4_1(buckets, ways, headings, cfg, graph).matches as Match[];
      case 'M5':
        return g({ emission: 'P1', transition: 'ROUTE_AWARE', decode: 'BACKTRACK', confidence: 'GAP', graph });
      case 'M6': {
        const m5 = g({ emission: 'P1', transition: 'ROUTE_AWARE', decode: 'BACKTRACK', confidence: 'GAP', graph });
        const gated = lib.applyDirectionAwareP1SafetyGates(m5, buckets, ways, graph, ctx.shadow);
        (gated.matches as any).__triggerCounts = gated.triggerCounts;
        return gated.matches as Match[];
      }
      case 'M7A':
        return g(
          { emission: 'P1', transition: 'ROUTE_AWARE', decode: 'BACKTRACK', confidence: 'GAP', graph, nullMemory: true, standstillGuardM: 2 },
          guardedHeadings(buckets, headings),
        );
      case 'M7':
        return g(
          {
            emission: 'P1',
            transition: 'ROUTE_AWARE',
            decode: 'BACKTRACK',
            confidence: 'MARGIN_AND_GAP',
            graph,
            marginTau: 10,
            nullMemory: true,
            standstillGuardM: 2,
          },
          guardedHeadings(buckets, headings),
        );
      case 'M8':
        return g(
          {
            emission: 'P1',
            transition: 'ROUTE_AWARE',
            decode: 'POSTERIOR_MAP',
            confidence: 'POSTERIOR',
            graph,
            posteriorTemperature: 10,
            posteriorConfirm: 0.8,
            posteriorUnknown: 0.5,
            nullMemory: true,
            standstillGuardM: 2,
          },
          guardedHeadings(buckets, headings),
        );
      case 'M5ABST':
        return g({ emission: 'P1', transition: 'ROUTE_AWARE', decode: 'BACKTRACK', confidence: 'ABSTAIN', graph });
      case 'M7ABST':
        return g(
          { emission: 'P1', transition: 'ROUTE_AWARE', decode: 'BACKTRACK', confidence: 'ABSTAIN', graph, nullMemory: true, standstillGuardM: 2 },
          guardedHeadings(buckets, headings),
        );
      case 'M7C':
        return g(
          {
            emission: 'P1',
            transition: 'ROUTE_AWARE',
            decode: 'BACKTRACK',
            confidence: 'MARGIN_AND_GAP',
            graph,
            marginTau: 10,
            nullMemory: true,
            standstillGuardM: 2,
          },
          guardedHeadings(buckets, headings, 1.5, null),
        );
    }
  });
  return { model, matches: r.v, cpuMs: r.cpuMs, heapDeltaMb: r.heapDeltaMb, extra: (r.v as any).__triggerCounts };
}

/* ------------------------------------------------------------------ metrics */
export type GtMap = Map<string, Set<number>>; // bucketLabel -> reference way ids (segment-level list)

export type Metrics = {
  model: string;
  drive: string;
  bucketsTotal: number;
  bucketsPresent: number;
  confirmed: number;
  ambiguous: number;
  unknown: number;
  decided: number;
  gtComparable: number;
  gtCorrect: number;
  gtConflict: number;
  gtAbstained: number;
  accuracyAmongDecided: number | null;
  falseConfirmed: number;
  confirmedPrecision: number | null;
  confirmedRecallOfGt: number | null;
  candidateRecall: number | null;
  wayChanges: number;
  transitionsDirectedUnsupported: number;
  transitionsDirectionForbidden: number;
  transitionsRouteNotFound: number;
  transitionsUndirectedDisconnected: number;
  transitionsTimeImplausible: number;
  wayChangesDuringStationary: number;
  /** Way changes where the previous decided way is separated by >=1 null (off-road) bucket inside one GPS segment. */
  wayChangesAcrossNull: number;
  /** Of those, directed route unsupported (DIRECTION_FORBIDDEN / ROUTE_NOT_FOUND / TOPOLOGY_INCOMPLETE) or time-implausible. */
  acrossNullUnsupportedOrImplausible: number;
  cpuMs: number;
  heapDeltaMb: number;
};

export function computeMetrics(
  ctx: DriveContext,
  run: ModelRun,
  gt: GtMap | null,
  stationaryLabels: Set<string>,
): Metrics {
  const { buckets, graph, adj, ways } = ctx;
  const waysById = new Map(ways.map((w: any) => [w.osmWayId, w]));
  const m = run.matches;
  let confirmed = 0,
    ambiguous = 0,
    unknown = 0,
    decided = 0,
    present = 0;
  let gtComparable = 0,
    gtCorrect = 0,
    gtConflict = 0,
    gtAbstained = 0,
    falseConfirmed = 0,
    confirmedCorrect = 0,
    candHit = 0;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    const r = m[i];
    if (b.availability === 'PRESENT' && b.latitude != null) present++;
    if (r.outcome === 'CONFIRMED') confirmed++;
    else if (r.outcome === 'AMBIGUOUS') ambiguous++;
    else unknown++;
    if (r.osmWayId != null) decided++;
    const ref = gt?.get(b.bucketLabelUtc);
    if (ref && ref.size && b.availability === 'PRESENT' && b.latitude != null) {
      gtComparable++;
      if (r.candidateWayIds.some((w) => ref.has(w))) candHit++;
      if (r.osmWayId == null) gtAbstained++;
      else if (ref.has(r.osmWayId)) {
        gtCorrect++;
        if (r.outcome === 'CONFIRMED') confirmedCorrect++;
      } else {
        gtConflict++;
        if (r.outcome === 'CONFIRMED') falseConfirmed++;
      }
    }
  }
  // transitions
  let wayChanges = 0,
    dirUnsupported = 0,
    dirForbidden = 0,
    notFound = 0,
    undirDisc = 0,
    timeImpl = 0,
    stationaryChanges = 0;
  lib.clearRouteQueryCache(graph);
  for (let i = 1; i < buckets.length; i++) {
    const a = m[i - 1],
      c = m[i];
    const bp = buckets[i - 1],
      bc = buckets[i];
    if (a.osmWayId == null || c.osmWayId == null || a.osmWayId === c.osmWayId) continue;
    if (bp.availability !== 'PRESENT' || bc.availability !== 'PRESENT') continue;
    wayChanges++;
    if (stationaryLabels.has(bc.bucketLabelUtc)) stationaryChanges++;
    if (!lib.graphReachableMultiHop(adj, a.osmWayId, c.osmWayId, 64)) undirDisc++;
    const wa = waysById.get(a.osmWayId),
      wc = waysById.get(c.osmWayId);
    if (!wa || !wc) continue;
    const pa = lib.projectBucketOntoWay(bp, wa, graph.rawWaysById.get(a.osmWayId)?.nodeIds ?? null);
    const pc = lib.projectBucketOntoWay(bc, wc, graph.rawWaysById.get(c.osmWayId)?.nodeIds ?? null);
    if (!pa || !pc) {
      dirUnsupported++;
      continue;
    }
    const rq = lib.queryRouteBetweenProjections(graph, pa, pc);
    if (rq.status === 'DIRECTION_FORBIDDEN') {
      dirForbidden++;
      dirUnsupported++;
    } else if (rq.status === 'ROUTE_NOT_FOUND_IN_EXTRACT' || rq.status === 'TOPOLOGY_INCOMPLETE') {
      notFound++;
      dirUnsupported++;
    } else {
      const dt = (Date.parse(bc.bucketLabelUtc) - Date.parse(bp.bucketLabelUtc)) / 1000;
      const req = dt > 0 ? (rq.routeDistanceM / dt) * 3.6 : 0;
      const ref = bc.l3SpeedKmh ?? bp.l3SpeedKmh ?? null;
      const maxP = ref != null && ref >= 8 ? ref * 1.85 : 130;
      if (req > maxP) timeImpl++;
    }
  }
  // across-null transitions (teleport bypass detector)
  let acrossNull = 0,
    acrossNullBad = 0;
  let lastIdx = -1;
  let pendingNull = false;
  for (let i = 0; i < buckets.length; i++) {
    const b = buckets[i];
    if (b.availability !== 'PRESENT' || b.latitude == null) {
      lastIdx = -1;
      pendingNull = false;
      continue;
    }
    const r = m[i];
    if (r.osmWayId == null) {
      if (lastIdx >= 0) pendingNull = true;
      continue;
    }
    if (lastIdx >= 0 && pendingNull && m[lastIdx].osmWayId !== r.osmWayId) {
      acrossNull++;
      const wa = waysById.get(m[lastIdx].osmWayId!),
        wc = waysById.get(r.osmWayId);
      const pa = wa ? lib.projectBucketOntoWay(buckets[lastIdx], wa, graph.rawWaysById.get(wa.osmWayId)?.nodeIds ?? null) : null;
      const pc = wc ? lib.projectBucketOntoWay(b, wc, graph.rawWaysById.get(wc.osmWayId)?.nodeIds ?? null) : null;
      if (!pa || !pc) acrossNullBad++;
      else {
        const rq = lib.queryRouteBetweenProjections(graph, pa, pc);
        if (rq.status !== 'CONNECTED_AND_DIRECTION_ALLOWED' && rq.status !== 'TURN_RESTRICTION_UNKNOWN') acrossNullBad++;
        else {
          const dt = (Date.parse(b.bucketLabelUtc) - Date.parse(buckets[lastIdx].bucketLabelUtc)) / 1000;
          const req = dt > 0 ? (rq.routeDistanceM / dt) * 3.6 : 0;
          const ref = b.l3SpeedKmh ?? null;
          const maxP = ref != null && ref >= 8 ? ref * 1.85 : 130;
          if (req > maxP) acrossNullBad++;
        }
      }
    }
    lastIdx = i;
    pendingNull = false;
  }
  return {
    model: run.model,
    drive: ctx.name,
    bucketsTotal: buckets.length,
    bucketsPresent: present,
    confirmed,
    ambiguous,
    unknown,
    decided,
    gtComparable,
    gtCorrect,
    gtConflict,
    gtAbstained,
    accuracyAmongDecided: gtCorrect + gtConflict ? gtCorrect / (gtCorrect + gtConflict) : null,
    falseConfirmed,
    confirmedPrecision: confirmedCorrect + falseConfirmed ? confirmedCorrect / (confirmedCorrect + falseConfirmed) : null,
    confirmedRecallOfGt: gtComparable ? confirmedCorrect / gtComparable : null,
    candidateRecall: gtComparable ? candHit / gtComparable : null,
    wayChanges,
    transitionsDirectedUnsupported: dirUnsupported,
    transitionsDirectionForbidden: dirForbidden,
    transitionsRouteNotFound: notFound,
    transitionsUndirectedDisconnected: undirDisc,
    transitionsTimeImplausible: timeImpl,
    wayChangesDuringStationary: stationaryChanges,
    wayChangesAcrossNull: acrossNull,
    acrossNullUnsupportedOrImplausible: acrossNullBad,
    cpuMs: Math.round(run.cpuMs * 10) / 10,
    heapDeltaMb: Math.round(run.heapDeltaMb * 100) / 100,
  };
}

/* ------------------------------------------------------------------ loaders */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let q = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      cur.push(field);
      field = '';
      rows.push(cur);
      cur = [];
    } else field += ch;
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  const header = rows[0];
  return rows.slice(1).filter((r) => r.length > 1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

export const ART = '/opt/cursor/artifacts';

export function loadTiguan(): { ctx: DriveContext; gt: GtMap; sha: Record<string, string> } {
  const gridPath = path.join(ART, 'exp021-tiguan-validation/research-output/fixtures/TIGUAN_POSITION_GRID.json');
  const osmPath = path.join(ART, 'exp021-tiguan-validation/research-output/TIGUAN_OSM_FROZEN_SNAPSHOT.json');
  const gtPath = path.join(ART, 'exp021-tiguan-validation/research-output/TIGUAN_A_B_C_D_E_COMPARISON.csv');
  const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8'));
  const buckets: Bucket[] = grid.buckets.map((b: any) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability,
    latitude: b.latitude,
    longitude: b.longitude,
    l3SpeedKmh: b.pinnedProductionL3Kmh ?? null,
    qcTrustLevel: null,
    motionState: null,
  }));
  const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));
  const overpass = osm.overpassResponse ?? osm;
  const cfg = lib.DEFAULT_CFG;
  const roadContext = lib.buildRoadContextFromOverpass(overpass, { buckets, corridorMarginM: 75 });
  const adj = lib.buildWayAdjacency(roadContext.ways);
  const graph = lib.buildDirectedCarRoutingGraph(overpass, roadContext.ways);
  const gt: GtMap = new Map();
  for (const row of parseCsv(fs.readFileSync(gtPath, 'utf8'))) {
    const ts = row.timestamp_utc_aligned;
    const ids = (row.reference_osm_way_ids ?? '')
      .split(/[;|]/)
      .map((x) => Number(x.trim()))
      .filter((x) => Number.isFinite(x) && x > 0);
    if (ts && ids.length) gt.set(ts, new Set(ids));
  }
  const sha = {
    positionGrid: sha256File(gridPath),
    osmSnapshot: sha256File(osmPath),
    gtTable: sha256File(gtPath),
    pinnedSnapshotHash: grid.pinnedSnapshotHash,
  };
  return { ctx: { name: 'TIGUAN_20261019', buckets, ways: roadContext.ways, roadContext, adj, graph, shadow: new Map(), cfg }, gt, sha };
}

export function loadTesla(trip: 'TRIP_1' | 'TRIP_2'): { ctx: DriveContext; sha: Record<string, string> } {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { parseDiV0S4EvidenceContainer } = require(path.join(DI, 's4a-foundation/di-v0-s4a-evidence-container-parse'));
  const { buildDiV0S4EvidenceSnapshotHash } = require(path.join(DI, 's4a-foundation/di-v0-s4a-identity'));
  const { DI_V0_S4_LIMITS } = require(path.join(DI, 's4a-foundation/di-v0-s4a-contract'));
  const { buildResearchGpsBucketsFromParsedContainer } = require(path.join(
    DI,
    's4-research-worker/di-v0-s4-research-snapshot-adapter',
  ));
  const { shadowBucketKeyFromIntervalStart } = require(path.join(DI, 's4-research-worker/di-v0-s4-research-shadow-evidence'));
  /* eslint-enable @typescript-eslint/no-var-requires */
  const gzPath = path.join(ART, `exp021-tesla-two-trip/${trip}_evidence_payload.gz`);
  const raw = gunzipSync(fs.readFileSync(gzPath), { maxOutputLength: DI_V0_S4_LIMITS.maxUncompressedSnapshotBytes }).toString('utf8');
  const snapshotHash = buildDiV0S4EvidenceSnapshotHash(raw);
  const manifest = JSON.parse(fs.readFileSync(path.join(ART, 'exp021-tesla-two-trip/manifest.json'), 'utf8'));
  const pinned = manifest.trips.find((t: any) => t.key === trip).snapshotHash;
  if (snapshotHash !== pinned) throw new Error(`Tesla ${trip} snapshot hash mismatch`);
  const shadowPath = path.join(ART, `exp021-tesla-b2/shadow/${trip}_shadow_intervals.jsonl`);
  const shadowRows = fs.readFileSync(shadowPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const shadowForAdapter = new Map<string, any>();
  const shadowForGates = new Map<string, any>();
  for (const r of shadowRows) {
    const k = shadowBucketKeyFromIntervalStart(new Date(r.intervalStart));
    shadowForAdapter.set(k, { l3SpeedKmh: r.estimatedSpeedKmh, motionState: r.motionState, qcTrustLevel: r.speedEvidenceState ?? r.valueConfidence ?? null });
    shadowForGates.set(k, {
      motionState: r.motionState,
      positionState: r.positionState,
      estimatedSpeedKmh: r.estimatedSpeedKmh,
      valueConfidence: r.valueConfidence,
      speedEvidenceState: r.speedEvidenceState,
    });
  }
  const buckets: Bucket[] = buildResearchGpsBucketsFromParsedContainer(parseDiV0S4EvidenceContainer(raw), shadowForAdapter);
  const osmPath = path.join(ART, `exp021-tesla-two-trip-research/${trip}/OSM_FROZEN_SNAPSHOT.json`);
  const overpass = JSON.parse(fs.readFileSync(osmPath, 'utf8')).overpassResponse;
  const cfg = lib.DEFAULT_CFG;
  const roadContext = lib.buildRoadContextFromOverpass(overpass, { buckets, corridorMarginM: 75 });
  const adj = lib.buildWayAdjacency(roadContext.ways);
  const graph = lib.buildDirectedCarRoutingGraph(overpass, roadContext.ways);
  return {
    ctx: { name: `TESLA_${trip}`, buckets, ways: roadContext.ways, roadContext, adj, graph, shadow: shadowForGates, cfg },
    sha: { evidenceGz: sha256File(gzPath), snapshotHash, osmSnapshot: sha256File(osmPath), shadowJsonl: sha256File(shadowPath) },
  };
}

export function sha256File(p: string): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

/** Deterministic PRNG for GPS-noise sensitivity. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function gaussian(rng: () => number): number {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
export function addGpsNoise(buckets: Bucket[], sigmaM: number, seed: number): Bucket[] {
  const rng = mulberry32(seed);
  return buckets.map((b) => {
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) return { ...b };
    const dN = gaussian(rng) * sigmaM;
    const dE = gaussian(rng) * sigmaM;
    return {
      ...b,
      latitude: b.latitude + dN / 111_320,
      longitude: b.longitude + dE / (111_320 * Math.cos((b.latitude * Math.PI) / 180)),
    };
  });
}

export function baselineHeadings(buckets: Bucket[]): (number | null)[] {
  const h: (number | null)[] = new Array(buckets.length).fill(null);
  for (let i = 1; i < buckets.length; i++) {
    const p = buckets[i - 1],
      c = buckets[i];
    if (p.availability === 'PRESENT' && c.availability === 'PRESENT' && p.latitude != null && c.latitude != null && p.longitude != null && c.longitude != null) {
      h[i] = lib.bearingDeg(p.latitude, p.longitude, c.latitude, c.longitude);
    }
  }
  return h;
}

export function sameSequence(a: Match[], b: Match[]): { ways: boolean; outcomes: boolean; diffCount: number } {
  let dw = 0,
    doc = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i].osmWayId !== b[i].osmWayId) dw++;
    if (a[i].outcome !== b[i].outcome) doc++;
  }
  return { ways: dw === 0, outcomes: doc === 0, diffCount: dw + doc };
}

/* ================================================================== PHASE 3 ADDITIONS */

/** Tesla 2026-10-16 (PHYS-TESLA-20261016, LDI10D fixture) — NOT used in Phase 2 model design or evaluation. */
export function loadTeslaLdi10d(): { ctx: DriveContext; sha: Record<string, string>; tacho: Map<string, number | null> } {
  const base = path.join(WORKTREE, 'architecture/drivingintelligence/evidence/ldi-10d');
  const gridPath = path.join(base, 'fixtures/tesla-20261016/TESLA_POSITION_GRID.json');
  const osmPath = path.join(base, 'LDI10D_TESLA_OSM_FROZEN_SNAPSHOT.json');
  const tachoPath = path.join(base, 'fixtures/tesla-20261016/VIDEO_TACHO_REFERENCE.json');
  const grid = JSON.parse(fs.readFileSync(gridPath, 'utf8'));
  const buckets: Bucket[] = grid.buckets.map((b: any) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability,
    latitude: b.latitude,
    longitude: b.longitude,
    l3SpeedKmh: b.pinnedProductionL3Kmh ?? null,
    qcTrustLevel: b.qcTrustLevel ?? null,
    motionState: null,
  }));
  const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));
  const overpass = osm.overpassResponse ?? osm;
  const cfg = lib.DEFAULT_CFG;
  const roadContext = lib.buildRoadContextFromOverpass(overpass, { buckets, corridorMarginM: 75 });
  const adj = lib.buildWayAdjacency(roadContext.ways);
  const graph = lib.buildDirectedCarRoutingGraph(overpass, roadContext.ways);
  const tacho = new Map<string, number | null>();
  for (const r of JSON.parse(fs.readFileSync(tachoPath, 'utf8')).rows) tacho.set(r.bucketLabelUtc, r.tachoKmh ?? null);
  return {
    ctx: { name: 'TESLA_LDI10D_20261016', buckets, ways: roadContext.ways, roadContext, adj, graph, shadow: new Map(), cfg },
    sha: { positionGrid: sha256File(gridPath), osmSnapshot: sha256File(osmPath), tachoReference: sha256File(tachoPath), pinnedSnapshotHash: grid.pinnedSnapshotHash },
    tacho,
  };
}

/* ------------------------------------------------------------------ oscillation / continuity metrics */
export type OscillationMetrics = {
  pathKm: number;
  movingSeconds: number;
  stationarySeconds: number;
  switches: number;
  switchesPerKm: number | null;
  switchesStationary: number;
  switchesPerStationaryMinute: number | null;
  switchesLowSpeed: number;
  /** A->B->A returns where the excursion to B lasts <= 5 s. */
  returnsWithin5s: number;
  /** Switches whose preceding displacement is < 2 m (sub-metre jitter). */
  switchesSubMetreDisp: number;
  /** Mean run length (s) of constant way id over decided PRESENT seconds. */
  meanRunLengthS: number | null;
  nullEpisodes: number;
};

export function oscillationMetrics(ctx: DriveContext, matches: Match[], stationary: Set<string>, lowSpeedKmh = 10): OscillationMetrics {
  const b = ctx.buckets;
  let pathM = 0,
    moving = 0,
    stat = 0;
  for (let i = 1; i < b.length; i++) {
    const p = b[i - 1],
      c = b[i];
    if (p.availability !== 'PRESENT' || c.availability !== 'PRESENT' || p.latitude == null || c.latitude == null) continue;
    pathM += haversine(p.latitude, p.longitude!, c.latitude, c.longitude!);
  }
  for (const x of b) {
    if (x.availability !== 'PRESENT' || x.latitude == null) continue;
    if (stationary.has(x.bucketLabelUtc)) stat++;
    else moving++;
  }
  let switches = 0,
    swStat = 0,
    swLow = 0,
    swSub = 0,
    returns = 0,
    nullEp = 0;
  const runs: number[] = [];
  let run = 0;
  let prevWay: number | null | undefined = undefined;
  let inNull = false;
  // sequence of (index, way) over PRESENT decided seconds, segment-local
  for (let i = 0; i < b.length; i++) {
    const x = b[i];
    if (x.availability !== 'PRESENT' || x.latitude == null) {
      if (run) runs.push(run);
      run = 0;
      prevWay = undefined;
      inNull = false;
      continue;
    }
    const w = matches[i].osmWayId;
    if (w == null) {
      if (!inNull) nullEp++;
      inNull = true;
      if (run) runs.push(run);
      run = 0;
      continue;
    }
    inNull = false;
    if (prevWay !== undefined && prevWay != null && w !== prevWay && i > 0 && matches[i - 1].osmWayId === prevWay) {
      switches++;
      if (stationary.has(x.bucketLabelUtc)) swStat++;
      const sp = x.l3SpeedKmh;
      if (sp != null && sp < lowSpeedKmh) swLow++;
      const p = b[i - 1];
      if (p.availability === 'PRESENT' && p.latitude != null && haversine(p.latitude, p.longitude!, x.latitude, x.longitude!) < 2) swSub++;
      // return within 5 s: look ahead for prevWay reappearing within 5 s while all between are w
      for (let k = i + 1; k <= Math.min(b.length - 1, i + 5); k++) {
        const wk = matches[k].osmWayId;
        if (b[k].availability !== 'PRESENT') break;
        if (wk === prevWay) {
          returns++;
          break;
        }
        if (wk !== w) break;
      }
      if (run) runs.push(run);
      run = 0;
    }
    run++;
    prevWay = w;
  }
  if (run) runs.push(run);
  const meanRun = runs.length ? runs.reduce((a, c) => a + c, 0) / runs.length : null;
  return {
    pathKm: Math.round(pathM / 10) / 100,
    movingSeconds: moving,
    stationarySeconds: stat,
    switches,
    switchesPerKm: pathM > 0 ? Math.round((switches / (pathM / 1000)) * 100) / 100 : null,
    switchesStationary: swStat,
    switchesPerStationaryMinute: stat > 0 ? Math.round((swStat / (stat / 60)) * 100) / 100 : null,
    switchesLowSpeed: swLow,
    returnsWithin5s: returns,
    switchesSubMetreDisp: swSub,
    meanRunLengthS: meanRun == null ? null : Math.round(meanRun * 10) / 10,
    nullEpisodes: nullEp,
  };
}

/** Stationary labels derived from the input only (not from any decoder): consecutive displacement < 1 m and (L3 null or < 3 km/h). */
export function inputStationaryLabels(buckets: Bucket[]): Set<string> {
  const s = new Set<string>();
  for (let i = 1; i < buckets.length; i++) {
    const p = buckets[i - 1],
      c = buckets[i];
    if (p.availability !== 'PRESENT' || c.availability !== 'PRESENT' || p.latitude == null || c.latitude == null) continue;
    const d = haversine(p.latitude, p.longitude!, c.latitude, c.longitude!);
    if (d < 1 && (c.l3SpeedKmh == null || c.l3SpeedKmh < 3)) s.add(c.bucketLabelUtc);
  }
  return s;
}

/* ------------------------------------------------------------------ deterministic perturbations */
function localBearing(b: Bucket[], i: number): number | null {
  const prev = i > 0 && b[i - 1].availability === 'PRESENT' && b[i - 1].latitude != null ? b[i - 1] : null;
  const next = i < b.length - 1 && b[i + 1].availability === 'PRESENT' && b[i + 1].latitude != null ? b[i + 1] : null;
  const a = prev ?? b[i],
    c = next ?? b[i];
  if (a === c) return null;
  const d = haversine(a.latitude!, a.longitude!, c.latitude!, c.longitude!);
  if (d < 0.5) return null;
  return lib.bearingDeg(a.latitude!, a.longitude!, c.latitude!, c.longitude!);
}

/** Systematic lateral offset (m) to the right (+) / left (-) of travel; carried through standstill using last bearing. */
export function lateralOffset(buckets: Bucket[], meters: number): Bucket[] {
  let lastBearing = 90;
  return buckets.map((b, i) => {
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) return { ...b };
    const br = localBearing(buckets, i);
    if (br != null) lastBearing = br;
    const normal = ((lastBearing + 90) * Math.PI) / 180;
    const dN = Math.cos(normal) * meters;
    const dE = Math.sin(normal) * meters;
    return { ...b, latitude: b.latitude + dN / 111_320, longitude: b.longitude + dE / (111_320 * Math.cos((b.latitude * Math.PI) / 180)) };
  });
}

/** Repeated coordinates: with probability `frac` a PRESENT bucket re-emits the previous PRESENT coordinate (receiver hold). */
export function repeatCoordinates(buckets: Bucket[], frac: number, seed: number): Bucket[] {
  const rng = mulberry32(seed);
  const out: Bucket[] = [];
  let lastLat: number | null = null,
    lastLon: number | null = null;
  for (const b of buckets) {
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) {
      out.push({ ...b });
      continue;
    }
    if (lastLat != null && rng() < frac) out.push({ ...b, latitude: lastLat, longitude: lastLon! });
    else {
      out.push({ ...b });
      lastLat = b.latitude;
      lastLon = b.longitude;
    }
  }
  return out;
}

/** Out-of-order observations: swap coordinates of adjacent PRESENT buckets with probability `frac` (timestamps keep order). */
export function swapAdjacent(buckets: Bucket[], frac: number, seed: number): Bucket[] {
  const rng = mulberry32(seed);
  const out = buckets.map((b) => ({ ...b }));
  for (let i = 1; i < out.length; i++) {
    const p = out[i - 1],
      c = out[i];
    if (p.availability !== 'PRESENT' || c.availability !== 'PRESENT' || p.latitude == null || c.latitude == null) continue;
    if (rng() < frac) {
      const la = p.latitude,
        lo = p.longitude;
      p.latitude = c.latitude;
      p.longitude = c.longitude;
      c.latitude = la;
      c.longitude = lo;
      i++; // do not chain swaps
    }
  }
  return out;
}

/** GPS gaps: insert `n` ROW_ABSENT gaps of `len` seconds at deterministic positions among PRESENT runs. */
export function insertGaps(buckets: Bucket[], n: number, len: number, seed: number): Bucket[] {
  const rng = mulberry32(seed);
  const out = buckets.map((b) => ({ ...b }));
  const presentIdx = out.map((b, i) => (b.availability === 'PRESENT' && b.latitude != null ? i : -1)).filter((i) => i >= 0);
  const starts = new Set<number>();
  let guard = 0;
  while (starts.size < n && guard++ < 10_000) {
    const i = presentIdx[Math.floor(rng() * presentIdx.length)];
    if ([...starts].some((s) => Math.abs(s - i) < len + 5)) continue;
    starts.add(i);
  }
  for (const s of starts) for (let k = s; k < Math.min(out.length, s + len); k++) out[k] = { ...out[k], availability: 'ROW_ABSENT', latitude: null, longitude: null };
  return out;
}

/** Low-speed jitter: Gaussian noise (sigma m) applied only where L3 < speedThr km/h (or L3 null and displacement < 1 m). */
export function lowSpeedJitter(buckets: Bucket[], sigmaM: number, speedThr: number, seed: number): Bucket[] {
  const rng = mulberry32(seed);
  return buckets.map((b, i) => {
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) return { ...b };
    const slow =
      (b.l3SpeedKmh != null && b.l3SpeedKmh < speedThr) ||
      (b.l3SpeedKmh == null && i > 0 && buckets[i - 1].latitude != null && haversine(buckets[i - 1].latitude!, buckets[i - 1].longitude!, b.latitude, b.longitude) < 1);
    if (!slow) return { ...b };
    const dN = gaussian(rng) * sigmaM,
      dE = gaussian(rng) * sigmaM;
    return { ...b, latitude: b.latitude + dN / 111_320, longitude: b.longitude + dE / (111_320 * Math.cos((b.latitude * Math.PI) / 180)) };
  });
}

/* ------------------------------------------------------------------ calibration */
export type CalibRow = { model: string; drive: string; variant: string; bin: string; n: number; correct: number; falseConfirmed: number; accuracy: number | null };

/** Accuracy of decided GT seconds per confidence bin (label, path margin bin, posterior bin). */
export function calibrationRows(ctx: DriveContext, run: ModelRun, gt: GtMap, variant: string): CalibRow[] {
  const bins = new Map<string, { n: number; c: number; fc: number }>();
  const add = (k: string, ok: boolean, confirmed: boolean) => {
    const e = bins.get(k) ?? { n: 0, c: 0, fc: 0 };
    e.n++;
    if (ok) e.c++;
    else if (confirmed) e.fc++;
    bins.set(k, e);
  };
  for (let i = 0; i < ctx.buckets.length; i++) {
    const b = ctx.buckets[i];
    const ref = gt.get(b.bucketLabelUtc);
    if (!ref || !ref.size || b.availability !== 'PRESENT' || b.latitude == null) continue;
    const m = run.matches[i];
    if (m.osmWayId == null) continue;
    const ok = ref.has(m.osmWayId);
    add(`label:${m.outcome}`, ok, m.outcome === 'CONFIRMED');
    if (m.pathMargin != null) {
      const pm = m.pathMargin;
      const k = pm === Infinity ? 'margin:inf' : pm < 5 ? 'margin:[0,5)' : pm < 10 ? 'margin:[5,10)' : pm < 20 ? 'margin:[10,20)' : pm < 50 ? 'margin:[20,50)' : 'margin:[50,inf)';
      add(k, ok, m.outcome === 'CONFIRMED');
    }
    if (m.posteriorMax != null) {
      const p = m.posteriorMax;
      const k = p < 0.5 ? 'post:[0,0.5)' : p < 0.8 ? 'post:[0.5,0.8)' : p < 0.9 ? 'post:[0.8,0.9)' : p < 0.99 ? 'post:[0.9,0.99)' : 'post:[0.99,1]';
      add(k, ok, m.outcome === 'CONFIRMED');
    }
  }
  return [...bins.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([bin, e]) => ({ model: run.model, drive: ctx.name, variant, bin, n: e.n, correct: e.c, falseConfirmed: e.fc, accuracy: e.n ? Math.round((e.c / e.n) * 1000) / 1000 : null }));
}

export function toCsv(rows: Record<string, any>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: any) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}
