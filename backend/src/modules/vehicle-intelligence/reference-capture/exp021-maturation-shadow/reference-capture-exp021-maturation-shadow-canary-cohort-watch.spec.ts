import { randomUUID } from 'crypto';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { buildExp021CanaryCohortAuthority } from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';
import { EXP021_KS_MX_2024_CANARY } from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import { Exp021MaturationShadowFamilyIdentityError } from './reference-capture-exp021-maturation-shadow.errors';
import {
  buildCohortWatchStartupReport,
  resolveCohortForWatchFromEnv,
  runCohortMaturationWatchLoop,
  runCohortMemberWatchLoop,
  type Exp021CohortMemberCycleInput,
  type Exp021CohortMemberCycleResult,
  type Exp021CohortWatchDiagnostics,
} from './reference-capture-exp021-maturation-shadow-canary-cohort-watch.lib';
import type { Exp021CanaryCohortMember } from '../exp021-canary-live-window/reference-capture-exp021-canary-live-window-cohort.lib';

const RUNTIME_SHA = 'cohort-watch-test-sha';

function makeThreeMemberCohort(extra?: { vehicleId: string; tokenId: number; label?: string }) {
  const members: Array<{
    label: string;
    organizationId: string;
    vehicleId: string;
    tokenId: number;
  }> = [
    {
      label: 'KS MX 2024',
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
      tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
    },
    {
      label: 'KS MS 661',
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: 'c10351f8-b6a2-4258-947f-631aeaa6d359',
      tokenId: 187361,
    },
    {
      label: 'WOB L 7503',
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      tokenId: 192922,
    },
  ];
  if (extra) {
    members.push({
      label: extra.label ?? 'extra',
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: extra.vehicleId,
      tokenId: extra.tokenId,
    });
  }
  return buildExp021CanaryCohortAuthority(members)!;
}

function makeConfig(cohortSize: number): ReferenceCaptureConfig {
  const tokens = [187336, 187361, 192922].slice(0, cohortSize);
  return {
    isExp021MaturationShadowEnabled: () => true,
    isExp021MaturationShadowHfLaneEnabled: () => true,
    isExp021MaturationShadowSettlementLaneEnabled: () => true,
    getExp021MaturationShadowAllowlistTokenIds: () => tokens,
    getExp021MaturationShadowMaxActiveFamilies: () => cohortSize,
    getHfRecoveryPolicyConfig: () => ({
      mode: 'V2' as const,
      settlementDelayMs: 8_000,
      recoveryOverlapMs: 6_000,
      hfHistoricalPollIntervalMs: 30_000,
      recoverySweepEnabled: false,
      recoverySweepIntervalMs: 60_000,
      recoverySweepLookbackMs: 300_000,
      canaryOnly: false,
      canaryTokenIds: [],
      availabilityCalibrationEnabled: false,
    }),
  } as unknown as ReferenceCaptureConfig;
}

function memberDeps(member: Exp021CanaryCohortMember) {
  return {
    member,
    loadSettlementShadowExperiments: async () => [],
    sleep: async () => undefined,
    now: () => new Date(),
  };
}

