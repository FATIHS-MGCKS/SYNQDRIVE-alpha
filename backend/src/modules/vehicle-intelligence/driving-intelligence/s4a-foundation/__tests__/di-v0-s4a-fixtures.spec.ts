import * as fs from 'fs';
import * as path from 'path';
import { DI_V0_S4_STATES, DI_V0_S4_TRANSITIONS, type DiV0S4FromState, type DiV0S4State } from '../di-v0-s4a-contract';
import {
  DI_V0_S4_CONTROL_PLANE_ALL_OFF,
  evaluateDiV0S4Enablement,
  evaluateDiV0S4KillRow,
  evaluateDiV0S4MaintenanceEnablement,
  parseDiV0S4Allowlist,
  parseDiV0S4BooleanFlag,
  parseDiV0S4ControlPlaneConfig,
  type DiV0S4KillRowObservation,
} from '../di-v0-s4a-control-plane';
import { isDiV0S4Rejection } from '../di-v0-s4a-errors';
import {
  assertDiV0S4ExecutionIdentityConsistency,
  assertDiV0S4PipelineManifest,
  assertDiV0S4RuntimePipelineManifest,
  buildDiV0CombinedInputIdentityV03,
  buildDiV0S4BoundaryFingerprint,
  buildDiV0S4ExecutionIdentity,
  buildDiV0S4PipelineVersionKey,
  deriveDiV0S4ChannelEnablement,
  evaluateDiV0S4ChannelRun,
  pinsFromDiV0S4ChannelManifest,
  serializeDiV0S4EvidenceContainer,
  validateDiV0S4ChannelPin,
  type DiV0S4BoundaryInput,
  type DiV0S4ChannelPins,
  type DiV0S4EvidenceChannelInput,
  type DiV0S4ExecutionIdentityInput,
} from '../di-v0-s4a-identity';
import { assertDiV0S4TransitionFrom, isDiV0S4LegalStatePair, listDiV0S4LegalStatePairs } from '../di-v0-s4a-state-machine';

const CONTRACT = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '../../../../../../..', 'architecture/drivingintelligence/design/s4a/s4a-contract.v2.json'),
    'utf8',
  ),
);
const F = CONTRACT.fixtures;

const toBoundary = (b: Record<string, unknown>): DiV0S4BoundaryInput => ({
  organizationId: b.organizationId as string,
  vehicleId: b.vehicleId as string,
  tripId: b.tripId as string,
  tripStatus: b.tripStatus as string,
  startTime: new Date(b.startTime as string),
  endTime: b.endTime == null ? null : new Date(b.endTime as string),
  dimoSegmentId: (b.dimoSegmentId as string | null) ?? null,
  mergeParentTripId: (b.mergeParentTripId as string | null) ?? null,
  boundaryRepairGeneration: (b.boundaryRepairGeneration as string | null) ?? null,
});

const CHANNEL_RUN_BASE_PINS: DiV0S4ChannelPins = {
  POSITION: ['PRESENT', null, 'DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1:sha256:11', null],
  R1_OBD: ['PRESENT', null, 'DI_V0_R1_OBD_EVIDENCE_SNAPSHOT_V0_3:sha256:22', null],
  NATIVE_EVENT: ['DISABLED', 'FLAG_OFF', null, null],
};

const flagsOf = (flags: { R1_OBD: boolean; NATIVE_EVENT: boolean }) => ({
  r1Enabled: flags.R1_OBD,
  nativeEnabled: flags.NATIVE_EVENT,
});

