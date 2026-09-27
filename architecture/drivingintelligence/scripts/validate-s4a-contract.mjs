#!/usr/bin/env node
// Design-level validator for the frozen S4A contract (architecture/drivingintelligence/design/s4a/s4a-contract.v1.json).
// Pure model check: no runtime imports, no DB, no network. It proves the contract is internally
// consistent; it does not prove any implementation (none exists).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const overrideIdx = process.argv.indexOf('--contract');
const contractPath =
  overrideIdx > -1 ? path.resolve(process.argv[overrideIdx + 1]) : path.join(here, '..', 'design', 's4a', 's4a-contract.v1.json');
const c = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const printHashes = process.argv.includes('--print-hashes');

const errors = [];
const fail = (m) => errors.push(m);
const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// ── 1. State machine completeness ────────────────────────────────────────────
const states = Object.keys(c.states);
const transitions = c.transitions;
const legal = new Set();
for (const t of transitions) {
  if (!states.includes(t.to)) fail(`${t.id}: unknown target state ${t.to}`);
  for (const f of t.from) {
    if (f !== 'NONE' && !states.includes(f)) fail(`${t.id}: unknown source state ${f}`);
    legal.add(`${f}->${t.to}`);
  }
}
const reachable = new Set(['NONE']);
let grew = true;
while (grew) {
  grew = false;
  for (const t of transitions) {
    if (t.from.some((f) => reachable.has(f)) && !reachable.has(t.to)) {
      reachable.add(t.to);
      grew = true;
    }
  }
}
for (const s of states) if (!reachable.has(s)) fail(`state ${s} unreachable from NONE`);
for (const s of states) {
  const out = transitions.filter((t) => t.from.includes(s) && t.to !== s);
  if (c.states[s].terminal && out.length) fail(`terminal state ${s} has outgoing transitions`);
  if (!c.states[s].terminal && !out.length) fail(`non-terminal state ${s} has no outgoing transition`);
}
const mustBeIllegal = [
  'SUPERSEDED->PENDING', 'SUPERSEDED->LEASED', 'SUPERSEDED->COMPLETED',
  'COMPLETED->LEASED', 'COMPLETED->PENDING', 'COMPLETED->FAILED_RETRYABLE', 'COMPLETED->FAILED_TERMINAL',
  'FAILED_TERMINAL->LEASED', 'FAILED_TERMINAL->PENDING', 'SKIPPED_INELIGIBLE->LEASED',
  'PENDING->COMPLETED', 'FAILED_RETRYABLE->COMPLETED', 'NONE->LEASED', 'NONE->COMPLETED',
];
for (const pair of mustBeIllegal) if (legal.has(pair)) fail(`transition ${pair} must be illegal`);
const allPairs = [];
for (const f of ['NONE', ...states]) for (const t of states) allPairs.push(`${f}->${t}`);
const illegalCount = allPairs.filter((p) => !legal.has(p)).length;
for (const t of transitions) {
  for (const k of ['leaseEpoch', 'attemptCount', 'lease', 'guards', 'actor']) {
    if (t[k] === undefined) fail(`${t.id}: missing ${k}`);
  }
  if (t.to === 'COMPLETED' && !['EPOCH_MATCH', 'LEASE_NOT_EXPIRED_DB_CLOCK', 'PIN_SET', 'BOUNDARY_FINGERPRINT_UNCHANGED', 'S2_WRITTEN_SAME_TX', 'ROW_LOCK'].every((g) => t.guards.includes(g))) {
    fail(`${t.id}: COMPLETED transition lacks a required fencing guard`);
  }
  if (t.actor === 'LEASE_HOLDER' && !t.guards.includes('EPOCH_MATCH')) fail(`${t.id}: lease-holder transition without EPOCH_MATCH`);
  if ((t.to === 'COMPLETED' || (t.to === 'LEASED' && t.leaseEpoch === 'INCREMENT')) && !t.guards.includes('PIPELINE_VERSION_MATCH')) {
    fail(`${t.id}: claim/takeover/complete without PIPELINE_VERSION_MATCH (mixed-version replicas)`);
  }
}
console.log(`==> State machine: ${states.length} states, ${transitions.length} transitions, ${legal.size} legal pairs, ${illegalCount} illegal pairs`);

