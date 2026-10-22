/** RESEARCH ONLY. No runtime integration or calibrated production threshold.
 * Conservative hypothesis: ambiguous endpoints of impossible 1 s travel are unavailable to
 * kinematics, rather than deciding which of two positions is true. Raw evidence is untouched.
 * 400 km/h is a deliberately broad EXPERIMENTAL road-vehicle guard, not a speeding limit.
 * Sensitivity at 300/350/400/500/600 km/h is evaluated separately; this does not validate a default.
 */
import { haversineMeters } from './backend/src/modules/vehicle-intelligence/driving-intelligence/core/geo/haversine.ts';
import { computeC4AdaptiveL3 } from './backend/src/modules/vehicle-intelligence/driving-intelligence/core/kinematics/c4-adaptive-l3.ts';

export function candidateLegQuarantine(buckets, maxLegKmh = 400) {
  const ordered = [...buckets].sort((a,b)=>a.bucketLabelUtc.localeCompare(b.bucketLabelUtc));
  const invalidLegs = [];
  const rejected = new Set();
  for (let i=1;i<ordered.length;i++) {
    const a=ordered[i-1],b=ordered[i];
    if ([a,b].some(x=>x.availability!=='PRESENT'||!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude))) continue;
    const dt=(Date.parse(b.bucketLabelUtc)-Date.parse(a.bucketLabelUtc))/1000;
    if (dt!==1) continue;
    const distanceM=haversineMeters(a.latitude,a.longitude,b.latitude,b.longitude);
    const speedKmh=distanceM*3.6/dt;
    if (speedKmh<=maxLegKmh) continue;
    rejected.add(a.bucketLabelUtc);rejected.add(b.bucketLabelUtc);
    invalidLegs.push({start:a.bucketLabelUtc,end:b.bucketLabelUtc,distanceM,speedKmh});
  }
  const grid=ordered.map(b=>rejected.has(b.bucketLabelUtc)?{...b,availability:'ROW_ABSENT',latitude:null,longitude:null}:{...b});
  const c4=computeC4AdaptiveL3(grid).map(s=>rejected.has(s.label)?{
    ...s,valueKmh:null,quality:'OUTLIER_REJECTED',supportLabels:[s.label],supportSpanS:null,
    flags:['RESEARCH_IMPLAUSIBLE_1S_LEG_ENDPOINT_UNCERTAIN'],estimator:'RESEARCH_LEG_QUARANTINE_CANDIDATE_V1',
  }:s);
  return {grid,c4,invalidLegs,rejectedLabels:[...rejected],maxLegKmh};
}
