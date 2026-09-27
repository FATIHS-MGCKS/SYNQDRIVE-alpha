#!/usr/bin/env node
// Design-level validator for the frozen S4A machine contract
// (architecture/drivingintelligence/design/s4a/s4a-contract.v2.json).
// Pure model check: no runtime imports, no DB, no network. It proves the contract encodes and
// satisfies every merge-critical invariant; it does not prove any implementation (none exists).
// Two layers: (1) static invariants that reject a weakened contract, (2) executable models
// (race model driven by the contract's own guards, control-plane evaluator, identity builders).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CONTRACT = path.join(here, '..', 'design', 's4a', 's4a-contract.v2.json');
export const DESIGN_DIR = path.join(here, '..', 'design', 's4a');

const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const REQUIRED_SECTIONS = [
  'contractVersion', 'limits', 'executionAuthority', 'controlPlane', 'killPolicy', 'authoritativeWrites', 'states',
  'transitions', 'mustBeIllegal', 'runPurposes', 'identity', 'identityLayers', 's2ExecutionIdentity', 'pipelineVersion',
  'boundaryFingerprint', 'pipelineRetirement', 'channelOutcomes', 'channelRules', 'nativeReadiness', 'combinedInputIdentity',
  'replay', 'tenancy', 'settlement', 'providerBackpressure', 'activationGates', 'migration', 'migrationRules',
  'zeroImpactInvariants', 'fixtures',
];
const KILL_GUARD = 'CONTROL_PLANE_DB_NOT_KILLED';
const WRITES_ALLOWED_WHILE_KILLED = ['T07_FAIL_RETRYABLE'];
const MIN_ILLEGAL = [
  'SUPERSEDED->PENDING', 'SUPERSEDED->LEASED', 'SUPERSEDED->COMPLETED', 'COMPLETED->LEASED', 'COMPLETED->PENDING',
  'COMPLETED->FAILED_RETRYABLE', 'COMPLETED->FAILED_TERMINAL', 'FAILED_TERMINAL->LEASED', 'FAILED_TERMINAL->PENDING',
  'SKIPPED_INELIGIBLE->LEASED', 'PENDING->COMPLETED', 'FAILED_RETRYABLE->COMPLETED', 'NONE->LEASED', 'NONE->COMPLETED',
];
const S2_REQUIRED_COMPONENTS = [
  'organizationId', 'tripId', 'boundaryFingerprint', 'pipelineVersionKey', 'runPurpose', 'purposeDiscriminator',
  'calibrationBundleHash', 's4OrchestrationContractVersion', 'pinnedEvidenceSnapshotHash', 'combinedInputIdentity',
];
const CP_REQUIRED_TERMS = ['MASTER', 'ROLE_FLAG', 'POSITION', 'ORG_ALLOWLISTED', 'VEHICLE_ALLOWLISTED', 'VEHICLE_BELONGS_TO_ORG', 'DB_NOT_KILLED'];
const NONEXISTENT_TRIP_ORG = 'vehicle_trips.organization_id';