describe('DI V0 S4A state machine', () => {
  const froms: DiV0S4FromState[] = ['NONE', ...DI_V0_S4_STATES];
  const allPairs = froms.flatMap((from) => DI_V0_S4_STATES.map((to) => [from, to] as [DiV0S4FromState, DiV0S4State]));

  it('has 14 legal and 42 illegal state pairs', () => {
    expect(allPairs).toHaveLength(56);
    expect(listDiV0S4LegalStatePairs()).toHaveLength(14);
    expect(allPairs.filter(([f, t]) => !isDiV0S4LegalStatePair(f, t))).toHaveLength(42);
  });

  it('rejects every mustBeIllegal pair', () => {
    for (const pair of CONTRACT.mustBeIllegal as string[]) {
      const [from, to] = pair.split('->') as [DiV0S4FromState, DiV0S4State];
      expect({ pair, legal: isDiV0S4LegalStatePair(from, to) }).toEqual({ pair, legal: false });
    }
  });

  it('SUPERSEDED is the only lifecycle-terminal state (no outgoing transition)', () => {
    const withOutgoing = new Set(DI_V0_S4_TRANSITIONS.flatMap((t) => t.from));
    expect(DI_V0_S4_STATES.filter((s) => !withOutgoing.has(s))).toEqual(['SUPERSEDED']);
  });

  it('assertDiV0S4TransitionFrom accepts exactly the declared sources', () => {
    for (const t of DI_V0_S4_TRANSITIONS) {
      for (const from of DI_V0_S4_STATES) {
        if ((t.from as readonly string[]).includes(from)) {
          expect(assertDiV0S4TransitionFrom(t.id, from).to).toBe(t.to);
        } else {
          let error: unknown;
          try {
            assertDiV0S4TransitionFrom(t.id, from);
          } catch (e) {
            error = e;
          }
          expect(isDiV0S4Rejection(error, 'ILLEGAL_SOURCE_STATE')).toBe(true);
        }
      }
      expect(() => assertDiV0S4TransitionFrom(t.id, 'NOT_A_STATE')).toThrow(/ILLEGAL_SOURCE_STATE/);
    }
  });
});

describe('DI V0 S4A pipeline version identity (fixtures)', () => {
  it('reproduces pipelineVersionExpectedKey and is key-order independent', () => {
    const base = F.pipelineVersionBase;
    expect(buildDiV0S4PipelineVersionKey(base)).toBe(F.pipelineVersionExpectedKey);
    const reversed = Object.fromEntries(Object.entries(base).reverse());
    expect(buildDiV0S4PipelineVersionKey(reversed as typeof base)).toBe(F.pipelineVersionExpectedKey);
  });

  it.each(F.pipelineVersionMutations.map((m: { name: string }) => [m.name, m]))('mutation %s', (_name, m) => {
    const mutated = { ...F.pipelineVersionBase, ...(m as { set: object }).set };
    const same = buildDiV0S4PipelineVersionKey(mutated) === F.pipelineVersionExpectedKey;
    expect(same).toBe((m as { expect: string }).expect === 'EQUAL');
  });

  it.each((F.pipelineVersionForbiddenKeys as string[]).map((k) => [k]))('refuses forbidden key %s', (key) => {
    expect(() => buildDiV0S4PipelineVersionKey({ ...F.pipelineVersionBase, [key]: 'x' })).toThrow(/20 required pipeline keys/);
  });

  it('refuses a missing key and an empty value', () => {
    const { calibrationVersion: _omit, ...missing } = F.pipelineVersionBase;
    expect(() => assertDiV0S4PipelineManifest(missing)).toThrow();
    expect(() => assertDiV0S4PipelineManifest({ ...F.pipelineVersionBase, estimatorVersion: '' })).toThrow();
    expect(() => assertDiV0S4PipelineManifest(null)).toThrow();
    expect(() => assertDiV0S4PipelineManifest([])).toThrow();
  });

  it('runtime manifest check binds channel flags and contract-owned versions', () => {
    const base = F.pipelineVersionBase;
    expect(deriveDiV0S4ChannelEnablement({ r1Enabled: true, nativeEnabled: true })).toBe(base.channelEnablement);
    expect(() => assertDiV0S4RuntimePipelineManifest(base, { r1Enabled: true, nativeEnabled: true })).not.toThrow();
    expect(() => assertDiV0S4RuntimePipelineManifest(base, { r1Enabled: true, nativeEnabled: false })).toThrow(/channelEnablement/);
    for (const key of [
      's4OrchestrationContractVersion',
      'combinedInputIdentityVersion',
      'boundaryFingerprintVersion',
      'channelPolicyVersion',
    ]) {
      expect(() =>
        assertDiV0S4RuntimePipelineManifest({ ...base, [key]: 'OTHER_V9' }, { r1Enabled: true, nativeEnabled: true }),
      ).toThrow(new RegExp(key));
    }
    expect(() =>
      assertDiV0S4RuntimePipelineManifest(
        { ...base, evidenceSnapshotContainerVersion: 'ANY_V1' },
        { r1Enabled: true, nativeEnabled: true },
      ),
    ).not.toThrow();
  });
});

