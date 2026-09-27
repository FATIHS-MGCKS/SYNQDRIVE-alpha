#!/usr/bin/env node
// Red-team suite for the S4A machine contract. Every negative case mutates the canonical v2
// contract into a prohibited configuration and must be REJECTED by validate-s4a-contract.mjs
// for its intended reason (a rejection for an unrelated reason counts as a false accept).
// Every positive case must be ACCEPTED. Pure, offline, deterministic.
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONTRACT, DESIGN_DIR, loadDesignDocs, validateContract } from './validate-s4a-contract.mjs';

const base = JSON.parse(fs.readFileSync(DEFAULT_CONTRACT, 'utf8'));
const docs = loadDesignDocs();
const clone = () => JSON.parse(JSON.stringify(base));
const T = (c, id) => c.transitions.find((t) => t.id === id);
const drop = (c, id, ...g) => { T(c, id).guards = T(c, id).guards.filter((x) => !g.includes(x)); };

const NEGATIVE = [
  ['N01', 'pipeline-version match missing', (c) => ['T02_CLAIM', 'T04_TAKEOVER', 'T06_COMPLETE'].forEach((id) => drop(c, id, 'PIPELINE_VERSION_MATCH')), /PIPELINE_VERSION_MATCH/],
  ['N02', 'stale worker allowed to complete', (c) => drop(c, 'T06_COMPLETE', 'EPOCH_MATCH', 'LEASE_NOT_EXPIRED_DB_CLOCK'), /T06_COMPLETE: (lease-holder transition without|completion lacks) (EPOCH_MATCH|LEASE_NOT_EXPIRED)/],
  ['N03', 'fencing epoch missing', (c) => { c.executionAuthority.fencingToken = ['workItemId']; }, /fencing token/],
  ['N04', 'BullMQ set as idempotency authority', (c) => { c.executionAuthority.bullmqIsIdempotencyAuthority = true; c.executionAuthority.authority = 'BULLMQ_JOB'; c.identity.logicalKey = ['bullmqJobId']; }, /BullMQ must not be idempotency authority/],
  ['N05', 'native empty result allowed as READY_NO_EVENT without attestation', (c) => {
    c.channelRules.nativeReadyOutcomesRequireAttestation = ['READY_WITH_EVENTS'];
    c.channelRules.channelPolicyV1ReachableNativeOutcomes.push('READY_NO_EVENT');
    c.nativeReadiness.legacyEmptyResultMapsTo = 'READY_NO_EVENT';
  }, /READY_NO_EVENT/],
  ['N06', 'live DIMO re-query declared replay', (c) => { c.replay.liveProviderRequeryIsReplay = true; c.runPurposes.RECALIBRATION_REPLAY.providerAcquisitionAllowed = true; }, /re-query/],
  ['N07', 'tenancy guard missing', (c) => { delete c.tenancy.scopeGuards.di_v0_s4_work_items; drop(c, 'T01_CREATE', 'TENANT_SCOPE_VALID'); }, /scope guard missing for di_v0_s4_work_items|T01_CREATE lacks TENANT_SCOPE_VALID/],
  ['N08', 'duplicate active PRIMARY permitted', (c) => { delete c.identity.activePrimaryKey; drop(c, 'T01_CREATE', 'ACTIVE_PRIMARY_UNIQUE'); }, /active-PRIMARY unique key missing|ACTIVE_PRIMARY_UNIQUE/],
  ['N09', '10-minute settlement', (c) => { c.settlement.quietPeriodSeconds = 600; }, /quiet period must be >= 24h/],
  ['N10', 'illegal state transition permitted', (c) => c.transitions.push({ id: 'TX_REOPEN', from: ['COMPLETED'], to: 'LEASED', actor: 'WORKER', leaseEpoch: 'INCREMENT', attemptCount: 'INCREMENT', lease: 'SET', guards: ['PIPELINE_VERSION_MATCH', 'CONTROL_PLANE_WORKER_ENABLED', 'PIPELINE_VERSION_ACTIVE', 'ATTEMPTS_REMAINING'] }), /illegal transition permitted: COMPLETED->LEASED/],
  ['N11', 'disabled and not-applicable collapsed', (c) => { for (const ch of ['R1_OBD', 'NATIVE_EVENT']) c.channelOutcomes[ch] = c.channelOutcomes[ch].filter((o) => o !== 'DISABLED'); }, /must distinguish DISABLED/],
  ['N12', 'empty allowlist means ALL', (c) => { c.controlPlane.allowlists.organization.emptyMeans = 'ALL'; c.controlPlane.allowlists.vehicle.emptyMeans = 'ALL'; }, /empty (organization|vehicle) allowlist must mean NONE/],
  ['N13', 'S4A migration missing empty-S2 precondition', (c) => { c.migration.preconditions = []; c.migrationRules = c.migrationRules.filter((r) => r !== 'REQUIRES_EMPTY_S2_TABLES_PRECONDITION'); }, /empty-S2|REQUIRES_EMPTY_S2_TABLES_PRECONDITION/],
  ['N14', 'S2 identity omits pipelineVersionKey', (c) => { c.s2ExecutionIdentity.components = c.s2ExecutionIdentity.components.filter((k) => k !== 'pipelineVersionKey'); }, /S2 execution identity omits pipelineVersionKey/],
  ['N15', 'S2 identity omits calibrationBundleHash', (c) => { c.s2ExecutionIdentity.components = c.s2ExecutionIdentity.components.filter((k) => k !== 'calibrationBundleHash'); }, /S2 execution identity omits calibrationBundleHash/],
  ['N16', 'S2 identity omits boundaryFingerprint', (c) => { c.s2ExecutionIdentity.components = c.s2ExecutionIdentity.components.filter((k) => k !== 'boundaryFingerprint'); }, /S2 execution identity omits boundaryFingerprint/],
  ['N17', 'S2 identity uses ambiguous channelSnapshotVersion', (c) => { c.combinedInputIdentity.fields[3] = 'channelSnapshotVersion'; c.s2ExecutionIdentity.components.push('channelSnapshotVersion'); }, /channelSnapshotVersion/],
  ['N18', 'tenancy design references vehicle_trips.organization_id', (c) => {
    c.tenancy.scopeGuards.di_v0_s4_work_items.sql = 'EXISTS (SELECT 1 FROM vehicle_trips t JOIN vehicles v ON v.id = t.vehicle_id WHERE t.id = NEW.trip_id AND t.vehicle_id = NEW.vehicle_id AND v.organization_id = NEW.organization_id AND vehicle_trips.organization_id = NEW.organization_id)';
  }, /references nonexistent vehicle_trips\.organization_id/],
  ['N18B', 'design doc references vehicle_trips.organization_id', null, /S4A_FAKE\.md:1 references nonexistent vehicle_trips\.organization_id/,
    { docs: [...docs, { path: 'design/s4a/S4A_FAKE.md', text: 'guard: vehicle_trips.organization_id = NEW.organization_id' }] }],
  ['N19', 'kill row absent', (c) => { delete c.controlPlane.dbKillRow; }, /DB kill row missing/],
  ['N20', 'kill-row read failure fails open', (c) => { c.controlPlane.dbKillRow.readError = 'NOT_KILLED'; }, /readError must fail closed/],
  ['N21', 'master flag defaults ON', (c) => { c.controlPlane.flags.DI_V0_S4_MASTER_ENABLED.default = true; }, /DI_V0_S4_MASTER_ENABLED must default OFF/],
  ['N22', 'position channel disabled while run still executable', (c) => { c.controlPlane.effectiveEnabledRequires = c.controlPlane.effectiveEnabledRequires.filter((t) => t !== 'POSITION'); }, /must require POSITION/],
  ['N23', 'expired-lease worker may write FAILED_RETRYABLE', (c) => drop(c, 'T07_FAIL_RETRYABLE', 'LEASE_NOT_EXPIRED_DB_CLOCK'), /T07_FAIL_RETRYABLE: lease-holder transition without LEASE_NOT_EXPIRED/],
  ['N24', 'expired-lease worker may write SKIPPED/FAILED_TERMINAL', (c) => { drop(c, 'T08_FAIL_TERMINAL', 'LEASE_NOT_EXPIRED_DB_CLOCK'); drop(c, 'T09_SKIP_INELIGIBLE', 'LEASE_NOT_EXPIRED_DB_CLOCK'); }, /T0[89]_[A-Z_]+: lease-holder transition without LEASE_NOT_EXPIRED/],
  ['N25', 'replay item may become SKIPPED_INELIGIBLE', (c) => { c.states.SKIPPED_INELIGIBLE.allowedRunPurposes.push('RECALIBRATION_REPLAY'); drop(c, 'T09_SKIP_INELIGIBLE', 'PIN_NOT_SET', 'RUN_PURPOSE_NOT_RECALIBRATION_REPLAY'); }, /replay\/SKIPPED contradiction|T09 must require PIN_NOT_SET/],
  ['N26', 'pipeline retirement transition missing', (c) => { c.transitions = c.transitions.filter((t) => t.id !== 'T12_RETIRE'); }, /retirement transition missing/],
  ['N27', 'work budget exceeds lease duration', (c) => { c.limits.workExecutionBudgetSeconds = 600; }, /work budget must be shorter than lease duration/],
  ['N28', 'heartbeat incompatible with lease', (c) => { c.limits.heartbeatIntervalSeconds = 200; }, /at least 3 heartbeat intervals/],
  ['N29', '900 s ceiling read as single compute permission', (c) => { c.executionAuthority.leaseCeilingSemantics = 'SINGLE_ATTEMPT_COMPUTE_PERMISSION'; }, /lease ceiling semantics/],
  ['N30', 'S2 identity includes workerId / wall clock', (c) => { c.s2ExecutionIdentity.components.push('workerId', 'acquiredAtWallClock'); }, /must not include (workerId|acquiredAtWallClock)/],
  ['N31', 'fingerprint re-check at attempt start removed', (c) => { c.settlement.fingerprintRecheckPoints = ['COMPLETION_TX_BEFORE_S2_WRITE']; }, /re-check missing at ATTEMPT_START_AFTER_CLAIM/],
  ['N32', 'tiny activation not blocked by deserializer', (c) => { c.activationGates.TINY_ACTIVATION.requires = c.activationGates.TINY_ACTIVATION.requires.filter((r) => !r.startsWith('DI-GAP-S4-REPLAY-DESERIALIZER-001')); }, /TINY_ACTIVATION must be blocked until the snapshot deserializer/],
  ['N33', 'legacy native markers accepted as attestation', (c) => { c.nativeReadiness.legacyMarkersAreAttestation = true; }, /legacy native markers/],
  ['N34', 'S2 collision reuses a different execution', (c) => { c.s2ExecutionIdentity.collision.onConflictDifferentIdentity = 'REUSE_EXISTING_RUN'; }, /different identity must fail closed/],
  ['N35', 'DB row can enable S4', (c) => { c.controlPlane.dbCanEnable = true; c.controlPlane.dbKillRow.canEnableWhenEnvOff = true; }, /must not be able to enable|disable-only/],
  ['N36', '1-day drift horizon', (c) => { c.settlement.driftHorizonSeconds = 86400; }, /drift horizon must be >= 10d/],
  ['N37', 'caller-supplied organization trusted', (c) => { c.tenancy.callerSuppliedOrganizationTrusted = true; c.tenancy.organizationSource = 'CALLER_SUPPLIED'; }, /organization source must be TRIP_VEHICLE_ORGANIZATION|caller-supplied organization/],
  ['N38', 'takeover of a live lease', (c) => drop(c, 'T04_TAKEOVER', 'LEASE_EXPIRED_DB_CLOCK'), /takeover without LEASE_EXPIRED_DB_CLOCK/],
  ['N39', 'cross-version processing allowed', (c) => { c.pipelineRetirement.crossVersionProcessingAllowed = true; }, /cross-version processing must be forbidden/],
  ['N40', 'wildcard allowlist entry enables all', (c) => { c.controlPlane.allowlists.organization.wildcard = 'ALL'; }, /wildcard must be forbidden/],
  ['N41', 'maintenance actor ignores kill switch', (c) => drop(c, 'T10_EXHAUST', 'CONTROL_PLANE_MAINTENANCE_ENABLED'), /T10_EXHAUST: REAPER transition not gated/],
  ['N42', 'contract version not bumped', (c) => { c.contractVersion = 'DI_V0_S4A_CONTRACT_V1'; }, /contractVersion must be DI_V0_S4A_CONTRACT_V2/],
  ['N43', 'migration not dormant (seeds rows)', (c) => { c.migration.effect = 'ACTIVATES'; c.migration.seedRows = 'KILL_ROW_NOT_KILLED'; }, /dormant-only|seed no rows/],
  ['N44', 'contract claims every boundary mutation re-arms the 24 h timer', (c) => { c.settlement.everyBoundaryMutationRearmsQuietTimer = true; }, /must not claim every boundary mutation re-arms/],
  ['N45', 'malformed allowlist entry ignored instead of failing closed', (c) => { c.controlPlane.allowlists.vehicle.malformedEntry = 'DROP_ENTRY'; }, /malformed vehicle allowlist must fail closed/],
  ['N46', 'frozen C1D.10A v1 contract under v2 invariants', 'V1', /required section missing/],
];

