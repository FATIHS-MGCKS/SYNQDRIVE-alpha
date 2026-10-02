import * as fs from 'fs';
import * as path from 'path';
import {
  DI_V0_S4A_CONTRACT_VERSION,
  DI_V0_S4_AUTHORITATIVE_WRITES,
  DI_V0_S4_CHANNEL_OUTCOMES,
  DI_V0_S4_CHANNEL_RULES,
  DI_V0_S4_HASH_FORBIDDEN_FIELDS,
  DI_V0_S4_KILL_GUARD,
  DI_V0_S4_LIMITS,
  DI_V0_S4_PIPELINE_KEY_PREFIX,
  DI_V0_S4_PIPELINE_MANIFEST_KEYS,
  DI_V0_S4_REPOSITORY_WRITE_MAP,
  DI_V0_S4_RUN_PURPOSES,
  DI_V0_S4_STATES,
  DI_V0_S4_SUPERSEDED_REASONS,
  DI_V0_S4_TRANSITIONS,
  DI_V0_S4_WRITES_ALLOWED_WHILE_KILLED,
  DI_V0_S4_BOUNDARY_FP_VERSION,
  DI_V0_S4_EXECUTION_IDENTITY_V1_VERSION,
  DI_V0_S4_EXECUTION_IDENTITY_V2_VERSION,
  DI_V0_S4_EXECUTION_IDENTITY_VERSION,
  DI_V0_COMBINED_INPUT_IDENTITY_V0_3,
} from '../di-v0-s4a-contract';
import { DI_V0_S4_ENV_ALLOWLISTS, DI_V0_S4_ENV_FLAGS } from '../di-v0-s4a-control-plane';
import { DiV0S4WorkItemRepository } from '../di-v0-s4a-work-item.repository';

/** Public repository APIs that perform reads only (must not appear in DI_V0_S4_REPOSITORY_WRITE_MAP). */
const PUBLIC_READ_ONLY_REPOSITORY_METHODS = [
  'evaluateAttemptStartBoundary',
  'readExecutionPostcondition',
  'readReplayRoutingContext',
  'readVerifiedPinnedEvidence',
] as const;

const REPOSITORY_SOURCE = fs.readFileSync(
  path.join(__dirname, '../di-v0-s4a-work-item.repository.ts'),
  'utf8',
);

const AUTHORITATIVE_MUTATION_PATTERN =
  /\b(INSERT|UPDATE|DELETE|UPSERT)\b|\.executeRaw\s*\(|\.(create|update|delete|upsert)\s*\(/i;

const CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../../../../..', 'architecture/drivingintelligence/design/s4a/s4a-contract.v2.json'),
    'utf8',
  ),
);

