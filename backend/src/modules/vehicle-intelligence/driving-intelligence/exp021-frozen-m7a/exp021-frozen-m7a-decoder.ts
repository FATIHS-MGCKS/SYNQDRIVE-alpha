/**
 * EXP021 Phase 5A frozen M7A decoder (parity with phase3_lib.snapshot.ts @ research SHA 477ecad…).
 * Do not retune — bundle version gates reprocessing.
 */
import { createHash } from 'node:crypto';
import {
  DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG,
  DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG,
  bearingDeg,
  buildDirectedCarRoutingGraph,
  buildWayAdjacency,
  buildRoadContextFromOverpass,
  nearestWayCandidates,
  emissionCostFromHits,
  transitionCost,
  tieBreakWayId,
  emissionCostFromHitsDirectionAwareP1 as emissionP1,
  computeRouteAwareTransitionCost,
  queryRouteBetweenProjections,
  clearRouteQueryCache,
  projectBucketOntoWay,
} from '../s4-research';
import type { ResearchGpsBucket } from '../s4-research/contracts';

const DEFAULT_ROUTE_CFG = DEFAULT_S4_ROUTE_AWARE_RESEARCH_CONFIG;
const DEFAULT_CFG = DEFAULT_S4_RESEARCH_ALGORITHM_CONFIG;

export type FrozenM7aBucket = {
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

function emptyMatch(b: FrozenM7aBucket, reasons: string[]): Match {
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
  segB: FrozenM7aBucket[],
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
      nearestWayCandidates(b.latitude!, b.longitude!, ways, cfg.uncertaintyRadiusM, cfg.pointToSegmentDistanceM).slice(
        0,
        K,
      ),
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
      ? emissionP1(segH[t], w, hitsPer[t], cfg)
      : emissionCostFromHits(segH[t], w, hitsPer[t], cfg);
  };
  const dispM = (t: number) =>
    haversine(segB[t - 1].latitude!, segB[t - 1].longitude!, segB[t].latitude!, segB[t].longitude!);
  const wayToWay = (t: number, pw: number, cw: number): number => {
    if (o.standstillGuardM != null && pw === cw && dispM(t) < o.standstillGuardM) return 0;
    if (o.transition === 'ADJACENCY') return transitionCost(pw, cw, o.adj!, segB[t].l3SpeedKmh);
    const parts = computeRouteAwareTransitionCost(
      o.graph,
      segB[t - 1],
      segB[t],
      waysById.get(pw),
      waysById.get(cw),
      cfg,
      o.routeCfg ?? DEFAULT_ROUTE_CFG,
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
        const wd = tieBreakWayId(L[i].w) - tieBreakWayId(L[end].w);
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
  buckets: FrozenM7aBucket[],
  ways: any[],
  headings: (number | null)[],
  cfg: any,
  o: GenericDecoderOpts,
): Match[] {
  if (o.transition === 'ROUTE_AWARE') clearRouteQueryCache(o.graph);
  const out: Match[] = [];
  let segB: FrozenM7aBucket[] = [];
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
  buckets: FrozenM7aBucket[],
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

export function baselineHeadings(buckets: FrozenM7aBucket[]): (number | null)[] {
  const h: (number | null)[] = new Array(buckets.length).fill(null);
  for (let i = 1; i < buckets.length; i++) {
    const p = buckets[i - 1];
    const c = buckets[i];
    if (
      p.availability === 'PRESENT' &&
      c.availability === 'PRESENT' &&
      p.latitude != null &&
      c.latitude != null &&
      p.longitude != null &&
      c.longitude != null
    ) {
      h[i] = bearingDeg(p.latitude, p.longitude, c.latitude, c.longitude);
    }
  }
  return h;
}

export type M7aRuntimeContext = {
  buckets: FrozenM7aBucket[];
  ways: any[];
  roadContext: any;
  graph: any;
  cfg: typeof DEFAULT_CFG;
};

export function bucketsFromResearchGrid(buckets: ResearchGpsBucket[]): FrozenM7aBucket[] {
  return buckets.map((b) => ({
    bucketLabelUtc: b.bucketLabelUtc,
    availability: b.availability,
    latitude: b.latitude,
    longitude: b.longitude,
    l3SpeedKmh: b.l3SpeedKmh ?? null,
    qcTrustLevel: b.qcTrustLevel ?? null,
    motionState: b.motionState ?? null,
  }));
}

export function buildM7aRuntimeContext(input: {
  buckets: ResearchGpsBucket[];
  overpassBody: { elements?: unknown[] };
  corridorMarginM: number;
}): M7aRuntimeContext {
  const buckets = bucketsFromResearchGrid(input.buckets);
  const cfg = DEFAULT_CFG;
  const overpass = input.overpassBody as { elements?: Array<Record<string, unknown>> };
  const roadContext = buildRoadContextFromOverpass(overpass, {
    buckets: input.buckets,
    corridorMarginM: input.corridorMarginM,
  });
  const graph = buildDirectedCarRoutingGraph(overpass, roadContext.ways);
  return { buckets, ways: roadContext.ways, roadContext, graph, cfg };
}

export function runFrozenM7a(ctx: M7aRuntimeContext): { matches: Match[]; cpuMs: number } {
  const c0 = process.cpuUsage();
  const headings = baselineHeadings(ctx.buckets);
  const matches = decodeGeneric(
    ctx.buckets,
    ctx.ways,
    guardedHeadings(ctx.buckets, headings),
    ctx.cfg,
    {
      emission: 'P1',
      transition: 'ROUTE_AWARE',
      decode: 'BACKTRACK',
      confidence: 'GAP',
      graph: ctx.graph,
      nullMemory: true,
      standstillGuardM: 2,
    },
  );
  const c1 = process.cpuUsage(c0);
  return { matches, cpuMs: (c1.user + c1.system) / 1000 };
}

export function perBucketAssignmentHash(matches: Match[]): string {
  const payload = matches.map((m) => `${m.bucketLabelUtc}|${m.osmWayId ?? ''}|${m.outcome}`).join('\n');
  return createHash('sha256').update(payload).digest('hex');
}
