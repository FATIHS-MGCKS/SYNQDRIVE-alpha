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
const assert=(ok,m)=>{ if(!ok) throw new Error(m); };
assert(v1.phase14_provider.TOTAL_REQUESTS===7,'v1 provider total');
assert(v1.phase14_provider.TOTAL_SUCCESS===5,'v1 provider success');
assert(v1.phase14_provider.TOTAL_FAILURE===2,'v1 provider failure');
assert(v2.referenceCaptureObservations.totalPreserved===11413,'v2 rc total');
const bw=v2.referenceCaptureObservations.byWindow;
assert(bw.A_nominal+bw.B_movingOverrun+bw.C_postTripTail+bw.D_abortArtifact===11413,'rc partition sum');
assert(c.providerCounts.TOTAL_REQUESTS===7,'consistency provider');
assert(c.nativeHfBuckets.count===25,'native buckets');
assert(c.settlement.SETTLEMENT_EXPECTED_ROWS===114,'settlement expected');
assert(c.rcObservationPartition.RC_OBSERVATION_PARTITION_VALID===true,'rc partition valid');
console.log('EXP-021 KS MX forensic cross-file invariants: PASS');
"
