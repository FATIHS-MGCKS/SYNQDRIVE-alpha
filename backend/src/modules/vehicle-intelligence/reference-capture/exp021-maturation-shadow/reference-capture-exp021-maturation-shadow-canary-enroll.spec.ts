import { randomUUID } from 'crypto';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import {
  EXP021_CANARY_WINDOW_FRESHNESS_EXECUTION_SLACK_MS,
  EXP021_KS_MX_2024_CANARY,
} from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import { classifyActivityForGeometry } from './reference-capture-exp021-maturation-shadow-activity-classification.lib';
import {
  resolveGeometryActivityAuthorityByWindow,
  type Exp021CanarySpeedObservation,
} from './reference-capture-exp021-maturation-shadow-canary-activity.lib';
import {
  assertCanaryHardGuards,
  buildCanaryDryRunPlan,
  evaluateWindowFreshness,
  executeCanaryEnrollment,
  findAuthoritativePhysicalEndMatch,
  formatCanaryCliOutput,
  isAuthoritativePhysicalDriveInterval,
  readPhysicalDriveIntervalAuthority,
  waitForNextAuthoritativeWindowClose,
  waitForNextFreshAuthoritativeWindowClose,
} from './reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { Exp021MaturationShadowFamilyIdentityError } from './reference-capture-exp021-maturation-shadow.errors';
import { ReferenceCaptureExp021MaturationShadowEnrollmentService } from './reference-capture-exp021-maturation-shadow-enrollment.service';
import { ReferenceCaptureExp021MaturationShadowRepository } from './reference-capture-exp021-maturation-shadow.repository';
import { EXP021_MATURATION_SHADOW_FIXED_AGES_MS } from './reference-capture-exp021-maturation-shadow-schedule.lib';

const RUNTIME_SHA = 'exp021-canary-cli-test-sha';