describe('DI V0 S4A contract parity (TS mirror == s4a-contract.v2.json)', () => {
  it('contract and identity versions', () => {
    expect(CONTRACT.contractVersion).toBe(DI_V0_S4A_CONTRACT_VERSION);
    expect(CONTRACT.pipelineVersion.prefix).toBe(DI_V0_S4_PIPELINE_KEY_PREFIX);
    expect(CONTRACT.boundaryFingerprint.version).toBe(DI_V0_S4_BOUNDARY_FP_VERSION);
    expect(CONTRACT.s2ExecutionIdentity.version).toBe(DI_V0_S4_EXECUTION_IDENTITY_V1_VERSION);
    expect(CONTRACT.s2ExecutionIdentityImplementationTarget.version).toBe(DI_V0_S4_EXECUTION_IDENTITY_V2_VERSION);
    expect(DI_V0_S4_EXECUTION_IDENTITY_VERSION).toBe(DI_V0_S4_EXECUTION_IDENTITY_V2_VERSION);
    expect(CONTRACT.combinedInputIdentity.version).toBe(DI_V0_COMBINED_INPUT_IDENTITY_V0_3);
  });

  it('limits and settlement timing', () => {
    for (const [key, value] of Object.entries(CONTRACT.limits)) {
      expect({ key, value: (DI_V0_S4_LIMITS as Record<string, unknown>)[key] }).toEqual({ key, value });
    }
    expect(DI_V0_S4_LIMITS.settlementQuietPeriodSeconds).toBe(CONTRACT.settlement.quietPeriodSeconds);
    expect(DI_V0_S4_LIMITS.driftHorizonSeconds).toBe(CONTRACT.settlement.driftHorizonSeconds);
  });

  it('states, run purposes and supersession reasons', () => {
    expect([...DI_V0_S4_STATES].sort()).toEqual(Object.keys(CONTRACT.states).sort());
    expect(Object.entries(CONTRACT.states).filter(([, v]) => (v as { terminal: boolean }).terminal).map(([k]) => k)).toEqual(['SUPERSEDED']);
    expect([...DI_V0_S4_RUN_PURPOSES].sort()).toEqual(Object.keys(CONTRACT.runPurposes).sort());
    expect(DI_V0_S4_SUPERSEDED_REASONS).toContain(CONTRACT.pipelineRetirement.supersededReason);
  });

  it('transitions are an exact mirror', () => {
    const mirror = DI_V0_S4_TRANSITIONS.map((t) => ({ ...t, from: [...t.from], guards: [...t.guards] }));
    const contract = CONTRACT.transitions.map((t: Record<string, unknown>) => ({
      id: t.id,
      from: t.from,
      to: t.to,
      actor: t.actor,
      leaseEpoch: t.leaseEpoch,
      attemptCount: t.attemptCount,
      lease: t.lease,
      guards: t.guards,
    }));
    expect(mirror).toEqual(contract);
  });

  it('kill policy: only T07 writes while killed; every other transition carries the kill guard', () => {
    expect([...DI_V0_S4_WRITES_ALLOWED_WHILE_KILLED]).toEqual(CONTRACT.killPolicy.writesAllowedWhileKilled);
    expect([...DI_V0_S4_WRITES_ALLOWED_WHILE_KILLED]).toEqual(CONTRACT.controlPlane.writesAllowedWhileKilled);
    for (const t of DI_V0_S4_TRANSITIONS) {
      expect({ id: t.id, guarded: t.guards.includes(DI_V0_S4_KILL_GUARD) }).toEqual({
        id: t.id,
        guarded: !DI_V0_S4_WRITES_ALLOWED_WHILE_KILLED.includes(t.id),
      });
    }
  });

  it('authoritative write registry is an exact mirror (19 classes)', () => {
    const fields = [
      'writeId',
      'transitionId',
      'boundTo',
      'requiresActiveMaster',
      'requiresDbNotKilled',
      'requiresValidLease',
      'requiresFence',
      'requiresPipelineVersionMatch',
      'allowedWhileKilled',
    ] as const;
    const pick = (w: Record<string, unknown>) => Object.fromEntries(fields.map((f) => [f, w[f] ?? null]));
    expect(DI_V0_S4_AUTHORITATIVE_WRITES.map((w) => pick(w as unknown as Record<string, unknown>))).toEqual(
      CONTRACT.authoritativeWrites.map(pick),
    );
    expect(DI_V0_S4_AUTHORITATIVE_WRITES).toHaveLength(19);
  });

  it('every repository write method maps to registered writes and covers every code-path write class', () => {
    const registered = new Set(DI_V0_S4_AUTHORITATIVE_WRITES.map((w) => w.writeId));
    const mapped = new Set<string>();
    for (const writes of Object.values(DI_V0_S4_REPOSITORY_WRITE_MAP)) {
      for (const w of writes) {
        expect(registered.has(w)).toBe(true);
        mapped.add(w);
      }
    }
    const codePath = [...registered].filter((w) => w !== 'W_CONTROL_ROW_OPERATOR_UPDATE').sort();
    expect([...mapped].sort()).toEqual(codePath);
    expect(mapped.has('W_CONTROL_ROW_OPERATOR_UPDATE')).toBe(false);

    const writeMapMethods = Object.keys(DI_V0_S4_REPOSITORY_WRITE_MAP);
    const readOnlyMethods = [...PUBLIC_READ_ONLY_REPOSITORY_METHODS];
    expect(readOnlyMethods).toHaveLength(4);

    for (const m of readOnlyMethods) {
      expect(writeMapMethods).not.toContain(m);
    }

    const methods = Object.getOwnPropertyNames(DiV0S4WorkItemRepository.prototype).filter(
      (m) => m !== 'constructor' && !isPrivateHelper(m),
    );
    const classified = new Set([...writeMapMethods, ...readOnlyMethods]);
    const unclassified = methods.filter((m) => !classified.has(m));
    expect(unclassified).toEqual([]);

    expect(methods.sort()).toEqual([...classified].sort());
    expect(methods.some((m) => /status/i.test(m))).toBe(false);
  });

  it('read-only repository helpers perform no authoritative mutations', () => {
    const evaluateWrites = countAuthoritativeMutationsInMethod('evaluateAttemptStartBoundary');
    const postconditionWrites = countAuthoritativeMutationsInMethod('readExecutionPostcondition');
    const replayRoutingWrites = countAuthoritativeMutationsInMethod('readReplayRoutingContext');
    const verifiedPinWrites = countAuthoritativeMutationsInMethod('readVerifiedPinnedEvidence');
    expect(evaluateWrites).toBe(0);
    expect(postconditionWrites).toBe(0);
    expect(replayRoutingWrites).toBe(0);
    expect(verifiedPinWrites).toBe(0);
  });

  it('control plane flag and allowlist names', () => {
    expect(Object.values(DI_V0_S4_ENV_FLAGS).sort()).toEqual(Object.keys(CONTRACT.controlPlane.flags).sort());
    expect(DI_V0_S4_ENV_ALLOWLISTS.organization).toBe(CONTRACT.controlPlane.allowlists.organization.env);
    expect(DI_V0_S4_ENV_ALLOWLISTS.vehicle).toBe(CONTRACT.controlPlane.allowlists.vehicle.env);
    for (const flag of Object.values(CONTRACT.controlPlane.flags) as Array<{ default: boolean }>) expect(flag.default).toBe(false);
  });

  it('pipeline manifest keys, channel outcomes, channel rules and hash exclusions', () => {
    expect([...DI_V0_S4_PIPELINE_MANIFEST_KEYS]).toEqual(CONTRACT.pipelineVersion.requiredKeys);
    expect(DI_V0_S4_CHANNEL_OUTCOMES).toEqual(CONTRACT.channelOutcomes);
    const { channelEvidenceHashPattern, ...rules } = DI_V0_S4_CHANNEL_RULES;
    const { channelPolicyV1NativeReadinessAuthority, ...contractRules } = CONTRACT.channelRules;
    expect(channelPolicyV1NativeReadinessAuthority).toBe('NONE');
    expect(rules).toEqual(contractRules);
    expect(channelEvidenceHashPattern.source).toBe(CONTRACT.combinedInputIdentity.channelEvidenceHashPattern);
    expect([...DI_V0_S4_HASH_FORBIDDEN_FIELDS]).toEqual(CONTRACT.identity.excludedFromEveryHash);
  });
});