const POSITIVE_VARIANTS = [
  ['P01', 'canonical v2 contract', (c) => c],
  ['P02', 'top-level key order reversed', (c) => Object.fromEntries(Object.entries(c).reverse())],
  ['P03', 'stricter 36 h quiet period', (c) => { c.settlement.quietPeriodSeconds = 129600; return c; }],
  ['P04', 'longer 14 d drift horizon', (c) => { c.settlement.driftHorizonSeconds = 1209600; return c; }],
  ['P05', 'extra forbidden S2 component', (c) => { c.s2ExecutionIdentity.forbiddenComponents.push('requestId'); return c; }],
  ['P06', 'extra already-illegal pair listed', (c) => { c.mustBeIllegal.push('SKIPPED_INELIGIBLE->COMPLETED'); return c; }],
];

// User-named positive behaviors -> contract fixtures that must all PASS inside the validator.
const POSITIVE_SCENARIOS = [
  ['PRIMARY', ['ch:PRIMARY full channels', 'race:R02_TWO_REPLICAS_CLAIM', 'race:R05_HEARTBEAT_KEEPS_LEASE']],
  ['recalibration replay', ['race:R13_REPLAY_WHILE_PRIMARY_EXISTS', 'race:R22_REPLAY_INELIGIBLE_IS_TERMINAL_NOT_SKIPPED']],
  ['reacquisition', ['race:R12_CONCURRENT_REACQUISITION']],
  ['position-only degraded', ['ch:position-only degraded (R1 source failure)']],
  ['R1 enabled', ['ch:R1 enabled present']],
  ['R1 disabled', ['ch:R1 disabled', 'cp:R1 OFF keeps run executable']],
  ['native disabled', ['ch:native disabled']],
  ['native NOT_READY', ['ch:native NOT_READY']],
  ['native SOURCE_FAILURE', ['ch:native SOURCE_FAILURE']],
  ['mixed-version replica refusal', ['race:R15_MIXED_VERSION_CLAIM_REFUSED', 'race:R16_MIXED_VERSION_COMPLETE_REFUSED']],
  ['boundary supersession', ['race:R10_CONCURRENT_SUPERSESSION', 'race:R11_SUPERSEDE_DURING_LEASE', 'race:R24_HOLDER_SUPERSEDE_ON_BOUNDARY_CHANGE']],
  ['DB kill active', ['cp:DB kill active', 'race:R17_DB_KILL_BLOCKS_CLAIM_AND_COMPLETE']],
  ['env master OFF', ['cp:env master OFF', 'cp:DB NOT_KILLED cannot enable with env master OFF']],
  ['empty allowlist', ['cp:empty org allowlist', 'cp:empty vehicle allowlist', 'cp:both allowlists empty']],
  ['explicit allowed vehicle/org', ['cp:explicit allowed vehicle/org', 'cp:duplicate allowlist entries']],
];

