'use strict';
/**
 * Offline research post-pass on production FSM labels (no motion-fsm.ts mutation).
 * Candidate id: FSM_GAP_BRIDGE_RESEARCH_V1
 *
 * Mechanisms:
 * 1) FROZEN_POSITION + DI-V0 STATIONARY_SUPPORTED while UNKNOWN → stop observation (no invented speed).
 * 2) Retrospective gap bridge: UNKNOWN runs bracketed by MOVING/STARTING with endpoint displacement
 *    implying cruise speed; blocks embedded stops via L3 still / low-displacement runs on raw positions.
 */
const CANDIDATE_ID = 'FSM_GAP_BRIDGE_RESEARCH_V1';

/** @param {typeof import('../../../../backend/src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/motion-fsm').MOTION_FSM_PARAMS_V0_2_DEV>} params */
function defaultParams() {
  return {
    stationaryBandMaxKmh: 3.0,
    movingBandMinKmh: 5.0,
    stopConfirmS: 3,
    gapShortMaxS: 3,
    gapLowSpeedContextKmh: 10.0,
    gapLongMaxS: 60,
    reappearNoiseM: 3.0,
    startingMaxS: 5,
    lookaheadS: 5,
  };
}

function cloneLabel(l) {
  return {
    ...l,
    flags: [...(l.flags ?? [])],
  };
}

function isMovingSide(state) {
  return state === 'MOVING' || state === 'STARTING';
}

function isStopSide(state) {
  return state === 'STATIONARY' || state === 'STOP_CANDIDATE';
}

/**
 * @param {Array<{label:string,state:string,evidenceQuality:string,reason:string,speedKmh:number|null,flags?:string[]}>} labels
 * @param {Map<number,{speed:number|null,state:string|null}>} l3BySec
 * @param {Map<number,{valueKmh:number|null,quality:string}>} c4BySec
 * @param {(sec:number)=>{availability:string,latitude:number|null,longitude:number|null}|undefined} bucketAtSec
 * @param {ReturnType<typeof defaultParams>} params
 */
function applyFrozenStandEvidenceInUnknown(labels, l3BySec, c4BySec, bucketAtSec, params, secOf) {
  const p = params;
  let stopObs = 0;
  const audit = [];
  const out = labels.map(cloneLabel);
  for (let i = 0; i < out.length; i++) {
    const lab = out[i];
    const sec = secOf(lab.label);
    if (lab.state === 'STATIONARY' || lab.state === 'STOP_CANDIDATE') {
      stopObs = lab.state === 'STATIONARY' ? p.stopConfirmS : Math.max(stopObs, 1);
    } else if (isMovingSide(lab.state)) {
      stopObs = 0;
    }
    if (lab.state !== 'UNKNOWN') continue;
    const l3 = l3BySec.get(sec);
    const c4 = c4BySec.get(sec);
    const b = bucketAtSec(sec);
    const frozen = c4?.quality === 'FROZEN_POSITION';
    const stationarySupported = l3?.state === 'STATIONARY_SUPPORTED';
    if (!frozen || !stationarySupported) continue;
    if (!b || b.availability !== 'PRESENT') continue;
    stopObs += 1;
    if (stopObs >= p.stopConfirmS) {
      lab.state = 'STATIONARY';
      lab.reason = 'research_frozen_stationary_supported_confirmed';
    } else {
      lab.state = 'STOP_CANDIDATE';
      lab.reason = 'research_frozen_stationary_supported_observing';
    }
    lab.evidenceQuality = 'INFERRED';
    lab.flags.push('FSM_GAP_BRIDGE_V1_FROZEN_STAND');
    audit.push({ sec, mechanism: 'FROZEN_STAND', toState: lab.state, stopObs });
  }
  return { labels: out, audit };
}

function lastPresentBefore(kinBuckets, sec, secOf) {
  let best = null;
  for (const b of kinBuckets) {
    const s = secOf(b.bucketLabelUtc);
    if (s > sec) break;
    if (b.availability === 'PRESENT' && b.latitude != null && b.longitude != null) best = b;
  }
  return best;
}

function firstPresentAtOrAfter(kinBuckets, sec, secOf) {
  for (const b of kinBuckets) {
    const s = secOf(b.bucketLabelUtc);
    if (s < sec) continue;
    if (b.availability === 'PRESENT' && b.latitude != null && b.longitude != null) return b;
  }
  return null;
}

/**
 * @param {ReturnType<typeof import('../scripts/eval_lib.cjs')>} L
 */
