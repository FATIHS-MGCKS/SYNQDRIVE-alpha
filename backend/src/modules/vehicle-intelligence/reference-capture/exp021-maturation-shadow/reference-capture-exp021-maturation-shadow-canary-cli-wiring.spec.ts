import { ReferenceCaptureConfig } from '../reference-capture.config';
import { EXP021_KS_MX_2024_CANARY } from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import {
  computeCanaryWaitAfterPhysicalEndMs,
  waitForNextCanaryWindowWithRefreshingDb,
} from './reference-capture-exp021-maturation-shadow-canary-cli-wiring.lib';

const RUNTIME_SHA = 'exp021-canary-cli-wiring-test-sha';

function makeCanaryConfig(): ReferenceCaptureConfig {
  return {
    isExp021MaturationShadowEnabled: () => true,
    isExp021MaturationShadowHfLaneEnabled: () => true,
    isExp021MaturationShadowSettlementLaneEnabled: () => true,
    getExp021MaturationShadowAllowlistTokenIds: () => [EXP021_KS_MX_2024_CANARY.tokenId],
    getExp021MaturationShadowMaxActiveFamilies: () => 1,
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

function authoritativeExperiment(
  physicalEndAt: string,
  id: string,
): { id: string; updatedAt: Date; metadataJson: { physicalDriveInterval: object } } {
  return {
    id,
    updatedAt: new Date(physicalEndAt),
    metadataJson: {
      physicalDriveInterval: {
        physicalStartAt: '2026-09-17T11:00:00.000Z',
        physicalEndAt,
        source: 'PDI_CANDIDATE',
      },
    },
  };
}

describe('reference-capture-exp021-maturation-shadow-canary-cli-wiring.lib', () => {
  beforeEach(() => {
    process.env.GITHUB_SHA = RUNTIME_SHA;
  });

  it('ACTUAL_CLI_WAIT_WIRING: discovers window B after startup baseline A via refreshed DB loads', async () => {
    const windowA = '2026-09-17T12:00:00.000Z';
    const windowB = '2026-09-17T13:00:00.000Z';
    const startupSnapshot = [authoritativeExperiment(windowA, 'exp-a')];
    let dbLoadCount = 0;

    const loadSettlementShadowExperiments = jest.fn(async () => {
      dbLoadCount += 1;
      if (dbLoadCount === 1) {
        return startupSnapshot;
      }
      return [authoritativeExperiment(windowA, 'exp-a'), authoritativeExperiment(windowB, 'exp-b')];
    });

    const afterPhysicalEndMs = computeCanaryWaitAfterPhysicalEndMs(startupSnapshot);
    expect(afterPhysicalEndMs).toBe(Date.parse(windowA));

    const result = await waitForNextCanaryWindowWithRefreshingDb(
      {
        startupBaselineExperiments: startupSnapshot,
        loadSettlementShadowExperiments,
        sleep: async () => undefined,
        now: () => new Date('2026-09-17T13:00:01.000Z'),
        config: makeCanaryConfig(),
        tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
      },
      { timeoutMs: 10_000, pollMs: 1 },
    );

    expect(loadSettlementShadowExperiments).toHaveBeenCalledTimes(2);
    expect(result.experimentId).toBe('exp-b');
    expect(result.canonicalWindowTo.toISOString()).toBe(windowB);
    expect(result.staleWindowsSkipped).toBe(0);
    expect(dbLoadCount).toBeGreaterThan(1);
  });

  it('startup baseline A cannot satisfy wait selection when only stale A appears in polls', async () => {
    const windowA = '2026-09-17T12:00:00.000Z';
    const startupSnapshot = [authoritativeExperiment(windowA, 'exp-a')];
    let dbLoadCount = 0;
    const startedMs = Date.now();

    const loadSettlementShadowExperiments = jest.fn(async () => {
      dbLoadCount += 1;
      return startupSnapshot;
    });

    await expect(
      waitForNextCanaryWindowWithRefreshingDb(
        {
          startupBaselineExperiments: startupSnapshot,
          loadSettlementShadowExperiments,
          sleep: async () => undefined,
          now: () => new Date(),
          config: makeCanaryConfig(),
          tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
        },
        { timeoutMs: 20, pollMs: 1 },
      ),
    ).rejects.toThrow('Timed out waiting for next fresh authoritative');

    expect(Date.now() - startedMs).toBeGreaterThanOrEqual(15);
    expect(loadSettlementShadowExperiments.mock.calls.length).toBeGreaterThan(1);
    expect(dbLoadCount).toBeGreaterThan(1);
  });
});