const PRIVATE_HELPERS = new Set([
  'inTx',
  'resolvePurpose',
  'runtimePipelineKey',
  'requireNotKilled',
  'requireRegistryStatus',
  'requireEnabled',
  'enablement',
  'rowEnablement',
  'rowColumns',
  'lockRow',
  'requireHolder',
  'holderPredicate',
  'readTripScope',
  'fingerprintOf',
  'settlementAnchorSql',
  'requireReasonMatchesTrip',
  'successorIdIfEligible',
  'allocatePrimaryBoundaryOccurrence',
  'loadPinnedSnapshotPins',
  'lockPipelineRegistryForUpdate',
  'selectRetirablePipelineWorkItemsForUpdate',
  'supersedePipelineRetirementWorkItems',
]);

function isPrivateHelper(name: string): boolean {
  return PRIVATE_HELPERS.has(name);
}

function extractMethodSource(methodName: string): string {
  const marker = `async ${methodName}(`;
  const start = REPOSITORY_SOURCE.indexOf(marker);
  if (start < 0) {
    throw new Error(`method not found in repository source: ${methodName}`);
  }
  const braceStart = REPOSITORY_SOURCE.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < REPOSITORY_SOURCE.length; i++) {
    const ch = REPOSITORY_SOURCE[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return REPOSITORY_SOURCE.slice(braceStart, i + 1);
    }
  }
  throw new Error(`unbalanced braces for method: ${methodName}`);
}

function countAuthoritativeMutationsInMethod(methodName: string): number {
  const body = extractMethodSource(methodName);
  const matches = body.match(new RegExp(AUTHORITATIVE_MUTATION_PATTERN.source, 'gi'));
  return matches?.length ?? 0;
}