// ── 2. Pipeline version identity ─────────────────────────────────────────────
function pipelineVersionKey(manifest) {
  const pairs = Object.keys(manifest).sort().map((k) => [k, manifest[k]]);
  return `${c.pipelineVersion.prefix}:sha256:${sha256(JSON.stringify(pairs))}`;
}
const pvBase = c.fixtures.pipelineVersionBase;
const baseKeys = Object.keys(pvBase).sort();
const required = [...c.pipelineVersion.requiredKeys].sort();
if (JSON.stringify(baseKeys) !== JSON.stringify(required)) fail('pipelineVersionBase keys != requiredKeys');
for (const k of c.fixtures.pipelineVersionForbiddenKeys) {
  if (required.includes(k)) fail(`forbidden key ${k} present in pipeline version`);
  if (c.identity.excludedFromEveryHash.includes(k) === false && ['createdAt', 'workerId', 'leaseOwner'].includes(k)) {
    fail(`excludedFromEveryHash missing ${k}`);
  }
}
const pvk = pipelineVersionKey(pvBase);
if (printHashes) console.log('pipelineVersionExpectedKey', pvk);
else if (pvk !== c.fixtures.pipelineVersionExpectedKey) fail(`pipeline version key drift: ${pvk}`);
for (const m of c.fixtures.pipelineVersionMutations) {
  const k = pipelineVersionKey({ ...pvBase, ...m.set });
  const same = k === pvk;
  if ((m.expect === 'EQUAL') !== same) fail(`pipeline mutation "${m.name}" expected ${m.expect}`);
}
const reordered = Object.fromEntries(Object.entries(pvBase).reverse());
if (pipelineVersionKey(reordered) !== pvk) fail('pipeline version key depends on key order');
console.log(`==> Pipeline version identity: ${c.fixtures.pipelineVersionMutations.length} mutations OK`);

// ── 3. Boundary fingerprint ──────────────────────────────────────────────────
function boundaryFingerprint(b) {
  const arr = [
    c.boundaryFingerprint.version, b.organizationId, b.vehicleId, b.tripId, b.tripStatus,
    new Date(b.startTime).toISOString(), b.endTime == null ? null : new Date(b.endTime).toISOString(),
    b.dimoSegmentId ?? null, b.mergeParentTripId ?? null, b.boundaryRepairGeneration ?? null,
  ];
  return `${c.boundaryFingerprint.version}:sha256:${sha256(JSON.stringify(arr))}`;
}
const bBase = c.fixtures.boundaryBase;
if (JSON.stringify(Object.keys(bBase).sort()) !== JSON.stringify([...c.boundaryFingerprint.fields].sort())) {
  fail('boundaryBase keys != boundaryFingerprint.fields');
}
const fp = boundaryFingerprint(bBase);
if (printHashes) console.log('boundaryExpectedFingerprint', fp);
else if (fp !== c.fixtures.boundaryExpectedFingerprint) fail(`boundary fingerprint drift: ${fp}`);
for (const m of c.fixtures.boundaryMutations) {
  const same = boundaryFingerprint({ ...bBase, ...m.set }) === fp;
  if ((m.expect === 'EQUAL') !== same) fail(`boundary mutation "${m.name}" expected ${m.expect}`);
}
console.log(`==> Boundary fingerprint: ${c.fixtures.boundaryMutations.length} mutations OK`);

