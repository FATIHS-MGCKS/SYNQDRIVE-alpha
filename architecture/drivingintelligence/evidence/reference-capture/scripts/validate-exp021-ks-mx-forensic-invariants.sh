#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

node -e "
const fs=require('fs');
const path=require('path');
const dir='${ROOT}';
const v1=JSON.parse(fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.json'),'utf8'));
const v2=JSON.parse(fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_V2_2026-09-14.json'),'utf8'));
const c=JSON.parse(fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_CONSISTENCY_2026-09-14.json'),'utf8'));
const md=fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_FORENSIC_2026-09-14.md'),'utf8');
const freeze=fs.readFileSync(path.join(dir,'EXP_021_KS_MX_2024_SHORT_AB_INCOMPLETE_90S_EVIDENCE_FREEZE_2026-09-14.md'),'utf8');
const all=JSON.stringify({v1,v2,c})+md+freeze;
const scan=all.replace(/OLD_VALUE[^,}]*/g,'');
const assert=(ok,m)=>{ if(!ok) throw new Error(m); };

// provider
assert(v1.phase14_provider.TOTAL_REQUESTS===7,'v1 provider total');
assert(v1.phase14_provider.TOTAL_SUCCESS===5,'v1 provider success');
assert(v1.phase14_provider.TOTAL_FAILURE===2,'v1 provider failure');
assert(v1.phase7_nominal10Min['90_NOMINAL_PROVIDER_REQUEST_COUNT']===7,'phase7 requests');
const p7req=v1.phase7_nominal10Min['90_NOMINAL_PROVIDER_REQUEST_COUNT'];
assert(v1.phase6_fiveMinuteWindows.W1.providerRequests===4,'W1 provider');
assert(v1.phase6_fiveMinuteWindows.W2.providerRequests===3,'W2 provider');
assert(v1.phase6_fiveMinuteWindows.W1.providerSuccesses+ v1.phase6_fiveMinuteWindows.W2.providerSuccesses===5,'window success sum');
assert(v1.phase6_fiveMinuteWindows.W1.providerFailures+ v1.phase6_fiveMinuteWindows.W2.providerFailures===2,'window failure sum');

// gaps
const A=v1.phase4_nativeTelemetry.byWindow.A_nominal;
const ts=A.timestamps.map(s=>Date.parse(s));
const gaps=[]; for(let i=1;i<ts.length;i++) gaps.push(ts[i]-ts[i-1]);
assert(ts.length===25,'unique buckets');
assert(gaps.length===24,'interval count');
assert(A.gapsGte10s===gaps.filter(g=>g>=10000).length,'gte10');
assert(A.gapsGte20s===gaps.filter(g=>g>=20000).length,'gte20');
assert(A.gapsGte30s===gaps.filter(g=>g>=30000).length,'gte30');
assert(A.gapsGte60s===gaps.filter(g=>g>=60000).length,'gte60');
assert(A.gapList10s.length===A.gapsGte10s,'gap list len 10');
assert(A.windowEdgeGaps.START_EDGE_GAP_MS===159544,'start edge');
assert(A.windowEdgeGaps.END_EDGE_GAP_MS===66799,'end edge');
assert(A.fullWindowCoverage.FULL_WINDOW_MAX_UNOBSERVED_GAP_MS===159544,'full max');

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

// movement / duration
assert(v1.durations.T0_TO_TRIP_END_WALL_DURATION_MS===1222000,'wall duration');
assert(v1.durations.ACTUAL_MOVING_DURATION_MS==null,'no actual moving');
assert(v1.phase9_postTripTail.POST_TRIP_FALSE_MOVEMENT==='NOT_ASSESSED','post trip false movement');

// recorder
assert(c.recorderRepair.RECORDER_CODE_CHANGE_REQUIRED_FOR_CANONICAL_NEXT_RUN==='NO','recorder no for canonical');
assert(c.recorderRepair.CODE_CHANGE_REQUIRED_TO_SUPPORT_MIXED_MANUAL_ATTACH_PATH==='YES','mixed path yes');

// forbidden stale strings
const forbidden=[
  /no false movement/i,
  /falseMovement\":\s*\"NO\"/,
  /\"VALID_FOR_CADENCE_SELECTION\":\s*\"YES\"/,
  /\"VALID_FOR_PRODUCTION_CADENCE_SELECTION\":\s*\"YES\"/,
  /\"VALID_90_VS_60_COMPARISON\":\s*\"YES\"/,
  /Settlement improved reconstructability/i,
  /VALUE_REVISIONS\":\s*0/,
  /byKind\":\s*\{\s*\"SIGNAL_POINT\":\s*1\s*\}/,
];
for (const re of forbidden) {
  assert(!re.test(scan), 'forbidden stale pattern: '+re);
}
const finalReport=md.split('## Final report summary')[1]||'';
assert(!/ACTUAL_MOVING_DURATION/.test(finalReport),'final report actual moving label');
assert(p7req!==0,'phase7 zero requests');

console.log('EXP-021 KS MX forensic cross-file invariants: PASS');
"