describe('DI V0 S4A boundary fingerprint (fixtures)', () => {
  it('reproduces boundaryExpectedFingerprint', () => {
    expect(buildDiV0S4BoundaryFingerprint(toBoundary(F.boundaryBase))).toBe(F.boundaryExpectedFingerprint);
  });

  it.each(F.boundaryMutations.map((m: { name: string }) => [m.name, m]))('mutation %s', (_name, m) => {
    const fp = buildDiV0S4BoundaryFingerprint(toBoundary({ ...F.boundaryBase, ...(m as { set: object }).set }));
    expect(fp === F.boundaryExpectedFingerprint).toBe((m as { expect: string }).expect === 'EQUAL');
  });
});

describe('DI V0 S4A channel model and combined input identity V0_3 (fixtures)', () => {
  it.each(F.combinedIdentityCases.map((c: { name: string }) => [c.name, c]))('case %s', (_name, c) => {
    const cs = c as { a: object; b: object; expect: string };
    const a = buildDiV0CombinedInputIdentityV03({ ...F.combinedIdentityBase, ...cs.a });
    const b = buildDiV0CombinedInputIdentityV03({ ...F.combinedIdentityBase, ...cs.b });
    expect(a === b).toBe(cs.expect === 'EQUAL');
  });

  it.each(F.invalidChannelPins.map((c: { name: string }) => [c.name, c]))('rejects invalid pin: %s', (_name, c) => {
    const inv = c as { channel: 'NATIVE_EVENT' | 'POSITION' | 'R1_OBD'; pin: [string, null, string, null] };
    expect(validateDiV0S4ChannelPin(inv.channel, inv.pin)).not.toBeNull();
    expect(() => buildDiV0CombinedInputIdentityV03({ ...F.combinedIdentityBase, [inv.channel]: inv.pin })).toThrow();
  });

  it('refuses a missing channel', () => {
    const { R1_OBD: _omit, ...missing } = F.combinedIdentityBase;
    expect(() => buildDiV0CombinedInputIdentityV03(missing as DiV0S4ChannelPins)).toThrow(/missing channel R1_OBD/);
  });

  it.each(F.channelRunScenarios.map((s: { name: string }) => [s.name, s]))('channel run scenario %s', (_name, s) => {
    const sc = s as { flags: { R1_OBD: boolean; NATIVE_EVENT: boolean }; pins: Partial<DiV0S4ChannelPins>; expect: string };
    expect(evaluateDiV0S4ChannelRun(flagsOf(sc.flags), { ...CHANNEL_RUN_BASE_PINS, ...sc.pins })).toBe(sc.expect);
  });

  describe('channel policy V1 source-family applicability', () => {
    const r1NotApplicable: DiV0S4ChannelPins = {
      ...CHANNEL_RUN_BASE_PINS,
      R1_OBD: ['NOT_APPLICABLE', 'FAMILY_NOT_APPLICABLE', null, null],
    };
    const nativeNotApplicable: DiV0S4ChannelPins = {
      ...CHANNEL_RUN_BASE_PINS,
      NATIVE_EVENT: ['NOT_APPLICABLE', 'FAMILY_NOT_APPLICABLE', null, null],
    };
    const nativeNotReady: DiV0S4ChannelPins = {
      ...CHANNEL_RUN_BASE_PINS,
      NATIVE_EVENT: ['NOT_READY', 'NO_READINESS_AUTHORITY', null, null],
    };
    const on = { r1Enabled: true, nativeEnabled: false };
    const allOn = { r1Enabled: true, nativeEnabled: true };

    it('applicable family must not pin NOT_APPLICABLE', () => {
      expect(evaluateDiV0S4ChannelRun(on, CHANNEL_RUN_BASE_PINS, 'RUPTELA_R1')).toBe('RUNNABLE');
      expect(evaluateDiV0S4ChannelRun(on, r1NotApplicable, 'RUPTELA_R1')).toBe('INVALID');
      expect(evaluateDiV0S4ChannelRun(allOn, nativeNotReady, 'RUPTELA_R1')).toBe('RUNNABLE');
      expect(evaluateDiV0S4ChannelRun(allOn, nativeNotApplicable, 'RUPTELA_R1')).toBe('INVALID');
    });

    it('non-applicable family must pin NOT_APPLICABLE on flag-on channels', () => {
      for (const family of ['API_SYNTHETIC', 'UNKNOWN']) {
        expect(evaluateDiV0S4ChannelRun(on, CHANNEL_RUN_BASE_PINS, family)).toBe('INVALID');
        expect(evaluateDiV0S4ChannelRun(on, r1NotApplicable, family)).toBe('RUNNABLE');
        expect(evaluateDiV0S4ChannelRun(allOn, nativeNotReady, family)).toBe('INVALID');
        expect(
          evaluateDiV0S4ChannelRun(allOn, { ...r1NotApplicable, NATIVE_EVENT: nativeNotApplicable.NATIVE_EVENT }, family),
        ).toBe('RUNNABLE');
      }
    });

    it('flag-off channels stay DISABLED regardless of family', () => {
      const r1Off: DiV0S4ChannelPins = { ...CHANNEL_RUN_BASE_PINS, R1_OBD: ['DISABLED', 'FLAG_OFF', null, null] };
      for (const family of ['RUPTELA_R1', 'API_SYNTHETIC']) {
        expect(evaluateDiV0S4ChannelRun({ r1Enabled: false, nativeEnabled: false }, r1Off, family)).toBe('RUNNABLE');
        expect(evaluateDiV0S4ChannelRun({ r1Enabled: false, nativeEnabled: false }, r1NotApplicable, family)).toBe('INVALID');
      }
    });
  });
});