let falseAccepts = 0;
let wrongReason = 0;
console.log('==> Negative contract suite');
for (const [id, name, mutate, expect, opts = {}] of NEGATIVE) {
  let c;
  if (mutate === 'V1') c = JSON.parse(fs.readFileSync(path.join(DESIGN_DIR, 's4a-contract.v1.json'), 'utf8'));
  else { c = clone(); if (mutate) mutate(c); }
  const { errors } = validateContract(c, { docs: opts.docs ?? docs });
  let verdict;
  if (!errors.length) { verdict = 'FALSE_ACCEPT'; falseAccepts += 1; }
  else if (!errors.some((e) => expect.test(e))) { verdict = `WRONG_REASON (${errors[0]})`; wrongReason += 1; }
  else verdict = 'REJECTED';
  console.log(`  ${id} ${verdict.padEnd(12)} ${name}`);
}

let falseRejects = 0;
console.log('==> Positive contract variants');
for (const [id, name, mutate] of POSITIVE_VARIANTS) {
  const c = mutate(clone());
  const { errors } = validateContract(c, { docs });
  if (errors.length) falseRejects += 1;
  console.log(`  ${id} ${errors.length ? `FALSE_REJECT (${errors[0]})` : 'ACCEPTED'.padEnd(12)} ${name}`);
}
console.log('==> Positive behavior scenarios');
const { results } = validateContract(clone(), { docs });
for (const [name, keys] of POSITIVE_SCENARIOS) {
  const missing = keys.filter((k) => results[k] !== 'PASS');
  if (missing.length) falseRejects += 1;
  console.log(`  ${missing.length ? `FALSE_REJECT (${missing.join(', ')})` : 'PASS'.padEnd(12)} ${name} [${keys.length} fixtures]`);
}

const negCount = NEGATIVE.length;
const posCount = POSITIVE_VARIANTS.length + POSITIVE_SCENARIOS.length;
console.log(`NEGATIVE_CONTRACT_CASES=${negCount}`);
console.log(`NEGATIVE_CONTRACT_FALSE_ACCEPT_COUNT=${falseAccepts + wrongReason} (false accepts ${falseAccepts}, wrong-reason rejections ${wrongReason})`);
console.log(`POSITIVE_CONTRACT_CASES=${posCount}`);
console.log(`POSITIVE_CONTRACT_FALSE_REJECT_COUNT=${falseRejects}`);
if (negCount < 22 || falseAccepts + wrongReason > 0 || falseRejects > 0) {
  console.error('==> S4A NEGATIVE CONTRACT SUITE FAILED');
  process.exit(1);
}
console.log('==> S4A negative contract suite passed');
