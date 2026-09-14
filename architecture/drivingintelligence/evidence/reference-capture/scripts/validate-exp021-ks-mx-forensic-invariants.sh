#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LEDGER="$(cd "$ROOT/../../research" && pwd)/CHANGE_LEDGER.md"

node -e "
const fs=require('fs');
const path=require('path');
const dir='${ROOT}';
const ledger=fs.readFileSync('${LEDGER}','utf8');
const v1=JSON.parse(fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.json'),'utf8'));
const v2=JSON.parse(fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json'),'utf8'));
const c=JSON.parse(fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_CONSISTENCY_2026-09-14.json'),'utf8'));
const md=fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.md'),'utf8');
const freeze=fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_EVIDENCE_FREEZE_2026-09-14.md'),'utf8');
const lifecycle=fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_INCOMPLETE_SHORT_AB_FORENSIC_FREEZE_2026-09-14.md'),'utf8');
const all=JSON.stringify({v1,v2,c})+md+freeze+lifecycle+ledger;
const scan=all.replace(/OLD_VALUE[^,}]*/g,'');
const assert=(ok,m)=>{ if(!ok) throw new Error(m); };
const TRIP_END_MS=Date.parse('2026-09-14T12:04:15.000Z');
const T0_MS=Date.parse('2026-09-14T11:43:53.000Z');
const T0_END_MS=T0_MS+600000;
const VERSION='EXP-021-KS-MX-2024-FORENSIC-CONSISTENCY-v4';
const PERCENTILE_METHOD='NEAREST_RANK';

function buildGapList(ts, threshold=10000){
  const list=[];
  for(let i=1;i<ts.length;i++){
    const durationMs=ts[i]-ts[i-1];
    if(durationMs>=threshold) list.push({durationMs,start:new Date(ts[i-1]).toISOString(),end:new Date(ts[i]).toISOString()});
  }
  return list;
}
function nearestRank(sorted,p){ return sorted[Math.ceil(p*sorted.length)-1]; }
function validateGapList(label, list, ts){
  const pairs=new Set();
  for(const g of list){
    const d=Date.parse(g.end)-Date.parse(g.start);
    assert(g.durationMs===d, label+' gap tuple duration mismatch: '+g.durationMs+' vs '+d+' for '+g.start+'->'+g.end);
    assert(g.durationMs>=10000, label+' gap below threshold: '+g.durationMs);
    const key=g.start+'|'+g.end;
    assert(!pairs.has(key), label+' duplicate gap tuple: '+key);
    pairs.add(key);
  }
  const expected=buildGapList(ts);
  assert(list.length===expected.length, label+' gap list length mismatch');
  for(let i=0;i<expected.length;i++){
    assert(list[i].durationMs===expected[i].durationMs, label+' gap list content mismatch at '+i);
    assert(list[i].start===expected[i].start, label+' gap start mismatch at '+i);
    assert(list[i].end===expected[i].end, label+' gap end mismatch at '+i);
  }
}

// provider
assert(v1.phase14_provider.TOTAL_REQUESTS===7,'v1 provider total');
assert(v1.phase14_provider.TOTAL_SUCCESS===5,'v1 provider success');
assert(v1.phase14_provider.TOTAL_FAILURE===2,'v1 provider failure');
assert(v1.phase7_nominal10Min['90_NOMINAL_PROVIDER_REQUEST_COUNT']===7,'phase7 requests');
assert(v1.phase6_fiveMinuteWindows.W1.providerRequests===4,'W1 provider');
assert(v1.phase6_fiveMinuteWindows.W2.providerRequests===3,'W2 provider');
assert(v1.phase6_fiveMinuteWindows.W1.providerSuccesses+v1.phase6_fiveMinuteWindows.W2.providerSuccesses===5,'window success sum');
assert(v1.phase6_fiveMinuteWindows.W1.providerFailures+v1.phase6_fiveMinuteWindows.W2.providerFailures===2,'window failure sum');

// gaps + percentiles
const A=v1.phase4_nativeTelemetry.byWindow.A_nominal;
const ts=A.timestamps.map(s=>Date.parse(s));
const gaps=[]; for(let i=1;i<ts.length;i++) gaps.push(ts[i]-ts[i-1]);
const sorted=[...gaps].sort((a,b)=>a-b);
assert(ts.length===25,'unique buckets');
assert(gaps.length===24,'interval count');
assert(A.gapsGte10s===gaps.filter(g=>g>=10000).length,'gte10');
assert(A.gapsGte20s===gaps.filter(g=>g>=20000).length,'gte20');
assert(A.gapsGte30s===gaps.filter(g=>g>=30000).length,'gte30');
assert(A.gapsGte60s===gaps.filter(g=>g>=60000).length,'gte60');
assert(A.gapList10s.length===A.gapsGte10s,'gap list len 10');
validateGapList('A_nominal', A.gapList10s, ts);
validateGapList('W1', v1.phase6_fiveMinuteWindows.W1.gapList10s, ts.filter(t=>t>=T0_MS && t<T0_MS+300000));
validateGapList('W2', v1.phase6_fiveMinuteWindows.W2.gapList10s, ts.filter(t=>t>=T0_MS+300000 && t<T0_END_MS));
assert(A.windowEdgeGaps.START_EDGE_GAP_MS===159544,'start edge');
assert(A.windowEdgeGaps.END_EDGE_GAP_MS===66799,'end edge');
assert(A.fullWindowCoverage.FULL_WINDOW_MAX_UNOBSERVED_GAP_MS===159544,'full max');
assert(v1.phase4_nativeTelemetry.PERCENTILE_METHOD===PERCENTILE_METHOD,'v1 percentile method');
const expectedPct={
  p50:nearestRank(sorted,0.5), p75:nearestRank(sorted,0.75), p90:nearestRank(sorted,0.9),
  p95:nearestRank(sorted,0.95), p99:nearestRank(sorted,0.99), max:sorted[sorted.length-1]
};
for(const [k,v] of Object.entries(expectedPct)){
  assert(A.deltas[k]===v,'A_nominal percentile '+k);
  assert(v1.phase7_nominal10Min.interBucketPercentiles[k]===v,'phase7 percentile '+k);
  assert(c.nativeHfBuckets.interBucketPercentiles[k]===v,'consistency percentile '+k);
}
assert(md.includes('15s / 20s / 21s'),'human md percentiles');
assert(!md.includes('17,000'),'stale floor percentile in md');

// full_pre_freeze semantics
const fpf=v1.phase4_nativeTelemetry.byWindow.full_pre_freeze;
assert(fpf.HF_CONTINUITY_AFTER_NOMINAL_WINDOW==='NOT_APPLICABLE_NO_HF_SLOTS_SCHEDULED','full_pre_freeze continuity');
assert(fpf.END_EDGE_GAP_MS==null && fpf.windowEdgeGaps==null,'full_pre_freeze must not carry nominal edge metrics');

// RC partition
const rc=v1.rcObservationAccounting;
assert(rc.RC_TOTAL_PERSISTED===11413,'rc total');
assert(rc.RC_PRE_T0+rc.RC_A+rc.RC_B+rc.RC_C+rc.RC_D===11413,'rc partition');
assert(rc.RC_A===1058,'rc A');
assert(rc.RC_PRE_T0===365,'rc preT0');
assert(v2.referenceCaptureObservations.byWindow.A_nominal===1058,'v2 A');

// settlement
assert(v1.phase10_settlement.EXPECTED_TOTAL_OBSERVATIONS===114,'settlement expected');
assert(v1.phase10_settlement.ACTUAL_TOTAL_OBSERVATIONS===114,'settlement actual');
assert(v1.phase10_settlement.VALUE_REVISIONS==='NOT_ASSESSED','value revisions');
assert(v1.phase10_settlement.GAP_RECONSTRUCTABILITY==='NOT_PROVEN','gap recon');
assert(v2.tenCriticalQuestions.Q5_settlementDuringTail.SETTLEMENT_DURING_POST_TRIP_TAIL==='NO','Q5 post-trip settlement');
assert(v1.phase4_postNominalHf.SETTLEMENT_DURING_POST_TRIP_TAIL==='NO','phase4 post nominal settlement tail');
assert(v1.phase4_postNominalHf.SETTLEMENT_CONTINUED_AFTER_NOMINAL_10MIN_END==='YES','settlement after nominal end');
assert(v1.phase4_postNominalHf.POST_10_MIN_RC_SOURCE==='RC_ACQUISITION_RUNNER_CYCLE','post 10 min rc source');
assert(v1.phase4_postNominalHf.POST_10_MIN_HF_DETERMINISTIC_REQUESTS===0,'post 10 min hf requests');
assert(v1.phase4_postNominalHf.POST_10_MIN_NATIVE_HF_BUCKETS===0,'post 10 min native buckets');

// movement / duration
assert(v1.durations.T0_TO_TRIP_END_WALL_DURATION_MS===1222000,'wall duration');
assert(v1.durations.ACTUAL_MOVING_DURATION_MS==null,'no actual moving');
assert(v1.phase9_postTripTail.POST_TRIP_FALSE_MOVEMENT==='NOT_ASSESSED','post trip false movement');
assert(v2.tenCriticalQuestions.Q3_validMovementStopped.VALID_MOVEMENT_DURATION_BEHAVIOR==='NOT_ASSESSED','Q3 valid movement');
assert(v1.movementSemantics.VALID_MOVEMENT_DURATION_BEHAVIOR==='NOT_ASSESSED','movement semantics');

// no ACTIVE_TRIP after trip end in windows entirely after trip end
for(const k of ['W6','W7','W8','W9','W10']){
  assert(v1.phase6_fiveMinuteWindows[k].TRIP_STATE_CLASS==='POST_TRIP_RESTING_COMPLETED',k+' trip state');
  assert(v1.phase6_fiveMinuteWindows[k].PHYSICAL_MOVEMENT_CLASS==='NOT_ASSESSED',k+' physical movement');
  assert(v2.extendedTimeSlices[k].TRIP_STATE_CLASS==='POST_TRIP_RESTING_COMPLETED','v2 '+k+' trip state');
}
for(const k of ['W6','W7','W8','W9','W10','C','D']){
  const phys=v1.phase6_fiveMinuteWindows[k]?.PHYSICAL_MOVEMENT_CLASS;
  if(phys) assert(phys!=='STATIONARY',k+' must not claim STATIONARY');
}

// signal completeness
assert(v1.phase5_signalCompleteness.CANONICAL_KEY_AVAILABILITY==='NOT_ASSESSED','signal completeness');
const sigJson=JSON.stringify(v1.phase5_signalCompleteness);
assert(!/\"availabilityPct\":\s*0/.test(sigJson),'signal availabilityPct zero placeholder');

// recorder + version refs
assert(c.recorderRepair.RECORDER_CODE_CHANGE_REQUIRED_FOR_CANONICAL_NEXT_RUN==='NO','recorder no for canonical');
assert(c.recorderRepair.CODE_CHANGE_REQUIRED_TO_SUPPORT_MIXED_MANUAL_ATTACH_PATH==='YES','mixed path yes');
assert(v1.consistencyArtifactVersion===VERSION,'v1 consistency version');
assert(v2.consistencyArtifactVersion===VERSION,'v2 consistency version');
assert(c.freezeVersion===VERSION,'consistency freeze version');
assert(md.includes('v4 derived'),'md references consistency v4');
assert(ledger.includes('RECORDER_CODE_CHANGE_REQUIRED_FOR_CANONICAL_NEXT_RUN=NO'),'ledger recorder canonical');
assert(ledger.includes('CODE_CHANGE_REQUIRED_TO_SUPPORT_MIXED_MANUAL_ATTACH_PATH=YES'),'ledger mixed path');

// phase numbering unique in forensic md
const phaseNums=[...md.matchAll(/^## Phase (\d+)/gm)].map(m=>Number(m[1]));
const dup=phaseNums.filter((n,i,a)=>a.indexOf(n)!==i);
assert(dup.length===0,'duplicate phase numbers: '+dup.join(','));

// forbidden stale strings
const forbidden=[
  /RC_ACQUISITION_RUNNER_HEARTBEAT_ONLY/,
  /\"movementClass\":/,
  /UNKNOWN_WITH_ACTIVE_TRIP/,
  /\"SETTLEMENT_CONTINUED\":\s*\"YES\"/,
  /no false movement/i,
  /falseMovement\":\s*\"NO\"/,
  /\"VALID_FOR_CADENCE_SELECTION\":\s*\"YES\"/,
  /\"VALID_FOR_PRODUCTION_CADENCE_SELECTION\":\s*\"YES\"/,
  /\"VALID_90_VS_60_COMPARISON\":\s*\"YES\"/,
  /Settlement improved reconstructability/i,
  /VALUE_REVISIONS\":\s*0/,
  /byKind\":\s*\{\s*\"SIGNAL_POINT\":\s*1\s*\}/,
  /pending ownership\/runbook fix/i,
  /116 minutes past nominal 10-minute wall/i,
  /Consistency JSON \(v3 derived\)/,
];
for (const re of forbidden) {
  assert(!re.test(scan), 'forbidden stale pattern: '+re);
}
const finalReport=md.split('## Final report summary')[1]||'';
assert(!/ACTUAL_MOVING_DURATION/.test(finalReport),'final report actual moving label');
assert(lifecycle.includes('autonomous-orchestrator regression'),'lifecycle ready-to-arm wording');

console.log('EXP-021 KS MX forensic cross-file invariants: PASS');
"