describe('DI V0 S4A S2 execution identity (fixtures)', () => {
  const base: DiV0S4ExecutionIdentityInput = F.s2ExecutionIdentityBase;

  it('reproduces s2ExecutionIdentityExpected and binds the fixture pipeline key and combined identity', () => {
    expect(buildDiV0S4ExecutionIdentity(base)).toBe(F.s2ExecutionIdentityExpected);
    expect(base.pipelineVersionKey).toBe(F.pipelineVersionExpectedKey);
    expect(base.boundaryFingerprint).toBe(F.boundaryExpectedFingerprint);
    expect(base.combinedInputIdentity).toBe(buildDiV0CombinedInputIdentityV03(F.combinedIdentityBase));
  });

  it.each(F.s2ExecutionIdentityMutations.map((m: { name: string }) => [m.name, m]))('mutation %s', (_name, m) => {
    const mm = m as { set: object; expect: string };
    const same = buildDiV0S4ExecutionIdentity({ ...base, ...mm.set } as DiV0S4ExecutionIdentityInput) === F.s2ExecutionIdentityExpected;
    expect(same).toBe(mm.expect === 'EQUAL');
  });

  it('consistency check binds calibration bundle, orchestration version and pipeline key to the manifest', () => {
    const manifest = F.pipelineVersionBase;
    expect(() => assertDiV0S4ExecutionIdentityConsistency(base, manifest)).not.toThrow();
    expect(() => assertDiV0S4ExecutionIdentityConsistency({ ...base, calibrationBundleHash: 'sha256:x' }, manifest)).toThrow();
    expect(() =>
      assertDiV0S4ExecutionIdentityConsistency({ ...base, s4OrchestrationContractVersion: 'X' }, manifest),
    ).toThrow();
    expect(() =>
      assertDiV0S4ExecutionIdentityConsistency({ ...base, pipelineVersionKey: 'DI_V0_S4_PIPELINE_V1:sha256:00' }, manifest),
    ).toThrow();
  });
});

