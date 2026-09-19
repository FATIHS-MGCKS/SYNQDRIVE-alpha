import { EXP021_CANARY_WINDOW_FRESHNESS_EXECUTION_SLACK_MS } from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import {
  computeCanaryEnrollmentCursorPhysicalEndMs,
  evaluateOperationalEnrollmentFreshness,
  evaluateProspectiveAuthoritativePdiEligibility,
} from './reference-capture-exp021-maturation-shadow-canary-prospective-discovery.lib';
import { waitForNextFreshAuthoritativeWindowClose } from './reference-capture-exp021-maturation-shadow-canary-enroll.lib';
import { ReferenceCaptureConfig } from '../reference-capture.config';
import { EXP021_KS_MX_2024_CANARY } from './reference-capture-exp021-maturation-shadow-canary-enroll.constants';
import { EXP021_MATURATION_SHADOW_FIXED_AGES_MS } from './reference-capture-exp021-maturation-shadow-schedule.lib';

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

const NOT_BEFORE = Date.parse('2026-09-19T13:32:23.000Z');

describe('reference-capture-exp021-maturation-shadow-canary-prospective-discovery.lib', () => {
  it('E3 — historical physical start before NOT_BEFORE is rejected', () => {
    const physicalEndMs = Date.parse('2026-09-19T15:27:09.752Z');
    const result = evaluateProspectiveAuthoritativePdiEligibility({
      authority: {
        physicalStartAt: '2026-09-18T20:00:00.000Z',
        physicalEndAt: '2026-09-19T15:27:09.752Z',
        source: 'CANARY_VEHICLE_TRIP_CONFIRMED',
      },
      physicalEndMs,
      activationNotBeforeMs: NOT_BEFORE,
      enrollmentCursorPhysicalEndMs: NOT_BEFORE - 1,
    });
    expect(result.eligible).toBe(false);
    expect(result.rejectionReason).toBe('physical_start_before_activation_not_before');
  });

  it('E1/E2 — prospective wait accepts PDI visible 379s and 850s after physicalEndAt', async () => {
    for (const lagMs of [379_000, 850_000]) {
      const physicalEnd = '2026-09-19T15:27:09.752Z';
      const physicalEndMs = Date.parse(physicalEnd);
      const pdiVisibleAt = new Date(physicalEndMs + lagMs);
      const result = await waitForNextFreshAuthoritativeWindowClose(
        {
          listSettlementShadowExperiments: async () => [
            {
              id: 'exp-late-pdi',
              updatedAt: pdiVisibleAt,
              metadataJson: {
                physicalDriveInterval: {
                  physicalStartAt: '2026-09-19T15:26:00.000Z',
                  physicalEndAt: physicalEnd,
                  source: 'CANARY_VEHICLE_TRIP_CONFIRMED',
                },
              },
            },
          ],
          sleep: async () => undefined,
          now: () => pdiVisibleAt,
          config: makeCanaryConfig(),
          tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
        },
        {
          afterPhysicalEndMs: NOT_BEFORE - 1,
          activationNotBeforeMs: NOT_BEFORE,
          enrollmentFreshnessMode: 'PROSPECTIVE_PDI_DISCOVERY',
          timeoutMs: 5_000,
          pollMs: 1,
        },
      );
      expect(result.canonicalWindowTo.toISOString()).toBe(new Date(physicalEndMs).toISOString());
    }
  });

  it('operational mode still rejects late wall-clock enrollment (production bug class)', async () => {
    const physicalEnd = '2026-09-19T15:27:09.752Z';
    const physicalEndMs = Date.parse(physicalEnd);
    const detectedAt = new Date(physicalEndMs + 379_000);
    await expect(
      waitForNextFreshAuthoritativeWindowClose(
        {
          listSettlementShadowExperiments: async () => [
            {
              id: 'exp-late',
              updatedAt: detectedAt,
              metadataJson: {
                physicalDriveInterval: {
                  physicalStartAt: '2026-09-19T15:26:00.000Z',
                  physicalEndAt: physicalEnd,
                  source: 'CANARY_VEHICLE_TRIP_CONFIRMED',
                },
              },
            },
          ],
          sleep: async () => undefined,
          now: () => new Date(),
          config: makeCanaryConfig(),
          tokenId: EXP021_KS_MX_2024_CANARY.tokenId,
        },
        {
          afterPhysicalEndMs: NOT_BEFORE - 1,
          enrollmentFreshnessMode: 'OPERATOR_IMMEDIATE',
          timeoutMs: 80,
          pollMs: 1,
        },
      ),
    ).rejects.toThrow('Timed out waiting');
  });

  it('E6 — enrolled cursor uses max enrolled window, not settlement baseline max', () => {
    const cursor = computeCanaryEnrollmentCursorPhysicalEndMs({
      maxEnrolledCanonicalWindowToMs: Date.parse('2026-09-19T16:00:00.000Z'),
      activationNotBeforeMs: NOT_BEFORE,
    });
    expect(cursor).toBe(Date.parse('2026-09-19T16:00:00.000Z'));
    const freshCursor = computeCanaryEnrollmentCursorPhysicalEndMs({
      maxEnrolledCanonicalWindowToMs: null,
      activationNotBeforeMs: NOT_BEFORE,
    });
    expect(freshCursor).toBe(NOT_BEFORE - 1);
  });

  it('PHASE_A — OLD NOT_BEFORE restart would select all seven-shaped forensic PDIs (anti-backfill requires NEW NOT_BEFORE)', () => {
    const OLD_NOT_BEFORE = Date.parse('2026-09-19T13:32:23.000Z');
    const cursor = OLD_NOT_BEFORE - 1;
    const sevenShaped = [
      { start: '2026-09-19T13:45:00.000Z', end: '2026-09-19T14:02:10.000Z' },
      { start: '2026-09-19T14:10:00.000Z', end: '2026-09-19T14:28:40.000Z' },
      { start: '2026-09-19T15:26:00.000Z', end: '2026-09-19T15:27:09.752Z' },
      { start: '2026-09-19T17:00:00.000Z', end: '2026-09-19T17:35:00.000Z' },
    ];
    for (const trip of sevenShaped) {
      const physicalEndMs = Date.parse(trip.end);
      const eligibility = evaluateProspectiveAuthoritativePdiEligibility({
        authority: {
          physicalStartAt: trip.start,
          physicalEndAt: trip.end,
          source: 'CANARY_VEHICLE_TRIP_CONFIRMED',
        },
        physicalEndMs,
        activationNotBeforeMs: OLD_NOT_BEFORE,
        enrollmentCursorPhysicalEndMs: cursor,
      });
      expect(eligibility.eligible).toBe(true);
    }
  });

  it('freshness guard remains earliest-age operational contract', () => {
    const canonicalWindowTo = new Date('2026-09-17T12:00:00.000Z');
    const plannedAges = [8_000, ...EXP021_MATURATION_SHADOW_FIXED_AGES_MS];
    const fresh = evaluateOperationalEnrollmentFreshness(
      canonicalWindowTo,
      plannedAges,
      new Date(canonicalWindowTo.getTime() + 2_000),
      EXP021_CANARY_WINDOW_FRESHNESS_EXECUTION_SLACK_MS,
    );
    expect(fresh.stale).toBe(false);
    const stale = evaluateOperationalEnrollmentFreshness(
      canonicalWindowTo,
      plannedAges,
      new Date(canonicalWindowTo.getTime() + 4_000),
      EXP021_CANARY_WINDOW_FRESHNESS_EXECUTION_SLACK_MS,
    );
    expect(stale.stale).toBe(true);
  });
});
