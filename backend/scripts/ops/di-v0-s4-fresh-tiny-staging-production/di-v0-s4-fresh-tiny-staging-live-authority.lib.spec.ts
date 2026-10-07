import {
  evaluateLiveStagingAuthorizationGate,
  evaluateNoBackfillFinalTripGate,
  readLiveStagingAuthorizationPacketFromEnv,
  type LiveStagingObservedExecutionPacket,
} from './di-v0-s4-fresh-tiny-staging-live-authority.lib';
import { deriveInternallyComputedFreshFingerprint } from './di-v0-s4-fresh-tiny-staging-production.lib';

const ORG = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
const VEH = 'c10351f8-b6a2-4258-947f-631aeaa6d359';
const NB = '2026-10-07T16:00:00.000Z';
const FP = deriveInternallyComputedFreshFingerprint(NB, ORG, VEH);
const TOOL = 'cccccccccccccccccccccccccccccccccccccccc';
const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RELEASE = 'release_test';
const ENV_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function authPacket() {
  return {
    authorizedToolSha: TOOL,
    authorizedProductionSha: SHA,
    authorizedProductionReleaseId: RELEASE,
    authorizedPreEnvSha256: ENV_SHA,
    authorizedFreshNotBefore: NB,
    authorizedFreshExpectedFingerprint: FP,
    authorizedOrganizationAllowlist: ORG,
    authorizedVehicleAllowlist: VEH,
  };
}

function observedPacket(overrides: Partial<LiveStagingObservedExecutionPacket> = {}) {
  return {
    actualToolSha: TOOL,
    actualProductionSha: SHA,
    actualProductionReleaseId: RELEASE,
    actualPreEnvSha256: ENV_SHA,
    actualFreshNotBefore: NB,
    actualFreshExpectedFingerprint: FP,
    actualOrganizationAllowlist: ORG,
    actualVehicleAllowlist: VEH,
    ...overrides,
  };
}

describe('S4F-7Y live authorization packet', () => {
  it('PASS when S4F-7Y authorized and packets match', () => {
    const r = evaluateLiveStagingAuthorizationGate({
      operatorAck: 'YES',
      liveStagingAuthorized: 'YES',
      legacyS4f7vLiveAuthorized: 'NO',
      testHarnessActive: true,
      accidentalFixtureControlsPresent: true,
      packet: authPacket(),
      observed: observedPacket(),
    });
    expect(r.ok).toBe(true);
  });

  it('FAIL without DI_S4F7Y_LIVE_STAGING_AUTHORIZED', () => {
    const r = evaluateLiveStagingAuthorizationGate({
      operatorAck: 'YES',
      liveStagingAuthorized: 'NO',
      packet: authPacket(),
      observed: observedPacket(),
    });
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('LIVE_STAGING_NOT_AUTHORIZED');
  });

  it('FAIL legacy S4F7V alone', () => {
    const r = evaluateLiveStagingAuthorizationGate({
      operatorAck: 'YES',
      liveStagingAuthorized: 'NO',
      legacyS4f7vLiveAuthorized: 'YES',
      packet: authPacket(),
      observed: observedPacket(),
    });
    expect(r.ok).toBe(false);
    expect(r.failures).toContain('LEGACY_S4F7V_ALONE_INSUFFICIENT');
  });

  it('FAIL ACK alone without live authorization', () => {
    const r = evaluateLiveStagingAuthorizationGate({
      operatorAck: 'YES',
      liveStagingAuthorized: 'NO',
      packet: authPacket(),
      observed: observedPacket(),
    });
    expect(r.failures).toContain('LIVE_STAGING_NOT_AUTHORIZED');
  });

  it('FAIL tool SHA mismatch', () => {
    const r = evaluateLiveStagingAuthorizationGate({
      operatorAck: 'YES',
      liveStagingAuthorized: 'YES',
      testHarnessActive: true,
      packet: authPacket(),
      observed: observedPacket({ actualToolSha: 'd'.repeat(40) }),
    });
    expect(r.failures).toContain('AUTHORIZED_TOOL_SHA_MISMATCH');
  });

  it('FAIL production SHA mismatch', () => {
    const r = evaluateLiveStagingAuthorizationGate({
      operatorAck: 'YES',
      liveStagingAuthorized: 'YES',
      testHarnessActive: true,
      packet: authPacket(),
      observed: observedPacket({ actualProductionSha: 'e'.repeat(40) }),
    });
    expect(r.failures).toContain('AUTHORIZED_PRODUCTION_SHA_MISMATCH');
  });

  it('FAIL fixture controls without test harness', () => {
    const r = evaluateLiveStagingAuthorizationGate({
      operatorAck: 'YES',
      liveStagingAuthorized: 'YES',
      testHarnessActive: false,
      accidentalFixtureControlsPresent: true,
      packet: authPacket(),
      observed: observedPacket(),
    });
    expect(r.failures).toContain('TEST_FIXTURE_IN_LIVE_PATH');
  });

  it('reads packet from env', () => {
    const prev = process.env;
    process.env = {
      ...prev,
      AUTHORIZED_TOOL_SHA: TOOL,
      AUTHORIZED_PRODUCTION_SHA: SHA,
      AUTHORIZED_PRODUCTION_RELEASE_ID: RELEASE,
      AUTHORIZED_PRE_ENV_SHA256: ENV_SHA,
      AUTHORIZED_FRESH_NOT_BEFORE: NB,
      AUTHORIZED_FRESH_EXPECTED_FINGERPRINT: FP,
      AUTHORIZED_ORGANIZATION_ALLOWLIST: ORG,
      AUTHORIZED_VEHICLE_ALLOWLIST: VEH,
    };
    const p = readLiveStagingAuthorizationPacketFromEnv();
    expect(p.authorizedFreshNotBefore).toBe(NB);
    process.env = prev;
  });
});

describe('S4F-7Y NO_BACKFILL final trip gate', () => {
  it('PASS with zero eligible trips', () => {
    expect(
      evaluateNoBackfillFinalTripGate({
        authorizedFreshNotBeforeCanonical: NB,
        latestCompletedTripEndTime: '2026-10-07T15:00:00.000Z',
        completedTripEndTimeInFutureCount: 0,
        existingEligibleCompletedTripCount: 0,
      }).ok,
    ).toBe(true);
  });

  it('FAIL when trip completed after cutoff', () => {
    const r = evaluateNoBackfillFinalTripGate({
      authorizedFreshNotBeforeCanonical: NB,
      latestCompletedTripEndTime: '2026-10-07T17:00:00.000Z',
      completedTripEndTimeInFutureCount: 0,
      existingEligibleCompletedTripCount: 1,
    });
    expect(r.ok).toBe(false);
  });

  it('FAIL future-dated trip count', () => {
    const r = evaluateNoBackfillFinalTripGate({
      authorizedFreshNotBeforeCanonical: NB,
      latestCompletedTripEndTime: null,
      completedTripEndTimeInFutureCount: 1,
      existingEligibleCompletedTripCount: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('FUTURE_TRIP_END');
  });
});