describe('DI V0 S4A control plane (fixtures)', () => {
  const cp = F.controlPlaneScenarios;
  const killObservation = (row: unknown): DiV0S4KillRowObservation => {
    if (row === 'MISSING') return { kind: 'MISSING' };
    if (row === 'READ_ERROR') return { kind: 'READ_ERROR' };
    return { kind: 'ROW', killState: (row as { kill_state: unknown }).kill_state };
  };

  it.each(cp.cases.map((c: { name: string }) => [c.name, c]))('scenario %s', (_name, c) => {
    const set = (c as { set: Record<string, unknown> }).set;
    const env = set.env && Object.keys(set.env as object).length === 0 ? {} : { ...cp.base.env, ...((set.env as object) ?? {}) };
    const role = (set.role ?? cp.base.role) as 'DISCOVERY' | 'WORKER';
    const killRow = 'killRow' in set ? set.killRow : cp.base.killRow;
    const workItem = (set.workItem ?? cp.base.workItem) as { organizationId: string; vehicleId: string };
    const result = evaluateDiV0S4Enablement(
      parseDiV0S4ControlPlaneConfig(env),
      role,
      { ...workItem, vehicleOrganizationId: cp.vehicleOrganizations[workItem.vehicleId] ?? null },
      evaluateDiV0S4KillRow(killObservation(killRow)),
    );
    expect(result.enabled ? 'ENABLED' : 'DISABLED').toBe((c as { expect: string }).expect);
  });

  it('kill row evaluation fails closed', () => {
    expect(evaluateDiV0S4KillRow({ kind: 'ROW', killState: 'NOT_KILLED' })).toEqual({ state: 'NOT_KILLED', reason: null });
    expect(evaluateDiV0S4KillRow({ kind: 'ROW', killState: 'KILLED' }).reason).toBe('DB_KILL_ACTIVE');
    expect(evaluateDiV0S4KillRow({ kind: 'MISSING' }).reason).toBe('DB_KILL_ROW_MISSING');
    expect(evaluateDiV0S4KillRow({ kind: 'READ_ERROR' }).reason).toBe('DB_KILL_ROW_UNREADABLE');
    for (const malformed of ['not_killed', '', null, undefined, 0, 'NOT_KILLED ']) {
      expect(evaluateDiV0S4KillRow({ kind: 'ROW', killState: malformed })).toEqual({
        state: 'KILLED',
        reason: 'DB_KILL_ROW_MALFORMED',
      });
    }
  });

  it('flags and allowlists default closed', () => {
    for (const off of [undefined, '', ' ', 'false', '0', 'off', 'no', 'enabled', 'TRUEE']) {
      expect(parseDiV0S4BooleanFlag(off)).toBe(false);
    }
    for (const onValue of ['1', 'true', 'TRUE', ' yes ', 'on']) expect(parseDiV0S4BooleanFlag(onValue)).toBe(true);
    expect(parseDiV0S4Allowlist(undefined).size).toBe(0);
    expect(parseDiV0S4Allowlist('*').size).toBe(0);
    expect(parseDiV0S4Allowlist('a,b c').size).toBe(0);
    expect([...parseDiV0S4Allowlist('a, b ,a')]).toEqual(['a', 'b']);
    const off = DI_V0_S4_CONTROL_PLANE_ALL_OFF;
    expect([off.masterEnabled, off.discoveryEnabled, off.workerEnabled, off.positionEnabled, off.r1Enabled, off.nativeEnabled]).toEqual([
      false, false, false, false, false, false,
    ]);
  });

  it('maintenance enablement is MASTER ∧ NOT_KILLED only', () => {
    const master = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
    const notKilled = evaluateDiV0S4KillRow({ kind: 'ROW', killState: 'NOT_KILLED' });
    const killed = evaluateDiV0S4KillRow({ kind: 'ROW', killState: 'KILLED' });
    expect(evaluateDiV0S4MaintenanceEnablement(master, notKilled)).toEqual({ enabled: true, failedTerms: [] });
    expect(evaluateDiV0S4MaintenanceEnablement(master, killed).failedTerms).toEqual(['DB_NOT_KILLED']);
    expect(evaluateDiV0S4MaintenanceEnablement(DI_V0_S4_CONTROL_PLANE_ALL_OFF, notKilled).failedTerms).toEqual(['MASTER']);
  });
});