export function validateContract(c, { docs = [], printHashes = false } = {}) {
  const errors = [];
  const log = [];
  const results = {};
  const hashes = {};
  const fail = (m) => errors.push(m);
  const section = (name, fn) => {
    try {
      fn();
    } catch (e) {
      fail(`${name}: evaluation error: ${e.message}`);
    }
  };

  // ── 0. Required sections ───────────────────────────────────────────────────
  for (const s of REQUIRED_SECTIONS) if (c[s] === undefined) fail(`required section missing: ${s}`);
  if (errors.length) return { errors, log, results, hashes };
  if (c.contractVersion !== 'DI_V0_S4A_CONTRACT_V2') fail(`contractVersion must be DI_V0_S4A_CONTRACT_V2 (got ${c.contractVersion})`);

  const T = (id) => c.transitions.find((t) => t.id === id);
  const has = (id, g) => Boolean(T(id)?.guards?.includes(g));
  const L = c.limits;
  const ea = c.executionAuthority;
  const cp = c.controlPlane;

  // ── A. Execution authority + lease timing ─────────────────────────────────
  section('execution authority', () => {
    if (ea.authority !== 'DB_WORK_ITEM_ROW') fail('execution authority must be DB_WORK_ITEM_ROW');
    if (ea.bullmqIsIdempotencyAuthority !== false) fail('BullMQ must not be idempotency authority');
    if (ea.bullmqRole !== 'WAKEUP_HINT_ONLY') fail('BullMQ role must be WAKEUP_HINT_ONLY');
    if (!eq(ea.bullmqPayloadFields, ['workItemId'])) fail('BullMQ payload must carry only workItemId');
    if (ea.dbClockSource !== 'clock_timestamp()') fail('lease clock source must be DB clock_timestamp()');
    if (ea.workerWallClockAllowedForExpiry !== false) fail('worker wall clock must not decide lease expiry');
    if (!eq(ea.fencingToken, ['workItemId', 'leaseEpoch'])) fail('fencing token must be (workItemId, leaseEpoch)');
    if (ea.leaseEpochMonotonic !== true) fail('lease epoch must be monotonic');
    if (ea.s2IdempotencyIsFinalPersistenceGuard !== true) fail('S2 idempotency must be the final persistence guard');
    if (ea.schedulerLeadershipIsCorrectnessRequirement !== false) fail('scheduler leadership must not be a correctness requirement');
    if (ea.expiredLeaseWorkerWritePossible !== false) fail('expired-lease worker write must be impossible');
    if (ea.workBudgetSemantics !== 'SINGLE_ATTEMPT_COMPUTE_BUDGET_WORKER_SELF_ABORT') fail('work budget semantics must be single-attempt compute budget');
    if (ea.leaseCeilingSemantics !== 'MAX_CUMULATIVE_LEASE_LIFETIME_FROM_ATTEMPT_CLAIM') fail('lease ceiling semantics must be max cumulative lease lifetime from attempt claim');
    const forbiddenInKeys = ['bullmqJobId', 'workerId', 'leaseOwner', 'leaseEpoch', 'createdAt', 'acquiredAtWallClock'];
    for (const k of forbiddenInKeys) {
      if (c.identity.logicalKey.includes(k)) fail(`logical key must not contain ${k} (BullMQ/worker/time is not identity)`);
      if (!c.identity.excludedFromEveryHash.includes(k)) fail(`excludedFromEveryHash missing ${k}`);
    }
    const nums = ['leaseDurationSeconds', 'heartbeatIntervalSeconds', 'workExecutionBudgetSeconds', 'absoluteLeaseLifetimeCeilingSeconds', 'maxAttempts'];
    for (const k of nums) if (!(Number.isInteger(L[k]) && L[k] > 0)) fail(`limits.${k} must be a positive integer`);
    if (L.workExecutionBudgetSeconds >= L.leaseDurationSeconds) fail('work budget must be shorter than lease duration');
    if (L.heartbeatIntervalSeconds * 3 > L.leaseDurationSeconds) fail('lease must survive at least 3 heartbeat intervals');
    if (L.absoluteLeaseLifetimeCeilingSeconds < L.leaseDurationSeconds + L.workExecutionBudgetSeconds) fail('lease ceiling must be >= lease duration + work budget');
    if (L.absoluteLeaseLifetimeCeilingSeconds <= L.workExecutionBudgetSeconds) fail('lease ceiling must exceed the work budget');
    if (!Array.isArray(L.retryBackoffSeconds) || L.retryBackoffSeconds.length !== L.maxAttempts) fail('retry backoff must have one entry per attempt');
    if (L.maxAcquisitionWindowSeconds !== 8 * 3600) fail('S4 max acquisition window must equal the R1 bound (8h)');
    if (!has('T03_HEARTBEAT', 'LEASE_CEILING_APPLIED')) fail('T03 heartbeat must apply the absolute lease ceiling');
    if (L.hardRunCeilingSeconds !== undefined || L.runBudgetSeconds !== undefined) fail('ambiguous v1 limit names (runBudgetSeconds/hardRunCeilingSeconds) must not be used');
  });

  // ── F. State machine ───────────────────────────────────────────────────────
  const states = Object.keys(c.states);
  const legal = new Set();
  section('state machine', () => {
    for (const t of c.transitions) {
      for (const k of ['from', 'to', 'leaseEpoch', 'attemptCount', 'lease', 'guards', 'actor']) if (t[k] === undefined) fail(`${t.id}: missing ${k}`);
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
      for (const t of c.transitions) if (t.from.some((f) => reachable.has(f)) && !reachable.has(t.to)) { reachable.add(t.to); grew = true; }
    }
    for (const s of states) if (!reachable.has(s)) fail(`state ${s} unreachable from NONE`);
    for (const s of states) {
      const out = c.transitions.filter((t) => t.from.includes(s) && t.to !== s);
      if (c.states[s].terminal && out.length) fail(`terminal state ${s} has outgoing transitions`);
      if (!c.states[s].terminal && !out.length) fail(`non-terminal state ${s} has no outgoing transition`);
    }
    for (const pair of new Set([...MIN_ILLEGAL, ...c.mustBeIllegal])) if (legal.has(pair)) fail(`illegal transition permitted: ${pair}`);
    for (const pair of MIN_ILLEGAL) if (!c.mustBeIllegal.includes(pair)) fail(`mustBeIllegal weakened: ${pair} removed`);
    for (const t of c.transitions) {
      if (t.actor === 'LEASE_HOLDER') {
        if (!t.guards.includes('EPOCH_MATCH')) fail(`${t.id}: lease-holder transition without EPOCH_MATCH (fencing epoch missing)`);
        if (!t.guards.includes('LEASE_NOT_EXPIRED_DB_CLOCK')) fail(`${t.id}: lease-holder transition without LEASE_NOT_EXPIRED_DB_CLOCK (stale worker after lease expiry)`);
      }
      if (t.from.includes('LEASED') && t.actor !== 'LEASE_HOLDER' && t.to !== 'LEASED') {
        if (t.leaseEpoch !== 'INCREMENT') fail(`${t.id}: non-holder transition out of LEASED must increment the epoch`);
        if (!t.guards.includes('ROW_LOCK') && !t.guards.includes('SKIP_LOCKED')) fail(`${t.id}: non-holder transition out of LEASED must lock the row`);
        if (t.actor !== 'DRIFT_WATCHER' && !t.guards.some((g) => g === 'LEASE_EXPIRED_DB_CLOCK' || g === 'LEASE_EXPIRED_OR_NOT_LEASED')) {
          fail(`${t.id}: ${t.actor} may only act on LEASED after DB-clock lease expiry`);
        }
      }
      const isClaim = t.to === 'LEASED' && t.leaseEpoch === 'INCREMENT';
      if ((t.to === 'COMPLETED' || isClaim) && !t.guards.includes('PIPELINE_VERSION_MATCH')) fail(`${t.id}: claim/takeover/complete without PIPELINE_VERSION_MATCH`);
      if (isClaim) {
        if (t.from.includes('LEASED') && !t.guards.includes('LEASE_EXPIRED_DB_CLOCK')) fail(`${t.id}: takeover without LEASE_EXPIRED_DB_CLOCK`);
        for (const g of ['CONTROL_PLANE_WORKER_ENABLED', 'PIPELINE_VERSION_ACTIVE', 'ATTEMPTS_REMAINING']) if (!t.guards.includes(g)) fail(`${t.id}: claim/takeover without ${g}`);
      }
      if (t.to === 'COMPLETED') {
        for (const g of ['ROW_LOCK', 'EPOCH_MATCH', 'LEASE_NOT_EXPIRED_DB_CLOCK', 'PIN_SET', 'BOUNDARY_FINGERPRINT_UNCHANGED', 'TENANT_SCOPE_VALID', 'S2_WRITTEN_SAME_TX', 'S2_EXECUTION_IDENTITY_MATCH', 'CONTROL_PLANE_WORKER_ENABLED', 'PIPELINE_VERSION_ACTIVE']) {
          if (!t.guards.includes(g)) fail(`${t.id}: completion lacks ${g}`);
        }
      }
      if (['DISCOVERY', 'REAPER', 'RETIREMENT_REAPER', 'DRIFT_WATCHER'].includes(t.actor)) {
        const gate = t.actor === 'DISCOVERY' ? 'CONTROL_PLANE_DISCOVERY_ENABLED' : 'CONTROL_PLANE_MAINTENANCE_ENABLED';
        if (!t.guards.includes(gate)) fail(`${t.id}: ${t.actor} transition not gated by ${gate}`);
      }
    }
    for (const g of ['TENANT_SCOPE_VALID', 'LOGICAL_KEY_UNIQUE', 'ACTIVE_PRIMARY_UNIQUE', 'PIPELINE_VERSION_ACTIVE']) if (!has('T01_CREATE', g)) fail(`T01_CREATE lacks ${g}`);
    if (!has('T05_PIN', 'SNAPSHOT_SAME_TENANT') || !has('T05_PIN', 'PIN_NOT_SET')) fail('T05_PIN must require PIN_NOT_SET and SNAPSHOT_SAME_TENANT (tenancy guard)');
    if (!eq(c.identity.logicalKey, ['organizationId', 'tripId', 'boundaryFingerprint', 'pipelineVersionKey', 'runPurpose', 'purposeDiscriminator'])) fail('logical key changed');
    if (!eq(c.identity.activePrimaryKey, ['organizationId', 'tripId', 'pipelineVersionKey'])) fail('active-PRIMARY unique key missing or changed (duplicate active PRIMARY)');
    if (c.identity.activePrimaryPredicate !== "runPurpose = 'PRIMARY' AND status <> 'SUPERSEDED'") fail('active-PRIMARY predicate missing or changed');
    if (!eq(c.identity.evidenceKey, ['organizationId', 'snapshotHash'])) fail('evidence key changed');
    if (!c.executionTerminalStates.includes('SKIPPED_INELIGIBLE') || !c.executionTerminalStates.includes('COMPLETED')) fail('execution-terminal states weakened');
    const pairs = [];
    for (const f of ['NONE', ...states]) for (const t of states) pairs.push(`${f}->${t}`);
    log.push(`State machine: ${states.length} states, ${c.transitions.length} transitions, ${legal.size} legal pairs, ${pairs.filter((p) => !legal.has(p)).length} illegal pairs`);
  });

  // ── E / §12. Run purposes, replay, SKIPPED consistency ───────────────────
  section('replay', () => {
    const rp = c.runPurposes;
    const rep = c.replay;
    if (rep.liveProviderRequeryIsReplay !== false) fail('live provider re-query must not be replay');
    if (rep.sourceOfTruth !== 'PINNED_NORMALIZED_EVIDENCE_SNAPSHOT') fail('replay source must be the pinned normalized snapshot');
    if (rep.rehashOnLoadRequired !== true) fail('replay must re-hash the snapshot on load');
    if (typeof rep.deserializerImplemented !== 'boolean') fail('deserializer status must be represented');
    if (rep.deserializerImplemented === false && rep.deserializerGap?.status !== 'OPEN') fail('deserializer gap must be OPEN while unimplemented');
    if (rp.RECALIBRATION_REPLAY?.providerAcquisitionAllowed !== false) fail('RECALIBRATION_REPLAY must never acquire from the provider (live re-query is not replay)');
    if (rp.RECALIBRATION_REPLAY?.pinSource !== 'EXISTING_SNAPSHOT_AT_CREATE' || rp.RECALIBRATION_REPLAY?.pinnedAtCreate !== true) fail('RECALIBRATION_REPLAY must be pinned to an existing snapshot at creation');
    if (rp.PRIMARY?.authoritative !== true || rp.RECALIBRATION_REPLAY?.authoritative !== false || rp.REACQUISITION?.authoritative !== false) fail('only PRIMARY may be authoritative');
    const skipped = c.states.SKIPPED_INELIGIBLE;
    if (skipped.pinnedSnapshot !== 'FORBIDDEN') fail('SKIPPED_INELIGIBLE must forbid a pin');
    for (const [name, p] of Object.entries(rp)) {
      if (p.pinnedAtCreate && (skipped.allowedRunPurposes ?? []).includes(name)) fail(`replay/SKIPPED contradiction: ${name} is pinned at creation but may enter SKIPPED_INELIGIBLE (pin forbidden)`);
      if (p.ineligibleAfterPin && T(p.ineligibleAfterPin)?.to === 'SKIPPED_INELIGIBLE') fail(`${name}: post-pin ineligibility must not target SKIPPED_INELIGIBLE`);
    }
    if (!Array.isArray(skipped.allowedRunPurposes)) fail('SKIPPED_INELIGIBLE.allowedRunPurposes must be explicit');
    if (!has('T09_SKIP_INELIGIBLE', 'PIN_NOT_SET') || !has('T09_SKIP_INELIGIBLE', 'RUN_PURPOSE_NOT_RECALIBRATION_REPLAY')) fail('T09 must require PIN_NOT_SET and RUN_PURPOSE_NOT_RECALIBRATION_REPLAY');
    if (rep.replayIneligibleTransition !== 'T08_FAIL_TERMINAL' || rp.RECALIBRATION_REPLAY?.ineligibleAfterPin !== 'T08_FAIL_TERMINAL') fail('replay ineligibility must be FAILED_TERMINAL (REPLAY_INELIGIBLE)');
  });

  // ── Pipeline version identity ─────────────────────────────────────────────
  const pipelineVersionKey = (m) => `${c.pipelineVersion.prefix}:sha256:${sha256(JSON.stringify(Object.keys(m).sort().map((k) => [k, m[k]])))}`;
  const f = c.fixtures;
  let pvk;
  section('pipeline version', () => {
    const base = f.pipelineVersionBase;
    const required = [...c.pipelineVersion.requiredKeys].sort();
    for (const k of ['calibrationBundleHash', 'channelEnablement', 's4OrchestrationContractVersion', 'calibrationVersion', 'estimatorVersion', 'structuralVersion']) {
      if (!required.includes(k)) fail(`pipeline version must bind ${k}`);
    }
    if (!eq(Object.keys(base).sort(), required)) fail('pipelineVersionBase keys != requiredKeys');
    for (const k of f.pipelineVersionForbiddenKeys) if (required.includes(k)) fail(`forbidden key ${k} present in pipeline version`);
    pvk = pipelineVersionKey(base);
    hashes.pipelineVersionExpectedKey = pvk;
    if (!printHashes && pvk !== f.pipelineVersionExpectedKey) fail(`pipeline version key drift: ${pvk}`);
    for (const m of f.pipelineVersionMutations) if ((m.expect === 'EQUAL') !== (pipelineVersionKey({ ...base, ...m.set }) === pvk)) fail(`pipeline mutation "${m.name}" expected ${m.expect}`);
    if (pipelineVersionKey(Object.fromEntries(Object.entries(base).reverse())) !== pvk) fail('pipeline version key depends on key order');
    log.push(`Pipeline version identity: ${f.pipelineVersionMutations.length} mutations OK`);
  });

  // ── Boundary fingerprint ──────────────────────────────────────────────────
  const boundaryFingerprint = (b) => {
    const arr = [
      c.boundaryFingerprint.version, b.organizationId, b.vehicleId, b.tripId, b.tripStatus,
      new Date(b.startTime).toISOString(), b.endTime == null ? null : new Date(b.endTime).toISOString(),
      b.dimoSegmentId ?? null, b.mergeParentTripId ?? null, b.boundaryRepairGeneration ?? null,
    ];
    return `${c.boundaryFingerprint.version}:sha256:${sha256(JSON.stringify(arr))}`;
  };
  section('boundary fingerprint', () => {
    const expectedFields = ['organizationId', 'vehicleId', 'tripId', 'tripStatus', 'startTime', 'endTime', 'dimoSegmentId', 'mergeParentTripId', 'boundaryRepairGeneration'];
    if (!eq(c.boundaryFingerprint.fields, expectedFields)) fail('boundary fingerprint fields changed');
    if (!/vehicles\.organization_id/.test(c.boundaryFingerprint.organizationIdSource ?? '') || /caller-supplied organization (is )?trusted/i.test(c.boundaryFingerprint.organizationIdSource ?? '')) {
      fail('boundary fingerprint organizationId must come from vehicles.organization_id via the trip vehicle');
    }
    const bBase = f.boundaryBase;
    if (!eq(Object.keys(bBase).sort(), [...expectedFields].sort())) fail('boundaryBase keys != boundaryFingerprint.fields');
    const fp = boundaryFingerprint(bBase);
    hashes.boundaryExpectedFingerprint = fp;
    if (!printHashes && fp !== f.boundaryExpectedFingerprint) fail(`boundary fingerprint drift: ${fp}`);
    for (const m of f.boundaryMutations) if ((m.expect === 'EQUAL') !== (boundaryFingerprint({ ...bBase, ...m.set }) === fp)) fail(`boundary mutation "${m.name}" expected ${m.expect}`);
    log.push(`Boundary fingerprint: ${f.boundaryMutations.length} mutations OK`);
  });

  // ── D. Channel model, native readiness, combined identity V0_3 ────────────
  const rules = c.channelRules;
  const ci = c.combinedInputIdentity;
  const evidencePattern = new RegExp(ci.channelEvidenceHashPattern ?? '^$');
  const validatePin = (channel, [outcome, reason, evidence, attestation]) => {
    const allowed = c.channelOutcomes[channel];
    if (!allowed || !allowed.includes(outcome)) return `outcome ${outcome} not allowed on ${channel}`;
    if (rules.snapshotRequiredOutcomes.includes(outcome) && !evidence) return `${outcome} requires channel evidence hash`;
    if (rules.snapshotForbiddenOutcomes.includes(outcome) && evidence) return `${outcome} forbids channel evidence`;
    if (evidence && !evidencePattern.test(evidence)) return `channel evidence hash ${evidence} is not a content hash`;
    if (rules.reasonCodeRequiredOutcomes.includes(outcome) && !reason) return `${outcome} requires reason code`;
    if (rules.nativeReadyOutcomesRequireAttestation.includes(outcome) && !attestation) return `${outcome} requires native ingest attestation`;
    if (!rules.nativeReadyOutcomesRequireAttestation.includes(outcome) && attestation) return `${outcome} must not carry attestation`;
    return null;
  };
  const combinedIdentity = (pins) => {
    const lines = [ci.version];
    for (const ch of ['NATIVE_EVENT', 'POSITION', 'R1_OBD']) {
      const pin = pins[ch];
      if (!pin) throw new Error(`missing channel ${ch}`);
      const err = validatePin(ch, pin);
      if (err) throw new Error(err);
      lines.push(JSON.stringify([ch, ...pin]));
    }
    return `${ci.version}:sha256:${sha256(lines.join('\n'))}`;
  };
  section('channel model', () => {
    for (const ch of ['R1_OBD', 'NATIVE_EVENT']) {
      for (const o of ['DISABLED', 'NOT_APPLICABLE', 'SOURCE_FAILURE']) if (!c.channelOutcomes[ch]?.includes(o)) fail(`${ch} must distinguish ${o} (disabled / not-applicable must not collapse)`);
    }
    if (!c.channelOutcomes.NATIVE_EVENT.includes('NOT_READY')) fail('NATIVE_EVENT must have NOT_READY');
    for (const o of ['READY_WITH_EVENTS', 'READY_NO_EVENT']) if (!rules.nativeReadyOutcomesRequireAttestation.includes(o)) fail(`${o} must require native ingest attestation`);
    for (const o of rules.nativeReadyOutcomesRequireAttestation) if (rules.channelPolicyV1ReachableNativeOutcomes.includes(o)) fail(`channel policy V1 must not reach ${o} (no readiness authority)`);
    if (rules.channelPolicyV1NativeReadinessAuthority !== 'NONE') fail('channel policy V1 native readiness authority must be NONE');
    const nr = c.nativeReadiness;
    if (nr.authority !== 'NONE_EXISTING') fail('native readiness authority must be NONE_EXISTING');
    if (nr.legacyMarkersAreAttestation !== false) fail('legacy native markers must not count as attestation');
    if (nr.legacyEmptyResultMapsTo !== 'NOT_READY') fail('legacy empty native result must map to NOT_READY, never READY_NO_EVENT');
    if (nr.readyNoEventRequires !== 'NATIVE_INGEST_ATTESTATION') fail('READY_NO_EVENT must require NATIVE_INGEST_ATTESTATION');
    for (const g of ['DI-GAP-S4-NATIVE-READINESS-001', 'DIM-GAP-007']) if (!nr.gaps?.includes(g)) fail(`native readiness must track ${g}`);
    if (!eq(rules.positionRunnableOutcomes, ['PRESENT'])) fail('position must be the only mandatory channel, runnable only when PRESENT');
    if (rules.channelPolicyV1NativeApplicableFamilies.includes('API_SYNTHETIC')) fail('native must be NOT_APPLICABLE for API_SYNTHETIC under policy V1');
    if (!eq(ci.fields, ['channel', 'outcome', 'reasonCode', 'channelEvidenceHash', 'attestationRef'])) fail('combined identity fields must be [channel, outcome, reasonCode, channelEvidenceHash, attestationRef]');
    if (!ci.forbiddenFieldNames?.includes('channelSnapshotVersion') || ci.fields.includes('channelSnapshotVersion') || /channelSnapshotVersion/.test(ci.serialization)) {
      fail('ambiguous channelSnapshotVersion must not name a content hash');
    }
    const ciBase = f.combinedIdentityBase;
    for (const cs of f.combinedIdentityCases) {
      const same = combinedIdentity({ ...ciBase, ...cs.a }) === combinedIdentity({ ...ciBase, ...cs.b });
      if ((cs.expect === 'EQUAL') !== same) fail(`combined identity "${cs.name}" expected ${cs.expect}`);
    }
    for (const inv of f.invalidChannelPins) if (!validatePin(inv.channel, inv.pin)) fail(`invalid pin accepted: ${inv.name}`);
    log.push(`Channel model: ${f.combinedIdentityCases.length} identity cases, ${f.invalidChannelPins.length} invalid pins rejected`);
  });

  // ── C. S2 execution identity ──────────────────────────────────────────────
  const s2 = c.s2ExecutionIdentity;
  const execIdentity = (x) => `${s2.version}:sha256:${sha256(JSON.stringify([s2.version, ...s2.components.map((k) => x[k] ?? null)]))}`;
  const s2Key = (tripId, iev) => sha256([tripId, 'RUPTELA_R1', 'S', 'E', 'C', 'P', iev].join('|'));
  section('S2 execution identity', () => {
    if (s2.version !== 'DI_V0_S4_EXECUTION_IDENTITY_V1') fail('S2 execution identity version must be DI_V0_S4_EXECUTION_IDENTITY_V1');
    for (const k of S2_REQUIRED_COMPONENTS) if (!s2.components.includes(k)) fail(`S2 execution identity omits ${k}`);
    for (const k of [...c.identity.excludedFromEveryHash, ...(s2.forbiddenComponents ?? [])]) if (s2.components.includes(k)) fail(`S2 execution identity must not include ${k}`);
    if (!s2.forbiddenComponents?.includes('channelSnapshotVersion')) fail('S2 execution identity must forbid ambiguous channelSnapshotVersion');
    for (const k of c.identity.logicalKey) if (!s2.components.includes(k)) fail(`S2 execution identity must contain logical-key component ${k}`);
    const layers = c.identityLayers;
    if (layers.distinct !== true || layers.WORK_ITEM_LOGICAL_IDENTITY !== 'identity.logicalKey' || layers.EVIDENCE_IDENTITY !== 'identity.evidenceKey' || layers.S2_RESULT_EXECUTION_IDENTITY !== 's2ExecutionIdentity') {
      fail('identity layers must be distinct: work item logical != evidence != S2 execution');
    }
    for (const k of ['snapshotHash', 'pinnedEvidenceSnapshotHash', 'combinedInputIdentity']) if (c.identity.logicalKey.includes(k)) fail(`logical key must not contain evidence component ${k}`);
    if (s2.s2Binding?.s2Field !== 'inputEvidenceVersion' || s2.s2Binding?.value !== 'FULL_EXECUTION_IDENTITY_STRING') fail('S2 inputEvidenceVersion must carry the full execution identity');
    if (s2.collision?.onConflictDifferentIdentity !== 'FAIL_CLOSED_TERMINAL_CONTRACT_VIOLATION') fail('S2 collision with different identity must fail closed');
    if (s2.collision?.onConflictSameIdentity !== 'REUSE_SAME_EXECUTION_ONLY') fail('S2 collision reuse must be limited to the same execution');
    const base = { ...f.s2ExecutionIdentityBase };
    if (base.pipelineVersionKey === 'RECOMPUTE') base.pipelineVersionKey = pvk;
    if (base.combinedInputIdentity === 'RECOMPUTE') base.combinedInputIdentity = combinedIdentity(f.combinedIdentityBase);
    if (base.calibrationBundleHash !== f.pipelineVersionBase.calibrationBundleHash) fail('execution identity calibrationBundleHash must equal the manifest value');
    if (base.s4OrchestrationContractVersion !== f.pipelineVersionBase.s4OrchestrationContractVersion) fail('execution identity orchestration version must equal the manifest value');
    const id0 = execIdentity(base);
    hashes.s2ExecutionIdentityExpected = id0;
    if (!printHashes && id0 !== f.s2ExecutionIdentityExpected) fail(`S2 execution identity drift: ${id0}`);
    for (const m of f.s2ExecutionIdentityMutations) {
      const same = execIdentity({ ...base, ...m.set }) === id0;
      if ((m.expect === 'EQUAL') !== same) fail(`S2 execution identity "${m.name}" expected ${m.expect}`);
      results[`s2:${m.name}`] = (m.expect === 'EQUAL') === same ? 'PASS' : 'FAIL';
    }
    let aliases = 0;
    for (const k of S2_REQUIRED_COMPONENTS) {
      const mutated = { ...base, [k]: `${base[k]}#mut` };
      if (s2Key(base.tripId, execIdentity(mutated)) === s2Key(base.tripId, id0)) aliases += 1;
    }
    if (aliases) fail(`S2 semantic alias possible for ${aliases} component(s)`);
    log.push(`S2 execution identity: ${s2.components.length} components, ${f.s2ExecutionIdentityMutations.length} mutations, 0 S2-key aliases`);
  });

  // ── G. Tenancy ─────────────────────────────────────────────────────────────
  section('tenancy', () => {
    const tn = c.tenancy;
    if (tn.organizationSource !== 'TRIP_VEHICLE_ORGANIZATION') fail('tenancy organization source must be TRIP_VEHICLE_ORGANIZATION');
    if (tn.callerSuppliedOrganizationTrusted !== false) fail('caller-supplied organization must not be trusted');
    if (!tn.nonexistentColumns?.includes(NONEXISTENT_TRIP_ORG)) fail(`${NONEXISTENT_TRIP_ORG} must be recorded as nonexistent`);
    if (tn.dbEnforcementExistsToday !== false) fail('tenancy DB enforcement must not be claimed to exist today');
    const tripAnchored = ['di_v0_s4_work_items', 'di_v0_s4_evidence_snapshots', 'di_v0_shadow_runs'];
    for (const table of [...tripAnchored, 'di_v0_shadow_intervals']) if (!tn.scopeGuards?.[table]?.sql) fail(`tenancy scope guard missing for ${table}`);
    for (const table of tripAnchored) {
      const sql = tn.scopeGuards?.[table]?.sql ?? '';
      for (const frag of ['FROM vehicle_trips t', 'JOIN vehicles v ON v.id = t.vehicle_id', 't.id = NEW.trip_id', 't.vehicle_id = NEW.vehicle_id', 'v.organization_id = NEW.organization_id']) {
        if (!sql.includes(frag)) fail(`${table} scope guard must check trip -> vehicle -> organization (${frag})`);
      }
    }
    const isql = tn.scopeGuards?.di_v0_shadow_intervals?.sql ?? '';
    for (const frag of ['r.id = NEW.shadow_run_id', 'r.organization_id = NEW.organization_id', 'r.vehicle_id = NEW.vehicle_id', 'r.trip_id = NEW.trip_id']) {
      if (!isql.includes(frag)) fail(`di_v0_shadow_intervals scope guard must match its parent run (${frag})`);
    }
    const scan = JSON.parse(JSON.stringify(c));
    scan.tenancy.nonexistentColumns = [];
    const blob = JSON.stringify(scan);
    if (blob.includes(NONEXISTENT_TRIP_ORG) || /\bt\.organization_id\b/.test(blob)) fail(`contract references nonexistent ${NONEXISTENT_TRIP_ORG}`);
    for (const d of docs) {
      d.text.split('\n').forEach((line, i) => {
        if (line.includes(NONEXISTENT_TRIP_ORG) && !line.includes('NONEXISTENT')) fail(`${d.path}:${i + 1} references nonexistent ${NONEXISTENT_TRIP_ORG}`);
      });
    }
    const ts = f.tenantScope;
    for (const v of Object.values(ts.trips)) if (typeof v !== 'string') fail('tenant fixture trips must map to a vehicle id only (no trip-level organization)');
    for (const cs of ts.cases) {
      if ((cs.expect === 'ACCEPT') !== tenantGuard(ts, cs)) fail(`tenant case "${cs.name}" expected ${cs.expect}`);
    }
    log.push(`Tenancy: 4 scope guards, ${ts.cases.length} cases OK, ${docs.length} docs scanned`);
  });

  // ── H. Control plane ───────────────────────────────────────────────────────
  const flagBy = (pred) => Object.entries(cp.flags ?? {}).find(([, v]) => pred(v));
  const parseBool = (raw, dflt) => {
    if (raw == null || String(raw).trim() === '') return dflt;
    const n = String(raw).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(n)) return true;
    if (['0', 'false', 'no', 'off'].includes(n)) return false;
    return dflt;
  };
  const parseAllowlist = (raw, spec) => {
    if (raw == null || String(raw).trim() === '') return spec.emptyMeans === 'ALL' ? 'ALL' : new Set();
    const entries = String(raw).split(',').map((s) => s.trim());
    const re = new RegExp(spec.idPattern);
    for (const e of entries) {
      if (e === '*') return spec.wildcard === 'ALL' ? 'ALL' : new Set();
      if (!re.test(e)) return spec.malformedEntry === 'WHOLE_LIST_INVALID_MEANS_NONE' ? new Set() : new Set(entries.filter((x) => re.test(x)));
    }
    return new Set(entries);
  };
  const killState = (row) => {
    const k = cp.dbKillRow ?? {};
    if (row === 'MISSING') return k.missingRow;
    if (row === 'READ_ERROR') return k.readError;
    if (!row || !['KILLED', 'NOT_KILLED'].includes(row.kill_state)) return k.parseError;
    return row.kill_state;
  };
  const cpEval = (sc, vehicleOrganizations) => {
    const env = sc.env;
    const flag = (entry) => (entry ? parseBool(env[entry[0]], entry[1].default) : false);
    const al = cp.allowlists;
    const inList = (set, id) => set === 'ALL' || set.has(id);
    const terms = {
      MASTER: () => flag(flagBy((v) => v.kind === 'MASTER')),
      ROLE_FLAG: () => flag(flagBy((v) => v.kind === 'ROLE' && v.role === sc.role)),
      POSITION: () => flag(flagBy((v) => v.channel === 'POSITION')),
      ORG_ALLOWLISTED: () => inList(parseAllowlist(env[al.organization.env], al.organization), sc.workItem.organizationId),
      VEHICLE_ALLOWLISTED: () => inList(parseAllowlist(env[al.vehicle.env], al.vehicle), sc.workItem.vehicleId),
      VEHICLE_BELONGS_TO_ORG: () => vehicleOrganizations[sc.workItem.vehicleId] === sc.workItem.organizationId,
      DB_NOT_KILLED: () => killState(sc.killRow) === 'NOT_KILLED',
    };
    return cp.effectiveEnabledRequires.every((t) => (terms[t] ? terms[t]() : false)) ? 'ENABLED' : 'DISABLED';
  };
  section('control plane', () => {
    const flags = cp.flags ?? {};
    for (const [name, v] of Object.entries(flags)) if (v.default !== false) fail(`control flag ${name} must default OFF`);
    const need = [
      ['MASTER', (v) => v.kind === 'MASTER'], ['DISCOVERY', (v) => v.kind === 'ROLE' && v.role === 'DISCOVERY'], ['WORKER', (v) => v.kind === 'ROLE' && v.role === 'WORKER'],
      ['POSITION', (v) => v.channel === 'POSITION' && v.mandatory === true], ['R1', (v) => v.channel === 'R1_OBD' && v.mandatory === false && v.offOutcome === 'DISABLED'],
      ['NATIVE', (v) => v.channel === 'NATIVE_EVENT' && v.mandatory === false && v.offOutcome === 'DISABLED'],
    ];
    for (const [label, pred] of need) if (!flagBy(pred)) fail(`control flag missing or weakened: ${label}`);
    for (const t of CP_REQUIRED_TERMS) if (!cp.effectiveEnabledRequires?.includes(t)) fail(`effective enablement must require ${t}${t === 'POSITION' ? ' (position disabled must make the run non-executable)' : ''}`);
    for (const t of ['MASTER', 'DB_NOT_KILLED']) if (!cp.maintenanceActorsRequire?.includes(t)) fail(`maintenance actors must require ${t}`);
    if (cp.dbCanEnable !== false) fail('DB control must not be able to enable S4');
    const allowedKilled = cp.writesAllowedWhileKilled ?? cp.writesAllowedWhileDisabled ?? [];
    if (!eq(allowedKilled, WRITES_ALLOWED_WHILE_KILLED)) fail(`writesAllowedWhileKilled must be exactly ${WRITES_ALLOWED_WHILE_KILLED.join(', ')}`);
    if (cp.writesAllowedWhileDisabled !== undefined) fail('writesAllowedWhileDisabled is superseded by writesAllowedWhileKilled (C1D.10E)');
    for (const w of allowedKilled) if (T(w)?.to === 'COMPLETED' || T(w)?.leaseEpoch === 'INCREMENT') fail(`${w} must not be allowed while killed`);
    if (T('T07_FAIL_RETRYABLE')?.lease !== 'CLEAR') fail('T07 must CLEAR lease (safe relinquish only)');
    if (has('T07_FAIL_RETRYABLE', 'S2_WRITTEN_SAME_TX') || has('T07_FAIL_RETRYABLE', KILL_GUARD)) fail('T07 must not persist S2 or bypass kill guard semantics');
    for (const t of c.transitions) {
      const mustKill = !WRITES_ALLOWED_WHILE_KILLED.includes(t.id);
      if (mustKill && !t.guards.includes(KILL_GUARD)) fail(`${t.id} must include ${KILL_GUARD}`);
      if (!mustKill && t.guards.includes(KILL_GUARD)) fail(`${t.id} is the only transition permitted while killed and must not include ${KILL_GUARD}`);
    }
    for (const key of ['organization', 'vehicle']) {
      const a = cp.allowlists?.[key];
      if (!a) { fail(`${key} allowlist missing`); continue; }
      if (a.emptyMeans !== 'NONE') fail(`empty ${key} allowlist must mean NONE`);
      if (a.malformedEntry !== 'WHOLE_LIST_INVALID_MEANS_NONE') fail(`malformed ${key} allowlist must fail closed`);
      if (a.wildcard !== 'FORBIDDEN_TREATED_AS_MALFORMED') fail(`${key} allowlist wildcard must be forbidden`);
      if (!a.idPattern) fail(`${key} allowlist id pattern missing`);
    }
    if (cp.allowlists?.combination !== 'INTERSECTION_BOTH_REQUIRED') fail('allowlists must be an intersection (both required)');
    const k = cp.dbKillRow;
    if (!k) fail('DB kill row missing');
    else {
      if (k.disableOnly !== true || k.canEnableWhenEnvOff !== false) fail('DB kill row must be disable-only');
      for (const x of ['missingRow', 'readError', 'parseError', 'unknownValue']) if (k[x] !== 'KILLED') fail(`DB kill row ${x} must fail closed (KILLED)`);
      if (k.cacheMayEnable !== false) fail('kill-state cache must never enable');
      if (k.seededByMigration !== false) fail('kill row must not be seeded by the migration');
      if (k.customerPath !== false) fail('kill row must have no customer path');
      if (k.scope !== 'GLOBAL_ALL_REPLICAS') fail('kill row must apply across replicas');
      if (k.readPoint !== 'INSIDE_EACH_GATED_TRANSITION_TRANSACTION') fail('kill row must be read inside each gated transition transaction');
      for (const col of ['kill_state', 'reason', 'actor', 'updated_at']) if (!k.columns?.[col]) fail(`kill row column ${col} missing (auditability)`);
      if (/enabled/i.test(Object.keys(k.columns ?? {}).join(','))) fail('kill row must not carry an enable column');
    }
    for (const id of ['T02_CLAIM', 'T04_TAKEOVER', 'T06_COMPLETE']) if (!has(id, 'CONTROL_PLANE_WORKER_ENABLED')) fail(`${id} must be gated by the worker control plane`);
    if (!has('T01_CREATE', 'CONTROL_PLANE_DISCOVERY_ENABLED')) fail('T01 must be gated by the discovery control plane');
    const sc = f.controlPlaneScenarios;
    for (const cs of sc.cases) {
      const merged = { ...sc.base, ...cs.set, env: cs.set.env && Object.keys(cs.set.env).length === 0 ? {} : { ...sc.base.env, ...(cs.set.env ?? {}) } };
      const got = cpEval(merged, sc.vehicleOrganizations);
      results[`cp:${cs.name}`] = got === cs.expect ? 'PASS' : 'FAIL';
      if (got !== cs.expect) fail(`control-plane scenario "${cs.name}" expected ${cs.expect} got ${got}`);
    }
    log.push(`Control plane: ${Object.keys(flags).length} flags default OFF, ${sc.cases.length} scenarios OK`);
  });

  // ── Kill policy + authoritative write-set (P1-E exhaustive) ───────────────
  section('kill write-set', () => {
    const kp = c.killPolicy;
    if (!kp) fail('killPolicy section missing');
    if (!eq(kp.writesAllowedWhileKilled, WRITES_ALLOWED_WHILE_KILLED)) fail('killPolicy.writesAllowedWhileKilled mismatch');
    if (kp.serialization?.killCheckSameTxAsAuthoritativeWrite !== true) fail('kill check must occur in same transaction as authoritative write');
    if (kp.serialization?.controlRowLock !== "SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL' FOR UPDATE") fail('kill control row lock contract missing');
    const writes = c.authoritativeWrites ?? [];
    if (!writes.length) fail('authoritativeWrites registry empty');
    const ids = new Set();
    const byTransition = new Map();
    for (const w of writes) {
      if (!w.writeId || ids.has(w.writeId)) fail(`authoritative write duplicate or missing id: ${w.writeId}`);
      ids.add(w.writeId);
      const computedAllowed = w.transitionId
        ? WRITES_ALLOWED_WHILE_KILLED.includes(w.transitionId)
        : w.writeId === 'W_CONTROL_ROW_OPERATOR_UPDATE';
      if (w.allowedWhileKilled !== computedAllowed) fail(`${w.writeId}: allowedWhileKilled inconsistent with transition binding`);
      if (w.transitionId) {
        if (!T(w.transitionId)) fail(`${w.writeId}: unknown transitionId ${w.transitionId}`);
        if (byTransition.has(w.transitionId)) fail(`duplicate authoritative write for transition ${w.transitionId}`);
        byTransition.set(w.transitionId, w);
      }
    }
    for (const t of c.transitions) {
      if (!byTransition.has(t.id)) fail(`transition ${t.id} missing authoritativeWrites row`);
      const row = byTransition.get(t.id);
      if (row.requiresDbNotKilled !== !WRITES_ALLOWED_WHILE_KILLED.includes(t.id)) fail(`${t.id}: requiresDbNotKilled inconsistent`);
    }
    const boundOnly = writes.filter((w) => w.boundTo);
    const requiredBoundWriteIds = [
      'W_EVIDENCE_SNAPSHOT_INSERT', 'W_S2_RUN_INSERT', 'W_S2_INTERVAL_INSERT', 'W_PIPELINE_REGISTRY_UPSERT', 'W_SUCCESSOR_PRIMARY_INSERT',
    ];
    for (const id of requiredBoundWriteIds) if (!writes.some((w) => w.writeId === id)) fail(`authoritative write missing required bound write: ${id}`);
    for (const w of boundOnly) {
      if (!T(w.boundTo)) fail(`${w.writeId}: boundTo unknown transition ${w.boundTo}`);
      if (w.allowedWhileKilled) fail(`${w.writeId}: non-transition write must not be allowed while killed`);
      if (!w.requiresDbNotKilled) fail(`${w.writeId}: bound write must require DB_NOT_KILLED`);
    }
    if (writes.length !== 19) fail(`authoritativeWrites must classify exactly 19 writes (got ${writes.length})`);
    const transitionIds = new Set(c.transitions.map((t) => t.id));
    for (const id of WRITES_ALLOWED_WHILE_KILLED) if (!transitionIds.has(id)) fail(`writesAllowedWhileKilled references missing transition ${id}`);
    log.push(`Kill write-set: ${writes.length} authoritative writes classified, ${WRITES_ALLOWED_WHILE_KILLED.length} allowed while killed`);
  });

  // ── Channel run scenarios (flags x outcomes) ──────────────────────────────
  section('channel run scenarios', () => {
    const basePins = {
      POSITION: ['PRESENT', null, 'DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1:sha256:11', null],
      R1_OBD: ['PRESENT', null, 'DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3:sha256:22', null],
      NATIVE_EVENT: ['DISABLED', 'FLAG_OFF', null, null],
    };
    const offOutcome = (ch) => flagBy((v) => v.channel === ch)?.[1]?.offOutcome;
    for (const s of f.channelRunScenarios) {
      const pins = { ...basePins, ...s.pins };
      let got;
      try {
        for (const ch of ['R1_OBD', 'NATIVE_EVENT']) {
          const off = offOutcome(ch);
          if (!s.flags[ch] && pins[ch][0] !== off) throw new Error(`${ch} flag off requires ${off}`);
          if (s.flags[ch] && pins[ch][0] === off) throw new Error(`${ch} flag on forbids ${off}`);
        }
        if (!rules.channelPolicyV1ReachableNativeOutcomes.includes(pins.NATIVE_EVENT[0])) throw new Error('native outcome unreachable under policy V1');
        combinedIdentity(pins);
        got = rules.positionRunnableOutcomes.includes(pins.POSITION[0]) ? 'RUNNABLE' : 'NOT_RUNNABLE';
      } catch {
        got = 'INVALID';
      }
      results[`ch:${s.name}`] = got === s.expect ? 'PASS' : 'FAIL';
      if (got !== s.expect) fail(`channel scenario "${s.name}" expected ${s.expect} got ${got}`);
    }
    log.push(`Channel run scenarios: ${f.channelRunScenarios.length} OK`);
  });

  // ── I. Migration ───────────────────────────────────────────────────────────
  section('migration', () => {
    const m = c.migration;
    for (const p of ['S2_SHADOW_RUNS_EMPTY', 'S2_SHADOW_INTERVALS_EMPTY']) if (!m.preconditions?.includes(p)) fail(`S4A migration missing precondition ${p} (empty-S2)`);
    if (m.preconditionEnforcement !== 'IN_MIGRATION_DO_BLOCK_RAISE_EXCEPTION') fail('empty-S2 precondition must be enforced inside the migration');
    if (m.effect !== 'DORMANT_ONLY') fail('S4A migration must be dormant-only');
    if (m.seedRows !== 'NONE') fail('S4A migration must seed no rows');
    if (m.migrationCreated !== false) fail('C1D.10C must not create a migration');
    for (const t of ['di_v0_s4_work_items', 'di_v0_s4_evidence_snapshots', 'di_v0_s4_control', 'di_v0_s4_pipeline_versions']) if (!m.newTables?.includes(t)) fail(`migration new table missing: ${t}`);
    for (const r of ['NO_ALTER_OF_CANONICAL_TABLES', 'NO_BACKFILL', 'NO_ON_DELETE_RESTRICT_OR_NO_ACTION_TO_CANONICAL', 'EXPLICIT_BEGIN_COMMIT_WITH_LOCAL_LOCK_TIMEOUT_5S_AND_STATEMENT_TIMEOUT_60S', 'REQUIRES_EMPTY_S2_TABLES_PRECONDITION', 'DORMANT_ONLY_NO_SEED_ROWS']) {
      if (!c.migrationRules.includes(r)) fail(`migration rule missing: ${r}`);
    }
    for (const inv of ['NO_VEHICLE_TRIP_WRITE', 'NO_TRIP_FSM_CALL', 'NO_CUSTOMER_ENDPOINT', 'NO_CONSTRAINT_THAT_CAN_FAIL_A_CANONICAL_WRITE_OR_DELETE']) {
      if (!c.zeroImpactInvariants.includes(inv)) fail(`zero-impact invariant missing: ${inv}`);
    }
  });

  // ── J. Settlement ──────────────────────────────────────────────────────────
  section('settlement', () => {
    const s = c.settlement;
    if (!(s.quietPeriodSeconds >= 86400)) fail(`settlement quiet period must be >= 24h (got ${s.quietPeriodSeconds}s)`);
    if (!(s.driftHorizonSeconds >= 864000)) fail(`drift horizon must be >= 10d (got ${s.driftHorizonSeconds}s)`);
    if (!(s.driftHorizonSeconds > s.quietPeriodSeconds)) fail('drift horizon must exceed the quiet period');
    for (const p of ['ATTEMPT_START_AFTER_CLAIM', 'COMPLETION_TX_BEFORE_S2_WRITE']) if (!s.fingerprintRecheckPoints?.includes(p)) fail(`boundary fingerprint re-check missing at ${p}`);
    if (s.driftWatcherRehash !== true) fail('drift watcher must re-hash the boundary fingerprint');
    if (s.unrecordedBoundaryMutationDetection !== 'BOUNDARY_FINGERPRINT_DIFFERENCE') fail('unrecorded boundary mutations must be detected by fingerprint difference');
    if (s.everyBoundaryMutationRearmsQuietTimer !== false) fail('contract must not claim every boundary mutation re-arms the quiet timer');
    if (s.timeAuthority?.interpretation !== 'UTC' || !s.timeAuthority?.naiveColumns?.includes('trip_repairs.applied_at')) fail('trip_repairs.applied_at time authority must be frozen (UTC)');
    if (!/AT TIME ZONE 'UTC'/.test(s.timeAuthority?.comparisonRule ?? '')) fail('naive/aware timestamp comparison rule missing');
    if (!/trip_repairs\.applied_at/.test(s.anchor) || !/end_time/.test(s.anchor) || !/created_at/.test(s.anchor)) fail('settlement anchor must be max(end_time, created_at, applied repair)');
    if (!has('T06_COMPLETE', 'BOUNDARY_FINGERPRINT_UNCHANGED')) fail('T06 must re-check the boundary fingerprint');
  });

  // ── §13. Pipeline retirement ───────────────────────────────────────────────
  section('pipeline retirement', () => {
    const r = c.pipelineRetirement;
    if (r.claimRequiresPipelineActive !== true) fail('claims must require an ACTIVE pipeline version');
    if (r.crossVersionProcessingAllowed !== false) fail('cross-version processing must be forbidden');
    if (r.retiredToActive !== 'FORBIDDEN') fail('RETIRED must not return to ACTIVE');
    if (r.evidencePreserved !== true || r.s2HistoryPreserved !== true) fail('retirement must preserve evidence and S2 history');
    if (!r.distinguishes?.NO_ACTIVE_REPLICA_TEMPORARY || !r.distinguishes?.PIPELINE_RETIRED) fail('contract must distinguish temporarily-no-replica from pipeline-retired');
    const t = T(r.transition);
    if (!t || t.to !== r.targetState || !t.guards.includes('PIPELINE_VERSION_RETIRED') || !t.guards.includes('LEASE_EXPIRED_OR_NOT_LEASED')) fail('retirement transition missing or unguarded');
  });

  // ── §17. Activation gates ──────────────────────────────────────────────────
  section('activation gates', () => {
    const g = c.activationGates;
    const req = (gate, item) => g[gate]?.requires?.includes(item);
    if (c.replay.deserializerImplemented === false) {
      for (const gate of ['TINY_ACTIVATION', 'REPLAY_CAPABLE_SHADOW']) if (!req(gate, 'DI-GAP-S4-REPLAY-DESERIALIZER-001:CLOSED')) fail(`${gate} must be blocked until the snapshot deserializer exists`);
      for (const gate of ['TINY_ACTIVATION', 'REPLAY_CAPABLE_SHADOW']) if (!req(gate, 'SNAPSHOT_REHASH_VERIFICATION:IMPLEMENTED')) fail(`${gate} must require snapshot hash verification`);
    }
    if (!req('NATIVE_CHANNEL_ENABLE', 'DI-GAP-S4-NATIVE-READINESS-001:CLOSED') || !req('NATIVE_CHANNEL_ENABLE', 'DIM-GAP-007:CLOSED')) fail('native channel enablement must require the native readiness gaps closed');
    if (!req('S4A_DORMANT_SCHEMA_MERGE', 'S2_TABLES_EMPTY') || !req('S4A_DORMANT_SCHEMA_MERGE', 'ALL_FLAGS_DEFAULT_OFF')) fail('dormant schema merge must require empty S2 and default-off flags');
    if (!req('TINY_ACTIVATION', 'DI-GAP-S4-PROVIDER-BACKPRESSURE-001:CLOSED')) fail('tiny activation must require the provider backpressure gap closed');
    const pb = c.providerBackpressure;
    if (pb.requestContext?.priority !== 'BACKGROUND' || pb.s4InAttemptRetryLoop !== false) fail('provider backpressure: BACKGROUND priority and no in-attempt retry loop required');
  });

  // ── Race model (guard-driven: removing a guard changes behavior) ──────────
  section('race model', () => {
    const pinnedKill = Array.from({ length: 18 }, (_, i) => `K${String(i + 1).padStart(2, '0')}`);
    if (!f.requiredKillRaceIds || !eq(f.requiredKillRaceIds, pinnedKill)) fail('fixtures.requiredKillRaceIds must pin K01..K18');
    if (!f.requiredRaceIds?.length) fail('fixtures.requiredRaceIds must pin core R## races');
    const required = [...f.requiredRaceIds, ...f.requiredKillRaceIds];
    const allRaces = [...(f.races ?? []), ...(f.killRaces ?? [])];
    const seen = new Set(allRaces.map((r) => r.id));
    for (const id of required) if (!seen.has(id)) fail(`required pinned race missing: ${id}`);
    for (const race of allRaces) {
      if (!race.id || (!/^R\d{2}_/.test(race.id) && !/^K\d{2}$/.test(race.id))) fail(`race fixture must have pinned id (R##_… or K##), got ${race.id}`);
      const r = runRace(race);
      const e = race.expect;
      const first = r.items[0];
      const active = r.items.find((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED') ?? first;
      const before = errors.length;
      const check = (label, actual, expected) => {
        if (expected !== undefined && !eq(actual, expected)) fail(`${race.id}: ${label} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
      };
      check('itemCount', r.items.length, e.itemCount);
      check('status', active?.status, e.status);
      check('leaseOwner', active?.owner, e.leaseOwner);
      check('leaseEpoch', active?.epoch, e.leaseEpoch);
      check('shadowRunId', active?.shadowRunId, e.shadowRunId);
      check('pinned', active?.pinned, e.pinned);
      check('attemptCount', active?.attempts, e.attemptCount);
      check('failureReason', active?.failureReason, e.failureReason);
      check('oldStatus', first?.status, e.oldStatus);
      check('supersededReason', first?.supersededReason, e.supersededReason);
      check('activePrimaryCount', r.activePrimaryCount, e.activePrimaryCount);
      check('s2WritesCommitted', r.committed, e.s2WritesCommitted);
      const expected = e.rejected ?? [];
      for (const tok of expected) if (!r.rejected.some((x) => x === tok || x.startsWith(`${tok}:`))) fail(`${race.id}: expected rejection ${tok} not observed`);
      for (const x of r.rejected) if (!expected.some((tok) => x === tok || x.startsWith(`${tok}:`))) fail(`${race.id}: unexpected rejection ${x}`);
      results[`race:${race.id}`] = errors.length === before ? 'PASS' : 'FAIL';
    }
    log.push(`Race model: ${allRaces.length} races OK (${f.killRaces?.length ?? 0} kill)`);
  });

  function runRace(race) {
    let now = 0;
    let currentFp = 'fp-1';
    let killed = false;
    let killMode = 'NOT_KILLED';
    const dbKillState = () => {
      if (killMode === 'MISSING' || killMode === 'READ_ERROR' || killMode === 'MALFORMED' || killMode === 'KILLED') return 'KILLED';
      return 'NOT_KILLED';
    };
    const killBlocks = (tid) => has(tid, KILL_GUARD) && dbKillState() === 'KILLED';
    let registry = 'ACTIVE';
    let s2Conflict = null;
    const items = [];
    const held = new Map();
    const rejected = [];
    const committed = [];
    const byLogical = new Set();
    const applied = (from, to, id) => {
      if (!legal.has(`${from}->${to}`)) fail(`${race.id}: model applied illegal ${from}->${to} (${id})`);
    };
    const activePrimaryExists = () => items.some((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED');
    const target = () => items.find((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED') ?? items[items.length - 1] ?? items[0];
    const create = (purpose, disc, fpv = currentFp) => {
      const discriminator = purpose === 'PRIMARY' ? 'PRIMARY' : disc;
      const key = ['org-A', 'trip-A1-1', fpv, 'pvk-1', purpose, discriminator].join('|');
      if (has('T01_CREATE', 'LOGICAL_KEY_UNIQUE') && byLogical.has(key)) return false;
      if (has('T01_CREATE', 'ACTIVE_PRIMARY_UNIQUE') && purpose === 'PRIMARY' && activePrimaryExists()) return false;
      if (has('T01_CREATE', 'PIPELINE_VERSION_ACTIVE') && registry !== 'ACTIVE') return false;
      if (has('T01_CREATE', 'CONTROL_PLANE_DISCOVERY_ENABLED') && dbKillState() === 'KILLED') return false;
      if (has('T01_CREATE', KILL_GUARD) && dbKillState() === 'KILLED') return false;
      byLogical.add(key);
      applied('NONE', 'PENDING', 'T01');
      items.push({
        id: `wi-${items.length + 1}`, purpose, fp: fpv, pvk: 'pvk-1', status: 'PENDING', epoch: 0, attempts: 0, owner: null, expires: null,
        acquiredAt: null, pinned: c.runPurposes[purpose]?.pinnedAtCreate ? disc : null, shadowRunId: null, failureReason: null, supersededReason: null,
      });
      return true;
    };
    const holder = (tid, it, actor) => {
      if (!it || !T(tid)?.from.includes(it.status)) return false;
      const token = held.get(actor);
      if (!token || !token.startsWith(`${it.id}#`)) return false;
      if (has(tid, 'EPOCH_MATCH') && token !== `${it.id}#${it.epoch}`) return false;
      if (has(tid, 'LEASE_NOT_EXPIRED_DB_CLOCK') && !(it.expires != null && now < it.expires)) return false;
      if (killBlocks(tid)) return false;
      if (has(tid, 'CONTROL_PLANE_WORKER_ENABLED') && dbKillState() === 'KILLED') return false;
      return true;
    };
    const release = (it) => { it.owner = null; it.expires = null; it.acquiredAt = null; };
    const supersede = (it, reason, successorFp) => {
      applied(it.status, 'SUPERSEDED', reason);
      it.status = 'SUPERSEDED'; it.epoch += 1; it.supersededReason = reason; release(it);
      if (successorFp) {
        currentFp = successorFp;
        if (!create('PRIMARY', null, successorFp)) fail(`${race.id}: successor creation failed after supersession`);
      }
    };
    for (const [op, actor, a1, a2] of race.steps) {
      let ok = true;
      const it = target();
      switch (op) {
        case 'create': ok = create(a1, a2); break;
        case 'advance': now += actor; continue;
        case 'kill': killed = true; killMode = 'KILLED'; continue;
        case 'setKillMissing': killMode = 'MISSING'; continue;
        case 'setKillMalformed': killMode = 'MALFORMED'; continue;
        case 'setKillReadError': killMode = 'READ_ERROR'; continue;
        case 'retireRegistry': registry = 'RETIRED'; continue;
        case 'tripChange': currentFp = a1; continue;
        case 's2Preexisting': s2Conflict = a1; continue;
        case 'claim': {
          const workerPvk = a2 ?? 'pvk-1';
          const takeover = it?.status === 'LEASED';
          const tid = takeover ? 'T04_TAKEOVER' : 'T02_CLAIM';
          let allowed = Boolean(it) && T(tid).from.includes(it.status);
          if (allowed && takeover && has(tid, 'LEASE_EXPIRED_DB_CLOCK')) allowed = now >= it.expires;
          if (allowed && has(tid, 'ATTEMPTS_REMAINING')) allowed = it.attempts < L.maxAttempts;
          if (allowed && has(tid, 'PIPELINE_VERSION_MATCH')) allowed = it.pvk === workerPvk;
          if (allowed && has(tid, 'PIPELINE_VERSION_ACTIVE')) allowed = registry === 'ACTIVE';
          if (allowed && has(tid, KILL_GUARD)) allowed = dbKillState() === 'NOT_KILLED';
          if (allowed && has(tid, 'CONTROL_PLANE_WORKER_ENABLED')) allowed = dbKillState() === 'NOT_KILLED';
          if (allowed) {
            applied(it.status, 'LEASED', tid);
            it.status = 'LEASED'; it.epoch += 1; it.attempts += 1; it.owner = actor; it.acquiredAt = now; it.expires = now + L.leaseDurationSeconds;
            held.set(actor, `${it.id}#${it.epoch}`);
          } else ok = false;
          break;
        }
        case 'heartbeat':
          if (holder('T03_HEARTBEAT', it, actor)) {
            applied('LEASED', 'LEASED', 'T03');
            const next = now + L.leaseDurationSeconds;
            it.expires = has('T03_HEARTBEAT', 'LEASE_CEILING_APPLIED') ? Math.min(next, it.acquiredAt + L.absoluteLeaseLifetimeCeilingSeconds) : next;
          } else ok = false;
          break;
        case 'pin':
          if (holder('T05_PIN', it, actor) && (!has('T05_PIN', 'PIN_NOT_SET') || it.pinned == null) &&
            (!has('T05_PIN', 'SNAPSHOT_SAME_TENANT') || tenantGuard(f.tenantScope, { organizationId: 'org-A', vehicleId: 'veh-A1', tripId: 'trip-A1-1', pinSnapshot: a1.startsWith('snap-A') ? 'snap-A' : a1 }))) {
            applied('LEASED', 'LEASED', 'T05'); it.pinned = a1;
          } else ok = false;
          break;
        case 'complete': {
          const tid = 'T06_COMPLETE';
          let allowed = holder(tid, it, actor);
          if (allowed && has(tid, 'PIN_SET')) allowed = it.pinned != null;
          if (allowed && has(tid, 'BOUNDARY_FINGERPRINT_UNCHANGED')) allowed = it.fp === currentFp;
          if (allowed && has(tid, 'PIPELINE_VERSION_MATCH')) allowed = it.pvk === (a2 ?? 'pvk-1');
          if (allowed && has(tid, 'PIPELINE_VERSION_ACTIVE')) allowed = registry === 'ACTIVE';
          if (allowed && has(tid, 'S2_EXECUTION_IDENTITY_MATCH')) allowed = s2Conflict == null;
          if (allowed) {
            applied('LEASED', 'COMPLETED', tid);
            it.status = 'COMPLETED'; it.shadowRunId = a1; release(it); committed.push(actor);
          } else ok = false;
          break;
        }
        case 'completeRollback': break;
        case 'failRetryable': {
          const tid = 'T07_FAIL_RETRYABLE';
          const allowed = holder(tid, it, actor) && (!has(tid, 'ATTEMPTS_REMAINING') || it.attempts < L.maxAttempts);
          if (allowed) { applied('LEASED', 'FAILED_RETRYABLE', tid); it.status = 'FAILED_RETRYABLE'; release(it); } else ok = false;
          break;
        }
        case 'failTerminal':
          if (holder('T08_FAIL_TERMINAL', it, actor)) { applied('LEASED', 'FAILED_TERMINAL', 'T08'); it.status = 'FAILED_TERMINAL'; it.failureReason = a1 ?? 'TERMINAL'; release(it); } else ok = false;
          break;
        case 'skip': {
          const tid = 'T09_SKIP_INELIGIBLE';
          let allowed = holder(tid, it, actor);
          if (allowed && has(tid, 'PIN_NOT_SET')) allowed = it.pinned == null;
          if (allowed && has(tid, 'RUN_PURPOSE_NOT_RECALIBRATION_REPLAY')) allowed = it.purpose !== 'RECALIBRATION_REPLAY';
          if (allowed) { applied('LEASED', 'SKIPPED_INELIGIBLE', tid); it.status = 'SKIPPED_INELIGIBLE'; release(it); } else ok = false;
          break;
        }
        case 'holderSupersede': {
          const tid = 'T13_HOLDER_SUPERSEDE';
          let allowed = Boolean(T(tid)) && holder(tid, it, actor);
          if (allowed && has(tid, 'BOUNDARY_FINGERPRINT_CHANGED')) allowed = it.fp !== currentFp;
          if (allowed) supersede(it, 'BOUNDARY_CHANGED', a1); else ok = false;
          break;
        }
        case 'supersede': {
          const active = items.find((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED' && i.fp !== a1);
          if (!active || !T('T11_SUPERSEDE').from.includes(active.status) || (has('T11_SUPERSEDE', KILL_GUARD) && dbKillState() === 'KILLED') || (has('T11_SUPERSEDE', 'CONTROL_PLANE_MAINTENANCE_ENABLED') && dbKillState() === 'KILLED')) { ok = false; break; }
          supersede(active, 'BOUNDARY_CHANGED', a1);
          break;
        }
        case 'retire': {
          const tid = 'T12_RETIRE';
          let allowed = Boolean(T(tid)) && Boolean(it) && T(tid).from.includes(it.status);
          if (allowed && has(tid, 'PIPELINE_VERSION_RETIRED')) allowed = registry === 'RETIRED';
          if (allowed && has(tid, 'LEASE_EXPIRED_OR_NOT_LEASED')) allowed = it.status !== 'LEASED' || now >= it.expires;
          if (allowed && has(tid, KILL_GUARD)) allowed = dbKillState() === 'NOT_KILLED';
          if (allowed && has(tid, 'CONTROL_PLANE_MAINTENANCE_ENABLED')) allowed = dbKillState() === 'NOT_KILLED';
          if (allowed) supersede(it, 'PIPELINE_RETIRED', null); else ok = false;
          break;
        }
        case 'reap': {
          const tid = 'T10_EXHAUST';
          let allowed = it?.status === 'LEASED';
          if (allowed && has(tid, 'LEASE_EXPIRED_DB_CLOCK')) allowed = now >= it.expires;
          if (allowed && has(tid, 'ATTEMPTS_EXHAUSTED')) allowed = it.attempts >= L.maxAttempts;
          if (allowed) { applied('LEASED', 'FAILED_TERMINAL', tid); it.status = 'FAILED_TERMINAL'; it.epoch += 1; it.failureReason = 'EXHAUSTED'; release(it); } else ok = false;
          break;
        }
        default:
          fail(`${race.id}: unknown op ${op}`);
      }
      if (!ok) rejected.push(`${actor}:${op}`);
      for (const i of items) {
        if ((i.status === 'LEASED') !== (i.owner != null && i.expires != null)) fail(`${race.id}: lease columns inconsistent with ${i.status}`);
        if (i.status === 'COMPLETED' && (!i.shadowRunId || !i.pinned)) fail(`${race.id}: COMPLETED without shadowRunId/pin`);
        if (i.shadowRunId && !['COMPLETED', 'SUPERSEDED'].includes(i.status)) fail(`${race.id}: shadowRunId on ${i.status}`);
        if (i.status === 'SKIPPED_INELIGIBLE' && i.pinned != null) fail(`${race.id}: SKIPPED_INELIGIBLE with a pin (CHECK would loop)`);
      }
      if (items.filter((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED').length > 1) fail(`${race.id}: more than one active PRIMARY`);
      if (committed.length > 1 && new Set(committed).size !== committed.length) fail(`${race.id}: duplicate S2 commit`);
    }
    return { items, rejected, committed, activePrimaryCount: items.filter((i) => i.purpose === 'PRIMARY' && i.status !== 'SUPERSEDED').length };
  }

  return { errors, log, results, hashes };
}

function tenantGuard(ts, { organizationId, vehicleId, tripId, pinSnapshot }) {
  if (!ts.organizations[organizationId]) return false;
  const tripVehicle = ts.trips[tripId];
  if (tripVehicle === undefined || tripVehicle !== vehicleId) return false;
  if (ts.vehicles[tripVehicle] !== organizationId) return false;
  if (pinSnapshot) {
    const s = ts.snapshots[pinSnapshot];
    if (!s || s.organizationId !== organizationId || s.tripId !== tripId) return false;
  }
  return true;
}

export function loadDesignDocs(dir = DESIGN_DIR) {
  return fs.readdirSync(dir).filter((n) => n.endsWith('.md')).map((n) => ({ path: path.join('design/s4a', n), text: fs.readFileSync(path.join(dir, n), 'utf8') }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const idx = process.argv.indexOf('--contract');
  const contractPath = idx > -1 ? path.resolve(process.argv[idx + 1]) : DEFAULT_CONTRACT;
  const printHashes = process.argv.includes('--print-hashes');
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const { errors, log, hashes } = validateContract(contract, { docs: loadDesignDocs(), printHashes });
  for (const l of log) console.log(`==> ${l}`);
  if (printHashes) for (const [k, v] of Object.entries(hashes)) console.log(k, v);
  if (errors.length) {
    console.error('\n==> S4A CONTRACT VALIDATION FAILED');
    for (const e of errors) console.error('  -', e);
    process.exit(1);
  }
  console.log(`==> S4A contract validation passed (${contract.contractVersion})`);
}
