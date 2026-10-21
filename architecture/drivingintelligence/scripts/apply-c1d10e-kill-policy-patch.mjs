#!/usr/bin/env node
/**
 * One-shot contract patch for C1D.10E (P1-E kill write-set). Idempotent on v2 contract.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const contractPath = path.join(here, '..', 'design', 's4a', 's4a-contract.v2.json');
const c = JSON.parse(fs.readFileSync(contractPath, 'utf8'));

c.amendment =
  'EXP-021 C1D.10C (closes C1D.10B P1-A..P1-D); AMENDED BY C1D.10E (2026-09-27): exhaustive DB kill write-set — only T07 permitted while KILLED';

const KILL_GUARD = 'CONTROL_PLANE_DB_NOT_KILLED';
const ALLOWED_WHILE_KILLED = ['T07_FAIL_RETRYABLE'];

c.controlPlane.writesAllowedWhileKilled = ALLOWED_WHILE_KILLED;
delete c.controlPlane.writesAllowedWhileDisabled;

c.killPolicy = {
  killedWhen: ['DB_KILL_ACTIVE', 'DB_KILL_ROW_MISSING', 'DB_KILL_ROW_UNREADABLE', 'DB_KILL_ROW_MALFORMED'],
  writesAllowedWhileKilled: ALLOWED_WHILE_KILLED,
  t07SafeRelinquish: {
    transition: 'T07_FAIL_RETRYABLE',
    purpose: 'SAFE_LEASE_RELEASE_WITHOUT_ADVANCING_WORK',
    effects: ['CLEAR_LEASE_COLUMNS', 'SET_STATUS_FAILED_RETRYABLE', 'SCHEDULE_RETRY_BACKOFF'],
    forbiddenEffects: [
      'LEASE_EXTEND',
      'CLAIM_OR_TAKEOVER',
      'PIN_OR_EVIDENCE_WRITE',
      'S2_RUN_OR_INTERVAL_WRITE',
      'COMPLETED',
      'FAILED_TERMINAL',
      'SKIPPED_INELIGIBLE',
      'SUPERSEDED',
      'SUCCESSOR_PRIMARY_CREATE',
      'PROVIDER_ACQUISITION',
      'PIPELINE_VERSION_REGISTRY_MUTATION',
    ],
  },
  serialization: {
    killCheckSameTxAsAuthoritativeWrite: true,
    controlRowLock: "SELECT kill_state FROM di_v0_s4_control WHERE id = 'GLOBAL' FOR UPDATE",
    holderTransitionOrder: [
      'BEGIN',
      'LOCK work_item row FOR UPDATE',
      'READ/LOCK di_v0_s4_control FOR UPDATE',
      'PROVE kill_state = NOT_KILLED unless transition ∈ writesAllowedWhileKilled',
      'VERIFY lease epoch/fence',
      'AUTHORITATIVE mutation',
      'COMMIT',
    ],
    operatorKillUpdateSerializesAgainst:
      'Operator UPDATE di_v0_s4_control must take FOR UPDATE on the control row in a transaction that blocks until in-flight holder transitions finish or abort',
  },
};

const transitionMeta = {
  T01_CREATE: { owner: 'DISCOVERY', lease: 'NONE', s2: false, evidence: false },
  T02_CLAIM: { owner: 'WORKER', lease: 'SET', s2: false, evidence: false },
  T03_HEARTBEAT: { owner: 'LEASE_HOLDER', lease: 'EXTEND', s2: false, evidence: false },
  T04_TAKEOVER: { owner: 'WORKER', lease: 'SET', s2: false, evidence: false },
  T05_PIN: { owner: 'LEASE_HOLDER', lease: 'KEEP', s2: false, evidence: true },
  T06_COMPLETE: { owner: 'LEASE_HOLDER', lease: 'CLEAR', s2: true, evidence: false },
  T07_FAIL_RETRYABLE: { owner: 'LEASE_HOLDER', lease: 'CLEAR', s2: false, evidence: false },
  T08_FAIL_TERMINAL: { owner: 'LEASE_HOLDER', lease: 'CLEAR', s2: false, evidence: false },
  T09_SKIP_INELIGIBLE: { owner: 'LEASE_HOLDER', lease: 'CLEAR', s2: false, evidence: false },
  T10_EXHAUST: { owner: 'REAPER', lease: 'CLEAR', s2: false, evidence: false },
  T11_SUPERSEDE: { owner: 'DRIFT_WATCHER', lease: 'VARIES', s2: false, evidence: false },
  T12_RETIRE: { owner: 'RETIREMENT_REAPER', lease: 'VARIES', s2: false, evidence: false },
  T13_HOLDER_SUPERSEDE: { owner: 'LEASE_HOLDER', lease: 'CLEAR', s2: false, evidence: false },
};

for (const t of c.transitions) {
  if (!ALLOWED_WHILE_KILLED.includes(t.id) && !t.guards.includes(KILL_GUARD)) {
    t.guards.push(KILL_GUARD);
  }
  if (ALLOWED_WHILE_KILLED.includes(t.id)) {
    t.guards = t.guards.filter((g) => g !== KILL_GUARD);
  }
}

const authoritativeWrites = [
  {
    writeId: 'W_T01_WORK_ITEM_INSERT',
    owner: 'DISCOVERY',
    transitionId: 'T01_CREATE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: false,
    requiresFence: false,
    requiresPipelineVersionMatch: true,
    allowedWhileKilled: false,
    rationale: 'Discovery creates PENDING work items only when S4 is not killed',
  },
  {
    writeId: 'W_T02_CLAIM',
    owner: 'WORKER',
    transitionId: 'T02_CLAIM',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: false,
    requiresFence: false,
    requiresPipelineVersionMatch: true,
    allowedWhileKilled: false,
    rationale: 'Claim acquires lease; forbidden while killed',
  },
  {
    writeId: 'W_T03_HEARTBEAT',
    owner: 'LEASE_HOLDER',
    transitionId: 'T03_HEARTBEAT',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: false,
    rationale: 'Heartbeat extends lease; forbidden while killed',
  },
  {
    writeId: 'W_T04_TAKEOVER',
    owner: 'WORKER',
    transitionId: 'T04_TAKEOVER',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: false,
    requiresFence: false,
    requiresPipelineVersionMatch: true,
    allowedWhileKilled: false,
    rationale: 'Takeover reclaims expired lease; forbidden while killed',
  },
  {
    writeId: 'W_T05_PIN_EVIDENCE_REF',
    owner: 'LEASE_HOLDER',
    transitionId: 'T05_PIN',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: false,
    rationale: 'Pins evidence snapshot hash on work item; forbidden while killed',
  },
  {
    writeId: 'W_T06_COMPLETE_WITH_S2',
    owner: 'LEASE_HOLDER',
    transitionId: 'T06_COMPLETE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: true,
    allowedWhileKilled: false,
    rationale: 'Completes work and persists S2 in same tx; forbidden while killed',
  },
  {
    writeId: 'W_T07_SAFE_RELINQUISH',
    owner: 'LEASE_HOLDER',
    transitionId: 'T07_FAIL_RETRYABLE',
    requiresActiveMaster: false,
    requiresDbNotKilled: false,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: true,
    rationale: 'Only permitted authoritative mutation while killed: release lease to FAILED_RETRYABLE without persisting results',
  },
  {
    writeId: 'W_T08_FAIL_TERMINAL',
    owner: 'LEASE_HOLDER',
    transitionId: 'T08_FAIL_TERMINAL',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: false,
    rationale: 'Terminal failure; forbidden while killed',
  },
  {
    writeId: 'W_T09_SKIP_INELIGIBLE',
    owner: 'LEASE_HOLDER',
    transitionId: 'T09_SKIP_INELIGIBLE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: false,
    rationale: 'Skip ineligible; forbidden while killed (replay uses T08)',
  },
  {
    writeId: 'W_T10_EXHAUST',
    owner: 'REAPER',
    transitionId: 'T10_EXHAUST',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: false,
    requiresFence: false,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: false,
    rationale: 'Maintenance reaper; forbidden while killed',
  },
  {
    writeId: 'W_T11_SUPERSEDE',
    owner: 'DRIFT_WATCHER',
    transitionId: 'T11_SUPERSEDE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: false,
    requiresFence: false,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: false,
    rationale: 'Drift supersession; forbidden while killed',
  },
  {
    writeId: 'W_T12_RETIRE',
    owner: 'RETIREMENT_REAPER',
    transitionId: 'T12_RETIRE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: false,
    requiresFence: false,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: false,
    rationale: 'Pipeline retirement; forbidden while killed',
  },
  {
    writeId: 'W_T13_HOLDER_SUPERSEDE',
    owner: 'LEASE_HOLDER',
    transitionId: 'T13_HOLDER_SUPERSEDE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: false,
    rationale: 'Holder-initiated supersession on boundary change; forbidden while killed',
  },
  {
    writeId: 'W_EVIDENCE_SNAPSHOT_INSERT',
    owner: 'LEASE_HOLDER',
    transitionId: null,
    boundTo: 'T05_PIN',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: false,
    rationale: 'Content-addressed snapshot row insert occurs inside T05 gated transaction',
  },
  {
    writeId: 'W_S2_RUN_INSERT',
    owner: 'LEASE_HOLDER',
    transitionId: null,
    boundTo: 'T06_COMPLETE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: true,
    allowedWhileKilled: false,
    rationale: 'S2 run insert is part of T06 same-tx guard S2_WRITTEN_SAME_TX',
  },
  {
    writeId: 'W_S2_INTERVAL_INSERT',
    owner: 'LEASE_HOLDER',
    transitionId: null,
    boundTo: 'T06_COMPLETE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: true,
    requiresFence: true,
    requiresPipelineVersionMatch: true,
    allowedWhileKilled: false,
    rationale: 'S2 interval rows written in T06 transaction',
  },
  {
    writeId: 'W_PIPELINE_REGISTRY_UPSERT',
    owner: 'DISCOVERY',
    transitionId: null,
    boundTo: 'T01_CREATE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: false,
    requiresFence: false,
    requiresPipelineVersionMatch: true,
    allowedWhileKilled: false,
    rationale: 'ACTIVE pipeline version upsert before discovery insert',
  },
  {
    writeId: 'W_SUCCESSOR_PRIMARY_INSERT',
    owner: 'DRIFT_WATCHER',
    transitionId: null,
    boundTo: 'T11_SUPERSEDE',
    requiresActiveMaster: true,
    requiresDbNotKilled: true,
    requiresValidLease: false,
    requiresFence: false,
    requiresPipelineVersionMatch: true,
    allowedWhileKilled: false,
    rationale: 'Successor PRIMARY row created in supersession transaction',
  },
  {
    writeId: 'W_CONTROL_ROW_OPERATOR_UPDATE',
    owner: 'OPERATOR',
    transitionId: null,
    requiresActiveMaster: false,
    requiresDbNotKilled: false,
    requiresValidLease: false,
    requiresFence: false,
    requiresPipelineVersionMatch: false,
    allowedWhileKilled: true,
    rationale: 'Operator-only kill/disable path; never enables S4 when env is OFF (dbCanEnable=false)',
  },
];

c.authoritativeWrites = authoritativeWrites;

const killRaces = [
  { id: 'K01', steps: [['kill', 'op'], ['create', 'd1', 'PRIMARY']], expect: { status: undefined, rejected: ['d1:create'], itemCount: 0 } },
  { id: 'K02', steps: [['create', 'd1', 'PRIMARY'], ['kill', 'op'], ['claim', 'w1']], expect: { status: 'PENDING', rejected: ['w1:claim'] } },
  { id: 'K03', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['kill', 'op'], ['heartbeat', 'w1']], expect: { status: 'LEASED', leaseOwner: 'w1', rejected: ['w1:heartbeat'] } },
  { id: 'K04', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['kill', 'op'], ['advance', 10], ['heartbeat', 'w1']], expect: { status: 'LEASED', rejected: ['w1:heartbeat'] } },
  { id: 'K05', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['kill', 'op'], ['pin', 'w1', 'snap-A']], expect: { status: 'LEASED', rejected: ['w1:pin'] } },
  { id: 'K06', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['pin', 'w1', 'snap-A'], ['kill', 'op'], ['complete', 'w1', 'run-1']], expect: { status: 'LEASED', rejected: ['w1:complete'] } },
  { id: 'K07', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['pin', 'w1', 'snap-A'], ['kill', 'op'], ['complete', 'w1', 'run-1']], expect: { status: 'LEASED', rejected: ['w1:complete'], s2WritesCommitted: [] } },
  { id: 'K08', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['pin', 'w1', 'snap-A'], ['kill', 'op'], ['s2Preexisting', 'conflict'], ['complete', 'w1', 'run-1']], expect: { status: 'LEASED', rejected: ['w1:complete'] } },
  { id: 'K09', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['pin', 'w1', 'snap-A'], ['kill', 'op'], ['complete', 'w1', 'run-1']], expect: { status: 'LEASED', rejected: ['w1:complete'] } },
  { id: 'K10', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['kill', 'op'], ['failRetryable', 'w1']], expect: { status: 'FAILED_RETRYABLE', rejected: [] } },
  { id: 'K11', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['kill', 'op'], ['failTerminal', 'w1', 'X']], expect: { status: 'LEASED', rejected: ['w1:failTerminal'] } },
  { id: 'K12', steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['kill', 'op'], ['skip', 'w1']], expect: { status: 'LEASED', rejected: ['w1:skip'] } },
  { id: 'K13', steps: [['create', 'd1', 'PRIMARY'], ['kill', 'op'], ['supersede', 'watcher', 'fp-2']], expect: { activePrimaryCount: 1, rejected: ['watcher:supersede'] } },
  { id: 'K14', steps: [['create', 'd1', 'PRIMARY'], ['kill', 'op'], ['tripChange', null, 'fp-2'], ['supersede', 'watcher', 'fp-2']], expect: { rejected: ['watcher:supersede'] } },
  { id: 'K15', steps: [['setKillMissing'], ['create', 'd1', 'PRIMARY']], expect: { rejected: ['d1:create'], itemCount: 0 } },
  { id: 'K16', steps: [['setKillMalformed'], ['create', 'd1', 'PRIMARY']], expect: { rejected: ['d1:create'], itemCount: 0 } },
  { id: 'K17', steps: [['create', 'd1', 'PRIMARY'], ['setKillReadError'], ['claim', 'w1']], expect: { status: 'PENDING', rejected: ['w1:claim'] } },
  {
    id: 'K18',
    steps: [['create', 'd1', 'PRIMARY'], ['claim', 'w1'], ['kill', 'op'], ['failRetryable', 'w1'], ['heartbeat', 'w1'], ['claim', 'w2']],
    expect: { status: 'FAILED_RETRYABLE', leaseOwner: null, rejected: ['w1:heartbeat', 'w2:claim'] },
  },
];

c.fixtures.killRaces = killRaces;
c.fixtures.requiredRaceIds = c.fixtures.races.map((r) => r.id);
c.fixtures.requiredKillRaceIds = killRaces.map((r) => r.id);

// Fix R17: T07 allowed after kill
const r17 = c.fixtures.races.find((r) => r.id === 'R17_DB_KILL_BLOCKS_CLAIM_AND_COMPLETE');
if (r17) {
  r17.expect.rejected = ['w1:complete', 'w2:claim'];
}

fs.writeFileSync(contractPath, `${JSON.stringify(c, null, 2)}\n`);
console.log('Patched', contractPath, 'transitions', c.transitions.length, 'authWrites', authoritativeWrites.length, 'killRaces', killRaces.length);