function makeCanaryConfig(
  overrides: Partial<{
    enabled: boolean;
    hfLane: boolean;
    settlementLane: boolean;
    allowlist: number[];
    maxActiveFamilies: number;
    settlementDelayMs: number;
  }> = {},
): ReferenceCaptureConfig {
  return {
    isExp021MaturationShadowEnabled: () => overrides.enabled ?? true,
    isExp021MaturationShadowHfLaneEnabled: () => overrides.hfLane ?? true,
    isExp021MaturationShadowSettlementLaneEnabled: () => overrides.settlementLane ?? true,
    getExp021MaturationShadowAllowlistTokenIds: () =>
      overrides.allowlist ?? [EXP021_KS_MX_2024_CANARY.tokenId],
    getExp021MaturationShadowMaxActiveFamilies: () => overrides.maxActiveFamilies ?? 1,
    getHfRecoveryPolicyConfig: () => ({
      mode: 'V2' as const,
      settlementDelayMs: overrides.settlementDelayMs ?? 8_000,
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

function makeRepositoryMock(
  overrides: Partial<{
    authoritativeTokenId: number | null;
    unfinishedFamilies: number;
    unfinishedAfterEnroll: number;
    rejectResolve: boolean;
  }> = {},
): ReferenceCaptureExp021MaturationShadowRepository {
  const authoritativeTokenId =
    overrides.authoritativeTokenId !== undefined
      ? overrides.authoritativeTokenId
      : EXP021_KS_MX_2024_CANARY.tokenId;
  const resolveAuthoritativeTokenId = overrides.rejectResolve
    ? jest.fn().mockRejectedValue(
        new Exp021MaturationShadowFamilyIdentityError('No authoritative DIMO token'),
      )
    : authoritativeTokenId == null
      ? jest.fn().mockResolvedValue(null)
      : jest.fn().mockResolvedValue(authoritativeTokenId);

  return {
    resolveAuthoritativeTokenId,
    countUnfinishedFamilies: jest
      .fn()
      .mockResolvedValueOnce(overrides.unfinishedFamilies ?? 0)
      .mockResolvedValue(overrides.unfinishedAfterEnroll ?? 1),
  } as unknown as ReferenceCaptureExp021MaturationShadowRepository;
}

function makeEnrollmentMock(): {
  service: ReferenceCaptureExp021MaturationShadowEnrollmentService;
  enrollWindowFamily: jest.Mock;
} {
  const enrollWindowFamily = jest.fn().mockResolvedValue({
    familyId: randomUUID(),
    stratumCount: 4,
    slotCount: 36,
    enqueuedJobCount: 36,
  });
  return {
    enrollWindowFamily,
    service: { enrollWindowFamily } as unknown as ReferenceCaptureExp021MaturationShadowEnrollmentService,
  };
}

function authoritativeExperiment(physicalEndAt: string, source: 'PDI_CANDIDATE' | 'ORCHESTRATOR_CONFIRMED' = 'PDI_CANDIDATE') {
  return {
    metadataJson: {
      physicalDriveInterval: {
        physicalStartAt: '2026-09-17T11:00:00.000Z',
        physicalEndAt,
        source,
      },
    },
  };
}

function geometryObservations(): Exp021CanarySpeedObservation[] {
  return [
    {
      providerField: 'speed',
      providerTimestamp: new Date('2026-09-17T11:59:50.000Z'),
      normalizedValueJson: 42,
    },
  ];
}

describe('reference-capture-exp021-maturation-shadow-canary-enroll.lib', () => {
  beforeEach(() => {
    process.env.GITHUB_SHA = RUNTIME_SHA;
  });

  it('1) dry-run creates zero rows/jobs', async () => {
    const config = makeCanaryConfig();
    const repository = makeRepositoryMock();
    const { service: enrollment, enrollWindowFamily } = makeEnrollmentMock();
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const now = new Date(canonicalWindowTo.getTime() + 1_000);

    const result = await executeCanaryEnrollment({
      args: { tokenId: 187336, execute: false, waitNextWindow: false },
      config,
      repository,
      enrollment,
      canonicalWindowTo,
      now,
      authoritativeWindowMatch: true,
      settlementShadowExperiments: [authoritativeExperiment(canonicalWindowTo.toISOString())],
      activityAuthorityByGeometry: resolveGeometryActivityAuthorityByWindow(
        geometryObservations(),
        canonicalWindowTo,
      ),
    });

    expect(enrollWindowFamily).not.toHaveBeenCalled();
    expect('familyId' in result).toBe(false);
  });

  it('2) execute without correct token fails', async () => {
    await expect(
      executeCanaryEnrollment({
        args: { tokenId: 999999, execute: true, waitNextWindow: false },
        config: makeCanaryConfig(),
        repository: makeRepositoryMock(),
        enrollment: makeEnrollmentMock().service,
        canonicalWindowTo: new Date('2026-09-17T12:00:00.000Z'),
      }),
    ).rejects.toThrow('requires tokenId 187336');
  });

  it('A1) authoritative token = 187336 passes hard guard', async () => {
    const guards = await assertCanaryHardGuards({
      tokenId: 187336,
      config: makeCanaryConfig(),
      repository: makeRepositoryMock({ authoritativeTokenId: 187336 }),
    });
    expect(guards.authoritativeTokenId).toBe(187336);
  });

  it('A2) authoritative token = another token fails', async () => {
    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config: makeCanaryConfig(),
        repository: makeRepositoryMock({ authoritativeTokenId: 186946 }),
      }),
    ).rejects.toThrow('Authoritative token binding mismatch');
  });

  it('A3) authoritative token = null fails', async () => {
    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config: makeCanaryConfig(),
        repository: makeRepositoryMock({ authoritativeTokenId: null }),
      }),
    ).rejects.toThrow('Authoritative token binding mismatch');
  });

  it('4) allowlist mismatch fails', async () => {
    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config: makeCanaryConfig({ allowlist: [186946] }),
        repository: makeRepositoryMock(),
      }),
    ).rejects.toThrow('Allowlist must contain exactly token 187336');
  });

  it('5) global disabled fails', async () => {
    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config: makeCanaryConfig({ enabled: false }),
        repository: makeRepositoryMock(),
      }),
    ).rejects.toThrow('EXP021 maturation shadow is disabled');
  });

  it('6) one lane disabled handling is explicit', async () => {
    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config: makeCanaryConfig({ hfLane: false }),
        repository: makeRepositoryMock(),
      }),
    ).rejects.toThrow('HF lane disabled');

    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config: makeCanaryConfig({ settlementLane: false }),
        repository: makeRepositoryMock(),
      }),
    ).rejects.toThrow('Settlement lane disabled');
  });

  it('7) active-family already exists fails', async () => {
    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config: makeCanaryConfig(),
        repository: makeRepositoryMock({ unfinishedFamilies: 1 }),
      }),
    ).rejects.toThrow('Active unfinished maturation shadow families must be 0');
  });

  it('8) stale window fails', async () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    await expect(
      executeCanaryEnrollment({
        args: { tokenId: 187336, execute: true, waitNextWindow: false },
        config: makeCanaryConfig(),
        repository: makeRepositoryMock(),
        enrollment: makeEnrollmentMock().service,
        canonicalWindowTo,
        now: new Date(canonicalWindowTo.getTime() + 30_000),
        authoritativeWindowMatch: true,
        settlementShadowExperiments: [authoritativeExperiment(canonicalWindowTo.toISOString())],
      }),
    ).rejects.toThrow('Stale canonicalWindowTo');
  });

  it('9) fresh window passes with authoritative match', async () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const { service: enrollment, enrollWindowFamily } = makeEnrollmentMock();

    const result = await executeCanaryEnrollment({
      args: { tokenId: 187336, execute: true, waitNextWindow: false },
      config: makeCanaryConfig(),
      repository: makeRepositoryMock(),
      enrollment,
      canonicalWindowTo,
      now: new Date(canonicalWindowTo.getTime() + 2_000),
      authoritativeWindowMatch: true,
      settlementShadowExperiments: [authoritativeExperiment(canonicalWindowTo.toISOString())],
      activityAuthorityByGeometry: resolveGeometryActivityAuthorityByWindow(
        geometryObservations(),
        canonicalWindowTo,
      ),
    });

    expect(enrollWindowFamily).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      familyId: expect.any(String),
      authoritativeWindowMatch: true,
      activityClassification60s: { class: 'ACTIVE_MOTION' },
      activityClassification90s: { class: 'ACTIVE_MOTION' },
    });
  });

  it('D) execute rejects arbitrary operator timestamp without authoritative match', async () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    await expect(
      executeCanaryEnrollment({
        args: { tokenId: 187336, execute: true, waitNextWindow: false },
        config: makeCanaryConfig(),
        repository: makeRepositoryMock(),
        enrollment: makeEnrollmentMock().service,
        canonicalWindowTo,
        now: new Date(canonicalWindowTo.getTime() + 1_000),
        settlementShadowExperiments: [],
      }),
    ).rejects.toThrow('Execute requires authoritative persisted physicalEndAt match');
  });

  it('D dry-run reports AUTHORITATIVE_WINDOW_MATCH=NO for unmatched timestamp', async () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const result = await executeCanaryEnrollment({
      args: { tokenId: 187336, execute: false, waitNextWindow: false },
      config: makeCanaryConfig(),
      repository: makeRepositoryMock(),
      enrollment: makeEnrollmentMock().service,
      canonicalWindowTo,
      now: new Date(canonicalWindowTo.getTime() + 1_000),
      settlementShadowExperiments: [],
    });
    const output = formatCanaryCliOutput(result, 'DRY_RUN');
    expect(output.AUTHORITATIVE_WINDOW_MATCH).toBe('NO');
  });

  it('10) duplicate invocation does not create second family', async () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const { service: enrollment, enrollWindowFamily } = makeEnrollmentMock();
    const args = { tokenId: 187336, execute: true, waitNextWindow: false };

    await executeCanaryEnrollment({
      args,
      config: makeCanaryConfig(),
      repository: makeRepositoryMock({ unfinishedFamilies: 0, unfinishedAfterEnroll: 1 }),
      enrollment,
      canonicalWindowTo,
      now: new Date(canonicalWindowTo.getTime() + 1_000),
      authoritativeWindowMatch: true,
      settlementShadowExperiments: [authoritativeExperiment(canonicalWindowTo.toISOString())],
    });

    await expect(
      executeCanaryEnrollment({
        args,
        config: makeCanaryConfig(),
        repository: makeRepositoryMock({ unfinishedFamilies: 1 }),
        enrollment,
        canonicalWindowTo,
        now: new Date(canonicalWindowTo.getTime() + 1_000),
        authoritativeWindowMatch: true,
        settlementShadowExperiments: [authoritativeExperiment(canonicalWindowTo.toISOString())],
      }),
    ).rejects.toThrow('Active unfinished maturation shadow families must be 0');

    expect(enrollWindowFamily).toHaveBeenCalledTimes(1);
  });

  it('B) activity classification is anchored to resolved canonicalWindowTo not an earlier window', () => {
    const resolvedWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const earlierWindowTo = new Date('2026-09-17T11:00:00.000Z');
    const observations: Exp021CanarySpeedObservation[] = [
      {
        providerField: 'speed',
        providerTimestamp: new Date('2026-09-17T11:59:50.000Z'),
        normalizedValueJson: 42,
      },
    ];

    const forResolved = resolveGeometryActivityAuthorityByWindow(observations, resolvedWindowTo);
    const forEarlier = resolveGeometryActivityAuthorityByWindow(observations, earlierWindowTo);

    expect(classifyActivityForGeometry(60_000, forResolved[60_000]).class).toBe('ACTIVE_MOTION');
    expect(classifyActivityForGeometry(60_000, forEarlier[60_000]).class).toBe('UNKNOWN_ACTIVITY');
  });

  it('C) geometry-specific activity from independent observations in production resolver path', () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const authority = resolveGeometryActivityAuthorityByWindow(
      geometryObservations(),
      canonicalWindowTo,
    );
    const plan = buildCanaryDryRunPlan({
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
      tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
      canonicalWindowTo,
      config: makeCanaryConfig(),
      activityAuthorityByGeometry: authority,
      now: new Date(canonicalWindowTo.getTime() + 1_000),
      authoritativeWindowMatch: true,
    });

    expect(plan.activityClassification60s.class).toBe('ACTIVE_MOTION');
    expect(plan.activityClassification90s.class).toBe('ACTIVE_MOTION');
  });

  it('H) output uses EXPECTED_PROVIDER_CALLS_DURING_ENROLLMENT not fake observed counter', async () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const result = await executeCanaryEnrollment({
      args: { tokenId: 187336, execute: true, waitNextWindow: false },
      config: makeCanaryConfig(),
      repository: makeRepositoryMock(),
      enrollment: makeEnrollmentMock().service,
      canonicalWindowTo,
      now: new Date(canonicalWindowTo.getTime() + 1_000),
      authoritativeWindowMatch: true,
      settlementShadowExperiments: [authoritativeExperiment(canonicalWindowTo.toISOString())],
    });
    const output = formatCanaryCliOutput(result, 'EXECUTE');
    expect(output.EXPECTED_PROVIDER_CALLS_DURING_ENROLLMENT).toBe(0);
    expect(output).not.toHaveProperty('PROVIDER_CALLS_DURING_ENROLLMENT');
  });

  it('13) deterministic M2 slots/jobs created from frozen schedule', () => {
    const plan = buildCanaryDryRunPlan({
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
      tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
      canonicalWindowTo: new Date('2026-09-17T12:00:00.000Z'),
      config: makeCanaryConfig({ settlementDelayMs: 8_000 }),
      now: new Date('2026-09-17T12:00:01.000Z'),
    });
    expect(plan.expectedSlotCount).toBe(4 * plan.plannedAgesMsExact.length);
  });

  it('F) wait mode skips stale first window and selects fresh second window', async () => {
    const config = makeCanaryConfig();
    let polls = 0;
    const result = await waitForNextFreshAuthoritativeWindowClose(
      {
        listSettlementShadowExperiments: async () => {
          polls += 1;
          if (polls === 1) {
            return [
              {
                id: 'stale-window',
                updatedAt: new Date('2026-09-17T12:00:04.000Z'),
                metadataJson: authoritativeExperiment('2026-09-17T12:00:00.000Z').metadataJson,
              },
            ];
          }
          return [
            {
              id: 'fresh-window',
              updatedAt: new Date('2026-09-17T13:00:01.000Z'),
              metadataJson: authoritativeExperiment('2026-09-17T13:00:00.000Z').metadataJson,
            },
          ];
        },
        sleep: async () => undefined,
        now: () =>
          polls === 1
            ? new Date('2026-09-17T12:00:04.000Z')
            : new Date('2026-09-17T13:00:01.000Z'),
        config,
        tokenId: 187336,
      },
      { afterPhysicalEndMs: Date.parse('2026-09-17T11:00:00.000Z'), timeoutMs: 10_000, pollMs: 1 },
    );

    expect(result.experimentId).toBe('fresh-window');
    expect(result.staleWindowsSkipped).toBe(1);
    expect(result.windowDetectionLagMs).toBe(1_000);
    expect(polls).toBe(2);
  });

  it('15) wait-next-window only reacts to authoritative KS MX 2024 window', async () => {
    let polls = 0;
    const waited = await waitForNextAuthoritativeWindowClose(
      {
        listSettlementShadowExperiments: async () => {
          polls += 1;
          if (polls === 1) {
            return [
              {
                id: 'fallback-only',
                updatedAt: new Date('2026-09-17T11:30:00.000Z'),
                metadataJson: {
                  physicalDriveInterval: {
                    physicalStartAt: '2026-09-17T11:00:00.000Z',
                    physicalEndAt: '2026-09-17T11:30:00.000Z',
                    source: 'SESSION_ENVELOPE_FALLBACK',
                  },
                },
              },
            ];
          }
          return [
            {
              id: 'authoritative',
              updatedAt: new Date('2026-09-17T12:00:00.000Z'),
              metadataJson: authoritativeExperiment('2026-09-17T12:00:00.000Z').metadataJson,
            },
          ];
        },
        sleep: async () => undefined,
        now: () => new Date('2026-09-17T12:00:01.000Z'),
        config: makeCanaryConfig(),
        tokenId: 187336,
      },
      { afterPhysicalEndMs: Date.parse('2026-09-17T11:00:00.000Z'), timeoutMs: 10_000, pollMs: 1 },
    );

    expect(waited.experimentId).toBe('authoritative');
    expect(polls).toBe(2);
  });

  it('evaluateWindowFreshness uses strict earliest-age guard with execution slack', () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const plannedAges = [8_000, ...EXP021_MATURATION_SHADOW_FIXED_AGES_MS];
    const fresh = evaluateWindowFreshness(
      canonicalWindowTo,
      plannedAges,
      new Date(canonicalWindowTo.getTime() + 2_000),
    );
    const stale = evaluateWindowFreshness(
      canonicalWindowTo,
      plannedAges,
      new Date(canonicalWindowTo.getTime() + 4_000),
    );

    expect(fresh.stale).toBe(false);
    expect(fresh.freshnessGuardMs).toBe(8_000 - EXP021_CANARY_WINDOW_FRESHNESS_EXECUTION_SLACK_MS);
    expect(stale.stale).toBe(true);
    expect(stale.remainingEnrollmentBudgetMs).toBeLessThan(0);
  });

  it('findAuthoritativePhysicalEndMatch requires exact persisted physicalEndAt', () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const match = findAuthoritativePhysicalEndMatch(canonicalWindowTo, [
      authoritativeExperiment('2026-09-17T12:00:00.000Z'),
    ]);
    const miss = findAuthoritativePhysicalEndMatch(canonicalWindowTo, [
      authoritativeExperiment('2026-09-17T12:00:01.000Z'),
    ]);
    expect(match.authoritativeWindowMatch).toBe(true);
    expect(miss.authoritativeWindowMatch).toBe(false);
  });

  it('readPhysicalDriveIntervalAuthority rejects incomplete metadata', () => {
    expect(readPhysicalDriveIntervalAuthority(null)).toBeNull();
    expect(
      isAuthoritativePhysicalDriveInterval({
        physicalStartAt: '2026-09-17T11:00:00.000Z',
        physicalEndAt: '2026-09-17T12:00:00.000Z',
        source: 'ORCHESTRATOR_CONFIRMED',
      }),
    ).toBe(true);
  });
});