describe('reference-capture-exp021-maturation-shadow-canary-cohort-watch.lib', () => {
  beforeEach(() => {
    process.env.GITHUB_SHA = RUNTIME_SHA;
  });

  it('L — malformed cohort refuses startup', () => {
    delete process.env.EXP021_MATURATION_SHADOW_CANARY_COHORT_JSON;
    delete process.env.EXP021_CANARY_LIVE_WINDOW_COHORT_JSON;
    expect(() => resolveCohortForWatchFromEnv()).toThrow(Exp021MaturationShadowFamilyIdentityError);
  });

  it('K — fourth member works by configuration only', () => {
    const fourthVehicleId = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';
    const cohort = makeThreeMemberCohort({
      label: 'Future 4',
      vehicleId: fourthVehicleId,
      tokenId: 199999,
    });
    expect(cohort.members.length).toBe(4);
    const report = buildCohortWatchStartupReport({ cohort, execute: true });
    expect(report.COHORT_SIZE).toBe(4);
  });

  it('A/B — member A receives first event and re-arms for second', async () => {
    const cohort = makeThreeMemberCohort();
    const mx = cohort.members[0];
    const calls: string[] = [];
    let mxCount = 0;
    const controller = new AbortController();

    const runMemberCycle = async (
      input: Exp021CohortMemberCycleInput,
    ): Promise<Exp021CohortMemberCycleResult> => {
      if (input.member.vehicleId === mx.vehicleId) {
        mxCount += 1;
        calls.push(`mx-${mxCount}`);
        if (mxCount >= 2) controller.abort();
        return {
          outcome: 'enrolled',
          familyId: `family-mx-${mxCount}`,
          canonicalWindowTo: new Date().toISOString(),
        };
      }
      await new Promise(() => undefined);
      return { outcome: 'skipped', reason: 'blocked' };
    };

    const diagnostics: Exp021CohortWatchDiagnostics = {
      ACTIVE_MEMBER_WATCHERS: 1,
      MEMBER_FAILURE_COUNT: {},
      FAMILIES_ENROLLED_THIS_RUN: {},
      LAST_ENROLLMENT_BY_MEMBER: {},
    };

    await runCohortMemberWatchLoop({
      member: mx,
      cohort,
      execute: true,
      config: makeConfig(3),
      repository: {} as never,
      enrollment: {} as never,
      deps: memberDeps(mx),
      loadSpeedObservationsForWindow: async () => [],
      runMemberCycle,
      signal: controller.signal,
      diagnostics,
      memberSuccessCooldownMs: 0,
      memberErrorBackoffMs: 1,
    });

    expect(calls).toEqual(['mx-1', 'mx-2']);
    expect(diagnostics.FAMILIES_ENROLLED_THIS_RUN[mx.vehicleId]).toBe(2);
  });

  it('C/D — A1 then B1 while A waits (sequence A1,B1,C1,A2)', async () => {
    const cohort = makeThreeMemberCohort();
    const [mx, ms, wob] = cohort.members;
    const sequence: string[] = [];
    const queues = new Map<string, string[]>([
      [mx.vehicleId, ['A1', 'A2']],
      [ms.vehicleId, ['B1']],
      [wob.vehicleId, ['C1']],
    ]);

    const controller = new AbortController();

    const runMemberCycle = async (
      input: Exp021CohortMemberCycleInput,
    ): Promise<Exp021CohortMemberCycleResult> => {
      const vid = input.member.vehicleId;
      const queue = queues.get(vid) ?? [];
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          const timer = setInterval(() => {
            if (controller.signal.aborted) {
              clearInterval(timer);
              resolve();
            }
          }, 5);
        });
        return { outcome: 'skipped', reason: 'idle' };
      }
      const label = queue.shift()!;
      sequence.push(label);
      if (sequence.length >= 4) {
        controller.abort();
      }
      return {
        outcome: 'enrolled',
        familyId: `family-${label}-${randomUUID()}`,
        canonicalWindowTo: new Date().toISOString(),
      };
    };

    await runCohortMaturationWatchLoop({
      cohort,
      execute: true,
      config: makeConfig(3),
      repository: {} as never,
      enrollment: {} as never,
      memberDeps,
      loadSpeedObservationsForWindow: async () => [],
      runMemberCycle,
      signal: controller.signal,
      memberSuccessCooldownMs: 0,
      memberErrorBackoffMs: 1,
    });

    expect(sequence).toContain('A1');
    expect(sequence).toContain('B1');
    expect(sequence).toContain('C1');
    expect(sequence).toContain('A2');
    expect(sequence.indexOf('A2')).toBeGreaterThan(sequence.indexOf('A1'));
  });

  it(
    'E — member A throws while B/C continue',
    async () => {
      const cohort = makeThreeMemberCohort();
      const [mx, ms, wob] = cohort.members;
      const enrolled: string[] = [];
      const controller = new AbortController();
      let mxFailures = 0;
      const enrolledOnce = new Set<string>();

      const runMemberCycle = async (
        input: Exp021CohortMemberCycleInput,
      ): Promise<Exp021CohortMemberCycleResult> => {
        if (controller.signal.aborted) {
          return { outcome: 'skipped', reason: 'aborted' };
        }
        if (input.member.vehicleId === mx.vehicleId) {
          mxFailures += 1;
          if (mxFailures < 2) {
            throw new Error('mx-transient');
          }
          enrolled.push('mx-recovered');
          controller.abort();
          return {
            outcome: 'enrolled',
            familyId: 'family-mx-recovered',
            canonicalWindowTo: new Date().toISOString(),
          };
        }
        if (enrolledOnce.has(input.member.vehicleId)) {
          return { outcome: 'skipped', reason: 'already' };
        }
        enrolledOnce.add(input.member.vehicleId);
        enrolled.push(input.member.label ?? input.member.vehicleId);
        return {
          outcome: 'enrolled',
          familyId: `family-${input.member.tokenId}`,
          canonicalWindowTo: new Date().toISOString(),
        };
      };

      let mxFailureCount = 0;
      await runCohortMaturationWatchLoop({
        cohort,
        execute: true,
        config: makeConfig(3),
        repository: {} as never,
        enrollment: {} as never,
        memberDeps,
        loadSpeedObservationsForWindow: async () => [],
        runMemberCycle,
        signal: controller.signal,
        onDiagnostics: (diagnostics) => {
          mxFailureCount = diagnostics.MEMBER_FAILURE_COUNT[mx.vehicleId] ?? 0;
        },
        memberSuccessCooldownMs: 0,
        memberErrorBackoffMs: 5,
      });

      expect(mxFailureCount).toBeGreaterThanOrEqual(1);
      expect(enrolled).toContain(ms.label);
      expect(enrolled).toContain(wob.label);
      expect(enrolled).toContain('mx-recovered');
    },
    15_000,
  );

  it('G — duplicate notification converges (idempotent family id)', async () => {
    const cohort = makeThreeMemberCohort();
    const mx = cohort.members[0];
    const controller = new AbortController();
    let invocations = 0;
    const familyId = 'family-idempotent-1';

    const runMemberCycle = async (): Promise<Exp021CohortMemberCycleResult> => {
      invocations += 1;
      if (invocations >= 2) controller.abort();
      return {
        outcome: 'enrolled',
        familyId,
        canonicalWindowTo: '2026-09-20T12:00:00.000Z',
      };
    };

    await runCohortMemberWatchLoop({
      member: mx,
      cohort,
      execute: true,
      config: makeConfig(3),
      repository: {} as never,
      enrollment: {} as never,
      deps: memberDeps(mx),
      loadSpeedObservationsForWindow: async () => [],
      runMemberCycle: runMemberCycle as never,
      signal: controller.signal,
      diagnostics: {
        ACTIVE_MEMBER_WATCHERS: 1,
        MEMBER_FAILURE_COUNT: {},
        FAMILIES_ENROLLED_THIS_RUN: {},
        LAST_ENROLLMENT_BY_MEMBER: {},
      },
      memberSuccessCooldownMs: 0,
      memberErrorBackoffMs: 1,
    });

    expect(invocations).toBe(2);
  });

  it('J — graceful abort stops future polling', async () => {
    const cohort = makeThreeMemberCohort();
    const mx = cohort.members[0];
    const controller = new AbortController();
    let polls = 0;

    const runMemberCycle = async (): Promise<Exp021CohortMemberCycleResult> => {
      polls += 1;
      controller.abort();
      return {
        outcome: 'dry_run',
        canonicalWindowTo: new Date().toISOString(),
      };
    };

    await runCohortMemberWatchLoop({
      member: mx,
      cohort,
      execute: false,
      config: makeConfig(3),
      repository: {} as never,
      enrollment: {} as never,
      deps: memberDeps(mx),
      loadSpeedObservationsForWindow: async () => [],
      runMemberCycle: runMemberCycle as never,
      signal: controller.signal,
      diagnostics: {
        ACTIVE_MEMBER_WATCHERS: 1,
        MEMBER_FAILURE_COUNT: {},
        FAMILIES_ENROLLED_THIS_RUN: {},
        LAST_ENROLLMENT_BY_MEMBER: {},
      },
      memberSuccessCooldownMs: 0,
      memberErrorBackoffMs: 1,
    });

    expect(polls).toBe(1);
  });
});