// ── 4. Channel outcome model + combined identity V0_3 ────────────────────────
const rules = c.channelRules;
function validatePin(channel, [outcome, reason, snapshot, attestation]) {
  const allowed = c.channelOutcomes[channel];
  if (!allowed || !allowed.includes(outcome)) return `outcome ${outcome} not allowed on ${channel}`;
  if (rules.snapshotRequiredOutcomes.includes(outcome) && !snapshot) return `${outcome} requires snapshot`;
  if (rules.snapshotForbiddenOutcomes.includes(outcome) && snapshot) return `${outcome} forbids snapshot`;
  if (rules.reasonCodeRequiredOutcomes.includes(outcome) && !reason) return `${outcome} requires reason code`;
  if (rules.nativeReadyOutcomesRequireAttestation.includes(outcome) && !attestation) return `${outcome} requires native ingest attestation`;
  if (!rules.nativeReadyOutcomesRequireAttestation.includes(outcome) && attestation) return `${outcome} must not carry attestation`;
  return null;
}
function combinedIdentity(pins) {
  const lines = [c.combinedInputIdentity.version];
  for (const ch of ['NATIVE_EVENT', 'POSITION', 'R1_OBD']) {
    const pin = pins[ch];
    if (!pin) throw new Error(`missing channel ${ch}`);
    const err = validatePin(ch, pin);
    if (err) throw new Error(err);
    lines.push(JSON.stringify([ch, ...pin]));
  }
  return `${c.combinedInputIdentity.version}:sha256:${sha256(lines.join('\n'))}`;
}
const ciBase = c.fixtures.combinedIdentityBase;
for (const cs of c.fixtures.combinedIdentityCases) {
  const a = combinedIdentity({ ...ciBase, ...cs.a });
  const b = combinedIdentity({ ...ciBase, ...cs.b });
  if ((cs.expect === 'EQUAL') !== (a === b)) fail(`combined identity "${cs.name}" expected ${cs.expect}`);
}
for (const inv of c.fixtures.invalidChannelPins) {
  if (!validatePin(inv.channel, inv.pin)) fail(`invalid pin accepted: ${inv.name}`);
}
for (const o of rules.nativeReadyOutcomesRequireAttestation) {
  if (rules.channelPolicyV1ReachableNativeOutcomes.includes(o)) fail(`channel policy V1 must not reach ${o} (no readiness authority)`);
}
if (rules.channelPolicyV1NativeReadinessAuthority !== 'NONE') fail('channel policy V1 native readiness authority must be NONE');
if (JSON.stringify(rules.positionRunnableOutcomes) !== JSON.stringify(['PRESENT'])) fail('position must be the only mandatory channel, runnable only when PRESENT');
if (rules.channelPolicyV1NativeApplicableFamilies.includes('API_SYNTHETIC')) fail('native must be NOT_APPLICABLE for API_SYNTHETIC under policy V1');
console.log(`==> Channel model: ${c.fixtures.combinedIdentityCases.length} identity cases, ${c.fixtures.invalidChannelPins.length} invalid pins rejected`);

// ── 5. Tenant scope guard ────────────────────────────────────────────────────
const ts = c.fixtures.tenantScope;
function tenantGuard({ organizationId, vehicleId, tripId, pinSnapshot }) {
  if (!ts.organizations[organizationId]) return false;
  if (ts.vehicles[vehicleId] !== organizationId) return false;
  if (ts.trips[tripId] !== vehicleId) return false;
  if (pinSnapshot) {
    const s = ts.snapshots[pinSnapshot];
    if (!s || s.organizationId !== organizationId || s.tripId !== tripId) return false;
  }
  return true;
}
for (const cs of ts.cases) {
  const ok = tenantGuard(cs);
  if ((cs.expect === 'ACCEPT') !== ok) fail(`tenant case "${cs.name}" expected ${cs.expect}`);
}
console.log(`==> Tenant scope: ${ts.cases.length} cases OK`);

