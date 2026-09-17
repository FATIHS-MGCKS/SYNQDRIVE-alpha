import { randomUUID } from 'crypto';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import {
  EXP021_CANARY_WINDOW_FRESHNESS_EXECUTION_SLACK_MS,
  EXP021_KS_MX_2024_CANARY,
} from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import {
  assertCanaryHardGuards,
  buildCanaryDryRunPlan,
  evaluateWindowFreshness,
  executeCanaryEnrollment,
  isAuthoritativePhysicalDriveInterval,
  readPhysicalDriveIntervalAuthority,
  resolveActivityAuthorityFromSignalsLatest,
  waitForNextAuthoritativeWindowClose,
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
    authoritativeTokenId: number;
    unfinishedFamilies: number;
    unfinishedAfterEnroll: number;
  }> = {},
): ReferenceCaptureExp021MaturationShadowRepository {
  return {
    resolveAuthoritativeTokenId: jest.fn().mockResolvedValue(
      overrides.authoritativeTokenId ?? EXP021_KS_MX_2024_CANARY.tokenId,
    ),
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
    });

    expect(enrollWindowFamily).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      tokenId: 187336,
      expectedStratumCount: 4,
      expectedSlotCount: 36,
    });
    expect('familyId' in result).toBe(false);
  });

  it('2) execute without correct token fails', async () => {
    const config = makeCanaryConfig();
    const repository = makeRepositoryMock();
    const { service: enrollment } = makeEnrollmentMock();

    await expect(
      executeCanaryEnrollment({
        args: { tokenId: 999999, execute: true, waitNextWindow: false },
        config,
        repository,
        enrollment,
        canonicalWindowTo: new Date('2026-09-17T12:00:00.000Z'),
      }),
    ).rejects.toThrow('requires tokenId 187336');
  });

  it('3) non-canary token fails allowlist guard', async () => {
    const config = makeCanaryConfig({ allowlist: [187336, 187337] });
    const repository = makeRepositoryMock();

    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config,
        repository,
      }),
    ).rejects.toThrow('Allowlist must contain exactly token 187336');
  });

  it('4) allowlist mismatch fails', async () => {
    const config = makeCanaryConfig({ allowlist: [186946] });
    const repository = makeRepositoryMock();

    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config,
        repository,
      }),
    ).rejects.toThrow('Allowlist must contain exactly token 187336');
  });

  it('5) global disabled fails', async () => {
    const config = makeCanaryConfig({ enabled: false });
    const repository = makeRepositoryMock();

    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config,
        repository,
      }),
    ).rejects.toThrow('EXP021 maturation shadow is disabled');
  });

  it('6) one lane disabled handling is explicit', async () => {
    const hfDisabled = makeCanaryConfig({ hfLane: false });
    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config: hfDisabled,
        repository: makeRepositoryMock(),
      }),
    ).rejects.toThrow('HF lane disabled');

    const settlementDisabled = makeCanaryConfig({ settlementLane: false });
    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config: settlementDisabled,
        repository: makeRepositoryMock(),
      }),
    ).rejects.toThrow('Settlement lane disabled');
  });

  it('7) active-family already exists fails', async () => {
    const config = makeCanaryConfig();
    const repository = makeRepositoryMock({ unfinishedFamilies: 1 });

    await expect(
      assertCanaryHardGuards({
        tokenId: 187336,
        config,
        repository,
      }),
    ).rejects.toThrow('Active unfinished maturation shadow families must be 0');
  });

  it('8) stale window fails', async () => {
    const config = makeCanaryConfig();
    const repository = makeRepositoryMock();
    const { service: enrollment } = makeEnrollmentMock();
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const now = new Date(canonicalWindowTo.getTime() + 30_000);

    await expect(
      executeCanaryEnrollment({
        args: { tokenId: 187336, execute: true, waitNextWindow: false },
        config,
        repository,
        enrollment,
        canonicalWindowTo,
        now,
      }),
    ).rejects.toThrow('Stale canonicalWindowTo');
  });

  it('9) fresh window passes', async () => {
    const config = makeCanaryConfig();
    const repository = makeRepositoryMock();
    const { service: enrollment, enrollWindowFamily } = makeEnrollmentMock();
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const now = new Date(canonicalWindowTo.getTime() + 2_000);

    const result = await executeCanaryEnrollment({
      args: { tokenId: 187336, execute: true, waitNextWindow: false },
      config,
      repository,
      enrollment,
      canonicalWindowTo,
      now,
    });

    expect(enrollWindowFamily).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      familyId: expect.any(String),
      stratumCount: 4,
      slotCount: 36,
      enqueuedJobCount: 36,
      windowAgeAtEnrollmentMs: 2_000,
    });
  });

  it('10) duplicate invocation does not create second family', async () => {
    const config = makeCanaryConfig();
    const familyId = randomUUID();
    const enrollWindowFamily = jest.fn().mockResolvedValue({
      familyId,
      stratumCount: 4,
      slotCount: 36,
      enqueuedJobCount: 36,
    });
    const enrollment = { enrollWindowFamily } as unknown as ReferenceCaptureExp021MaturationShadowEnrollmentService;
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const now = new Date(canonicalWindowTo.getTime() + 1_000);
    const args = { tokenId: 187336, execute: true, waitNextWindow: false };

    const firstRepository = makeRepositoryMock({ unfinishedFamilies: 0, unfinishedAfterEnroll: 1 });
    const first = await executeCanaryEnrollment({
      args,
      config,
      repository: firstRepository,
      enrollment,
      canonicalWindowTo,
      now,
    });

    const secondRepository = makeRepositoryMock({ unfinishedFamilies: 1 });
    await expect(
      executeCanaryEnrollment({
        args,
        config,
        repository: secondRepository,
        enrollment,
        canonicalWindowTo,
        now,
      }),
    ).rejects.toThrow('Active unfinished maturation shadow families must be 0');

    expect(first).toMatchObject({ familyId });
    expect(enrollWindowFamily).toHaveBeenCalledTimes(1);
  });

  it('11) geometry-specific activity authority preserved', () => {
    const activityAuthorityByGeometry = {
      60_000: { speedKmh: 42, speedSignalFresh: true },
      90_000: { speedKmh: 0, speedSignalFresh: true, vehicleTelemetryFresh: true },
    };
    const plan = buildCanaryDryRunPlan({
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
      tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
      canonicalWindowTo: new Date('2026-09-17T12:00:00.000Z'),
      config: makeCanaryConfig(),
      activityAuthorityByGeometry,
      now: new Date('2026-09-17T12:00:01.000Z'),
    });

    expect(plan.activityClassification60s.class).toBe('ACTIVE_MOTION');
    expect(plan.activityClassification90s.class).toBe('ACTIVE_IDLE');
  });

  it('12) enrollment creates zero provider calls', async () => {
    const config = makeCanaryConfig();
    const repository = makeRepositoryMock();
    const { service: enrollment } = makeEnrollmentMock();
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');

    const result = await executeCanaryEnrollment({
      args: { tokenId: 187336, execute: true, waitNextWindow: false },
      config,
      repository,
      enrollment,
      canonicalWindowTo,
      now: new Date(canonicalWindowTo.getTime() + 1_000),
      providerCallsDuringEnrollment: 0,
    });

    expect(result).toMatchObject({ providerCallsDuringEnrollment: 0 });
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

    expect(plan.plannedAgesMsExact[0]).toBe(8_000);
    expect(plan.plannedAgesMsExact).toContain(30_000);
    expect(plan.expectedStratumCount).toBe(4);
    expect(plan.expectedSlotCount).toBe(4 * plan.plannedAgesMsExact.length);
    expect(plan.expectedEnqueuedJobCount).toBe(plan.expectedSlotCount);
  });

  it('14) execute leaves exactly one active unfinished family', async () => {
    const config = makeCanaryConfig();
    const countUnfinishedFamilies = jest
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);
    const repository = {
      resolveAuthoritativeTokenId: jest.fn().mockResolvedValue(187336),
      countUnfinishedFamilies,
    } as unknown as ReferenceCaptureExp021MaturationShadowRepository;
    const { service: enrollment } = makeEnrollmentMock();

    const result = await executeCanaryEnrollment({
      args: { tokenId: 187336, execute: true, waitNextWindow: false },
      config,
      repository,
      enrollment,
      canonicalWindowTo: new Date('2026-09-17T12:00:00.000Z'),
      now: new Date('2026-09-17T12:00:01.000Z'),
    });

    expect('familyId' in result).toBe(true);
    expect(countUnfinishedFamilies).toHaveBeenCalledTimes(2);
  });

  it('15) wait-next-window only reacts to authoritative KS MX 2024 window', async () => {
    const afterMs = Date.parse('2026-09-17T11:00:00.000Z');
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
              metadataJson: {
                physicalDriveInterval: {
                  physicalStartAt: '2026-09-17T11:00:00.000Z',
                  physicalEndAt: '2026-09-17T12:00:00.000Z',
                  source: 'PDI_CANDIDATE',
                },
              },
            },
          ];
        },
        sleep: async () => undefined,
        now: () => new Date('2026-09-17T12:00:01.000Z'),
      },
      { afterPhysicalEndMs: afterMs, timeoutMs: 10_000, pollMs: 1 },
    );

    expect(waited.experimentId).toBe('authoritative');
    expect(waited.canonicalWindowTo.toISOString()).toBe('2026-09-17T12:00:00.000Z');
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
  });

  it('UNKNOWN_ACTIVITY when independent telemetry authority unavailable', () => {
    const authority = resolveActivityAuthorityFromSignalsLatest(null);
    const plan = buildCanaryDryRunPlan({
      organizationId: EXP021_KS_MX_2024_CANARY.organizationId,
      vehicleId: EXP021_KS_MX_2024_CANARY.vehicleId,
      tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
      canonicalWindowTo: new Date('2026-09-17T12:00:00.000Z'),
      config: makeCanaryConfig(),
      activityAuthorityByGeometry: authority,
      now: new Date('2026-09-17T12:00:01.000Z'),
    });
    expect(plan.activityClassification60s.class).toBe('UNKNOWN_ACTIVITY');
    expect(plan.activityClassification90s.class).toBe('UNKNOWN_ACTIVITY');
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