describe('DI V0 S4A evidence container', () => {
  const channels: DiV0S4EvidenceChannelInput[] = [
    { channel: 'POSITION', outcome: 'PRESENT', reasonCode: null, formatVersion: 'DI_V0_POSITION_EVIDENCE_SNAPSHOT_V0_1', payload: '{"p":1}', attestationRef: null },
    { channel: 'R1_OBD', outcome: 'SOURCE_FAILURE', reasonCode: 'RATE_LIMITED', formatVersion: null, payload: null, attestationRef: null },
    { channel: 'NATIVE_EVENT', outcome: 'DISABLED', reasonCode: 'FLAG_OFF', formatVersion: null, payload: null, attestationRef: null },
  ];
  const input = {
    organizationId: 'org-A',
    vehicleId: 'veh-A1',
    tripId: 'trip-A1-1',
    boundaryFingerprint: F.boundaryExpectedFingerprint,
    windowStart: new Date('2026-09-20T08:00:00.000Z'),
    windowEnd: new Date('2026-09-20T08:20:00.000Z'),
    channels,
  };

  it('is deterministic and independent of channel input order', () => {
    const a = serializeDiV0S4EvidenceContainer(input);
    const b = serializeDiV0S4EvidenceContainer({ ...input, channels: [...channels].reverse() });
    expect(b.container).toBe(a.container);
    expect(b.snapshotHash).toBe(a.snapshotHash);
    expect(a.snapshotHash).toMatch(/^DI_V0_S4_EVIDENCE_V1:sha256:[0-9a-f]{64}$/);
    expect(pinsFromDiV0S4ChannelManifest(a.channelManifest)).toEqual(a.pins);
    expect(a.combinedInputIdentity).toBe(buildDiV0CombinedInputIdentityV03(a.pins));
  });

  it('binds scope, window and payload into the snapshot hash', () => {
    const base = serializeDiV0S4EvidenceContainer(input).snapshotHash;
    expect(serializeDiV0S4EvidenceContainer({ ...input, organizationId: 'org-B' }).snapshotHash).not.toBe(base);
    expect(serializeDiV0S4EvidenceContainer({ ...input, windowEnd: new Date('2026-09-20T08:21:00.000Z') }).snapshotHash).not.toBe(base);
    const payloadChanged = channels.map((c) => (c.channel === 'POSITION' ? { ...c, payload: '{"p":2}' } : c));
    expect(serializeDiV0S4EvidenceContainer({ ...input, channels: payloadChanged }).snapshotHash).not.toBe(base);
  });

  it('refuses invalid windows, duplicate or missing channels and invalid pins', () => {
    expect(() => serializeDiV0S4EvidenceContainer({ ...input, windowEnd: input.windowStart })).toThrow(/window/);
    expect(() =>
      serializeDiV0S4EvidenceContainer({ ...input, windowEnd: new Date(input.windowStart.getTime() + 28_801_000) }),
    ).toThrow(/window/);
    expect(() => serializeDiV0S4EvidenceContainer({ ...input, channels: [...channels, channels[0]] })).toThrow(/duplicate/);
    expect(() => serializeDiV0S4EvidenceContainer({ ...input, channels: channels.slice(1) })).toThrow(/missing channel/);
    const presentWithoutPayload = channels.map((c) => (c.channel === 'POSITION' ? { ...c, payload: null, formatVersion: null } : c));
    expect(() => serializeDiV0S4EvidenceContainer({ ...input, channels: presentWithoutPayload })).toThrow(/requires channel evidence/);
  });
});