function hasEmbeddedStopInWindow(L, kinBuckets, l3BySec, startSec, endSec, secOf, params, haversineMetersFn) {
  const p = params;
  let lowDispRun = 0;
  let lastPresent = null;
  for (const b of kinBuckets) {
    const s = secOf(b.bucketLabelUtc);
    if (s < startSec || s > endSec) continue;
    const l3 = l3BySec.get(s);
    if (l3?.state === 'STATIONARY_SUPPORTED') return true;
    if (L.l3Claim(l3?.speed ?? null, l3?.state ?? null) === 'STILL') return true;
    if (b.availability !== 'PRESENT' || b.latitude == null || b.longitude == null) continue;
    if (lastPresent) {
      const d = haversineMetersFn(
        lastPresent.latitude,
        lastPresent.longitude,
        b.latitude,
        b.longitude,
      );
      if (d <= p.reappearNoiseM) {
        lowDispRun += 1;
        if (lowDispRun >= p.stopConfirmS) return true;
      } else {
        lowDispRun = 0;
      }
    }
    lastPresent = b;
  }
  return false;
}

function anchorUsable(label) {
  if (!label) return false;
  if (!isMovingSide(label.state)) return false;
  if (label.evidenceQuality === 'INDETERMINATE') return false;
  return true;
}

/**
 * @param {Array} labels after frozen pass
 */
function applyRetrospectiveGapBridge(labels, kinBuckets, l3BySec, secOf, params, L, haversineMetersFn) {
  const p = params;
  const audit = [];
  const out = labels.map(cloneLabel);
  let i = 0;
  while (i < out.length) {
    if (out[i].state !== 'UNKNOWN') {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < out.length && out[j + 1].state === 'UNKNOWN') j += 1;
    const startSec = secOf(out[i].label);
    const endSec = secOf(out[j].label);
    const left = i > 0 ? out[i - 1] : null;
    const right = j + 1 < out.length ? out[j + 1] : null;
    const spanS = endSec - startSec + 1;
    if (spanS > p.gapLongMaxS) {
      i = j + 1;
      continue;
    }
    if (!anchorUsable(left) || !anchorUsable(right)) {
      i = j + 1;
      continue;
    }
    if (hasEmbeddedStopInWindow(L, kinBuckets, l3BySec, startSec, endSec, secOf, p, haversineMetersFn)) {
      audit.push({ startSec, endSec, mechanism: 'GAP_BRIDGE_BLOCKED_EMBEDDED_STOP' });
      i = j + 1;
      continue;
    }
    const a = lastPresentBefore(kinBuckets, startSec - 1, secOf);
    const b = firstPresentAtOrAfter(kinBuckets, endSec + 1, secOf);
    if (!a || !b) {
      audit.push({ startSec, endSec, mechanism: 'GAP_BRIDGE_BLOCKED_NO_ENDPOINT_POSITION' });
      i = j + 1;
      continue;
    }
    const dtS = Math.max(1, secOf(b.bucketLabelUtc) - secOf(a.bucketLabelUtc));
    const dispM = haversineMetersFn(a.latitude, a.longitude, b.latitude, b.longitude);
    const impliedKmh = (dispM / dtS) * 3.6;
    if (impliedKmh < p.movingBandMinKmh) {
      audit.push({ startSec, endSec, mechanism: 'GAP_BRIDGE_BLOCKED_LOW_IMPLIED_SPEED', impliedKmh });
      i = j + 1;
      continue;
    }
    for (let k = i; k <= j; k++) {
      out[k].state = 'MOVING';
      out[k].evidenceQuality = 'INFERRED';
      out[k].reason = 'research_retro_gap_bridge_endpoint_displacement';
      out[k].speedKmh = null;
      out[k].flags.push(`FSM_GAP_BRIDGE_V1_BRIDGE;implied_mean_kmh=${impliedKmh.toFixed(1)}`);
    }
    audit.push({
      startSec,
      endSec,
      mechanism: 'GAP_BRIDGE_APPLIED',
      impliedKmh,
      dispM,
      dtS,
      anchorLeft: left.state,
      anchorRight: right.state,
    });
    i = j + 1;
  }
  return { labels: out, audit };
}

/**
 * Full research candidate pipeline.
 * @param {object} deps { haversineMeters, secOf, L, params? }
 */
function applyFsmGapBridgeResearchV1(baselineFsm, kinBuckets, c4Samples, l3BySec, deps) {
  const { haversineMeters, secOf, L } = deps;
  const params = deps.params ?? defaultParams();
  const c4BySec = new Map(c4Samples.map((s) => [secOf(s.label), { valueKmh: s.valueKmh, quality: s.quality }]));
  const bucketAtSec = (sec) => kinBuckets.find((b) => secOf(b.bucketLabelUtc) === sec);
  const frozen = applyFrozenStandEvidenceInUnknown(
    baselineFsm,
    l3BySec,
    c4BySec,
    bucketAtSec,
    params,
    secOf,
  );
  const bridged = applyRetrospectiveGapBridge(
    frozen.labels,
    kinBuckets,
    l3BySec,
    secOf,
    params,
    L,
    haversineMeters,
  );
  return {
    candidateId: CANDIDATE_ID,
    labels: bridged.labels,
    audit: [...frozen.audit, ...bridged.audit],
  };
}

module.exports = {
  CANDIDATE_ID,
  defaultParams,
  applyFsmGapBridgeResearchV1,
  applyFrozenStandEvidenceInUnknown,
  applyRetrospectiveGapBridge,
};