// ── 6. Race model (DB truth) ────────────────────────────────────────────────
const L = c.limits;
function runRace(race) {
  let now = 0;
  let currentFp = 'fp-1';
  const items = [];
  const held = new Map();
  const rejected = [];
  const committed = [];
  const byLogical = new Set();
  const applied = (from, to, id) => {
    if (!legal.has(`${from}->${to}`)) fail(`${race.id}: model applied illegal ${from}->${to} (${id})`);
  };
  const primary = () => items.find((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED') ?? items[0];
  const create = (actor, purpose, disc, fpv = currentFp) => {
    const discriminator = purpose === 'PRIMARY' ? 'PRIMARY' : disc;
    const key = ['org-A', 'trip-A1-1', fpv, 'pvk-1', purpose, discriminator].join('|');
    const activePrimaryExists = purpose === 'PRIMARY' && items.some((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED');
    if (byLogical.has(key) || activePrimaryExists) return false;
    byLogical.add(key);
    applied('NONE', 'PENDING', 'T01');
    items.push({
      id: `wi-${items.length + 1}`, purpose, fp: fpv, status: 'PENDING', epoch: 0, attempts: 0,
      owner: null, expires: null, pinned: purpose === 'RECALIBRATION_REPLAY' ? disc : null, shadowRunId: null,
    });
    return true;
  };
  const leaseValid = (it, actor) => it.status === 'LEASED' && held.get(actor) === `${it.id}#${it.epoch}` && now < it.expires;
  for (const [op, actor, a1, a2] of race.steps) {
    let ok = true;
    const it = primary();
    switch (op) {
      case 'create': ok = create(actor, a1, a2); break;
      case 'advance': now += actor; continue;
      case 'claim': {
        const due = it.status === 'PENDING' || it.status === 'FAILED_RETRYABLE';
        const expired = it.status === 'LEASED' && now >= it.expires;
        if ((due || expired) && it.attempts < L.maxAttempts) {
          applied(it.status, 'LEASED', 'T02/T04');
          it.status = 'LEASED'; it.epoch += 1; it.attempts += 1; it.owner = actor; it.expires = now + L.leaseDurationSeconds;
          held.set(actor, `${it.id}#${it.epoch}`);
        } else ok = false;
        break;
      }
      case 'heartbeat':
        if (leaseValid(it, actor)) { applied('LEASED', 'LEASED', 'T03'); it.expires = now + L.leaseDurationSeconds; } else ok = false;
        break;
      case 'pin':
        if (leaseValid(it, actor) && it.pinned == null && tenantGuard({ organizationId: 'org-A', vehicleId: 'veh-A1', tripId: 'trip-A1-1', pinSnapshot: a1.startsWith('snap-A') ? 'snap-A' : a1 })) {
          applied('LEASED', 'LEASED', 'T05'); it.pinned = a1;
        } else ok = false;
        break;
      case 'complete':
        if (leaseValid(it, actor) && it.pinned != null && it.fp === currentFp) {
          applied('LEASED', 'COMPLETED', 'T06');
          it.status = 'COMPLETED'; it.shadowRunId = a1; it.owner = null; it.expires = null;
          committed.push(actor);
        } else ok = false;
        break;
      case 'completeRollback':
        break;
      case 'supersede': {
        const newFp = a1;
        const active = items.find((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED' && i.fp !== newFp);
        if (!active) { ok = false; break; }
        applied(active.status, 'SUPERSEDED', 'T11');
        active.status = 'SUPERSEDED'; active.epoch += 1; active.owner = null; active.expires = null;
        currentFp = newFp;
        const created = create(actor, 'PRIMARY', null, newFp);
        if (!created) fail(`${race.id}: successor creation failed after supersession`);
        active.supersededBy = items[items.length - 1].id;
        break;
      }
      case 'reap':
        if (it.status === 'LEASED' && now >= it.expires && it.attempts >= L.maxAttempts) {
          applied('LEASED', 'FAILED_TERMINAL', 'T10');
          it.status = 'FAILED_TERMINAL'; it.epoch += 1; it.owner = null; it.expires = null;
        } else ok = false;
        break;
      default:
        fail(`${race.id}: unknown op ${op}`);
    }
    if (!ok) rejected.push(`${actor}:${op}`);
    for (const i of items) {
      if ((i.status === 'LEASED') !== (i.owner != null && i.expires != null)) fail(`${race.id}: lease columns inconsistent with ${i.status}`);
      if (i.status === 'COMPLETED' && (!i.shadowRunId || !i.pinned)) fail(`${race.id}: COMPLETED without shadowRunId/pin`);
      if (i.shadowRunId && !['COMPLETED', 'SUPERSEDED'].includes(i.status)) fail(`${race.id}: shadowRunId on ${i.status}`);
    }
    const activePrimaries = items.filter((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED').length;
    if (activePrimaries > 1) fail(`${race.id}: more than one active PRIMARY`);
  }
  return { items, rejected, committed, activePrimaryCount: items.filter((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED').length };
}
for (const race of c.fixtures.races) {
  const r = runRace(race);
  const e = race.expect;
  const first = r.items[0];
  const active = r.items.find((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED') ?? first;
  const check = (label, actual, expected) => {
    if (expected !== undefined && JSON.stringify(actual) !== JSON.stringify(expected)) {
      fail(`${race.id}: ${label} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
    }
  };
  check('itemCount', r.items.length, e.itemCount);
  check('status', active.status, e.status);
  check('leaseOwner', active.owner, e.leaseOwner);
  check('leaseEpoch', active.epoch, e.leaseEpoch);
  check('shadowRunId', active.shadowRunId, e.shadowRunId);
  check('pinned', active.pinned, e.pinned);
  check('attemptCount', active.attempts, e.attemptCount);
  check('oldStatus', first.status, e.oldStatus);
  check('activePrimaryCount', r.activePrimaryCount, e.activePrimaryCount);
  check('s2WritesCommitted', r.committed, e.s2WritesCommitted);
  const expectedRejections = e.rejected ?? [];
  for (const tok of expectedRejections) {
    if (!r.rejected.some((x) => x === tok || x.startsWith(`${tok}:`))) fail(`${race.id}: expected rejection ${tok} not observed`);
  }
  for (const x of r.rejected) {
    if (!expectedRejections.some((tok) => x === tok || x.startsWith(`${tok}:`))) fail(`${race.id}: unexpected rejection ${x}`);
  }
}
console.log(`==> Race model: ${c.fixtures.races.length} races OK`);

// ── 7. Invariant / migration rule presence ───────────────────────────────────
for (const inv of ['NO_VEHICLE_TRIP_WRITE', 'NO_TRIP_FSM_CALL', 'NO_CUSTOMER_ENDPOINT', 'NO_CONSTRAINT_THAT_CAN_FAIL_A_CANONICAL_WRITE_OR_DELETE']) {
  if (!c.zeroImpactInvariants.includes(inv)) fail(`zero-impact invariant missing: ${inv}`);
}
for (const rule of ['NO_ALTER_OF_CANONICAL_TABLES', 'NO_BACKFILL', 'NO_ON_DELETE_RESTRICT_OR_NO_ACTION_TO_CANONICAL', 'EXPLICIT_BEGIN_COMMIT_WITH_LOCAL_LOCK_TIMEOUT_5S_AND_STATEMENT_TIMEOUT_60S']) {
  if (!c.migrationRules.includes(rule)) fail(`migration rule missing: ${rule}`);
}
if (L.maxAcquisitionWindowSeconds !== 8 * 3600) fail('S4 max acquisition window must equal the R1 bound (8h)');
if (L.runBudgetSeconds >= L.leaseDurationSeconds) fail('run budget must be shorter than lease duration');
if (L.heartbeatIntervalSeconds * 3 > L.leaseDurationSeconds) fail('lease must survive at least 3 missed-heartbeat intervals');

if (errors.length) {
  console.error('\n==> S4A CONTRACT VALIDATION FAILED');
  for (const e of errors) console.error('  -', e);
  process.exit(1);
}
console.log('==> S4A contract validation passed');
