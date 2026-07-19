import {
  DeviceConnectionEpisodeOpenedReason,
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import {
  buildCanonicalDeviceBinding,
  bindingScopeChanged,
  bindingScopeMatches,
  classifyBindingSource,
} from './device-binding-lifecycle';
import { EpisodeConflictReasonCode } from './device-connection-episode-conflict';
import {
  evaluateHistoricalSnapshotBackfill,
  evaluateLateUnplugAgainstRecovery,
  evaluatePlugCloseEligibility,
} from './device-connection-event-order';
import { hashProviderDeviceId } from './device-connection-episode.service';
import { DEFAULT_TELEMETRY_RECOVERY_POLICY } from './device-connection-episode-resolution/device-connection-telemetry-recovery.policy';
import { evaluateSnapshotPlugResolution } from './device-connection-episode-resolution/device-connection-episode-resolution.snapshot-evaluator';

describe('device-binding-lifecycle', () => {
  it('classifies physical R1, OEM, and synthetic bindings', () => {
    expect(classifyBindingSource({ hardwareType: 'LTE_R1', sourceSubtype: null })).toBe(
      'PHYSICAL_OBD_LTE_R1',
    );
    expect(
      classifyBindingSource({ hardwareType: 'SMART5', sourceSubtype: 'OEM_API' }),
    ).toBe('OEM_API');
    expect(
      classifyBindingSource({ hardwareType: 'LTE_R1', sourceSubtype: 'SYNTHETIC_ONLY' }),
    ).toBe('SYNTHETIC_ONLY');
  });

  it('detects token and binding scope changes', () => {
    const bindingA = buildCanonicalDeviceBinding({
      provider: 'DIMO',
      dimoTokenId: 42,
      hardwareType: 'LTE_R1',
      link: {
        id: 'binding-a',
        sourceType: 'DIMO',
        sourceSubtype: null,
        sourceReferenceId: 'ref-a',
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deactivatedAt: null,
      },
    });
    const bindingB = buildCanonicalDeviceBinding({
      provider: 'DIMO',
      dimoTokenId: 99,
      hardwareType: 'LTE_R1',
      link: {
        id: 'binding-b',
        sourceType: 'DIMO',
        sourceSubtype: null,
        sourceReferenceId: 'ref-b',
        activatedAt: new Date('2026-07-01T00:00:00.000Z'),
        deactivatedAt: null,
      },
    });

    const episode = {
      deviceBindingId: 'binding-a',
      providerDeviceIdHash: hashProviderDeviceId('DIMO', 42),
    };

    expect(bindingScopeMatches(episode, bindingA)).toBe(true);
    expect(bindingScopeMatches(episode, bindingB)).toBe(false);
    expect(bindingScopeChanged(episode, bindingB)).toBe(true);
  });
});

describe('device-connection-event-order', () => {
  const unplugAt = new Date('2026-07-08T17:21:19.000Z');
  const recoveryAt = new Date('2026-07-09T08:00:00.000Z');

  it('ignores late unplug after telemetry recovery', () => {
    const decision = evaluateLateUnplugAgainstRecovery({
      unplugObservedAt: new Date('2026-07-08T17:00:00.000Z'),
      unplugReceivedAt: new Date('2026-07-10T10:00:00.000Z'),
      latestClosedEpisode: {
        openedAt: unplugAt,
        status: 'RESOLVED',
        resolutionEvidenceAt: recoveryAt,
        resolutionMethod: DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
      },
      openEpisodeForBinding: null,
    });
    expect(decision).toEqual({
      action: 'ignore',
      reason: EpisodeConflictReasonCode.STALE_UNPLUG_AFTER_RECOVERY,
    });
  });

  it('rejects plug observed before unplug', () => {
    const decision = evaluatePlugCloseEligibility({
      openEpisode: { openedAt: unplugAt, status: 'OPEN', resolutionEvidenceAt: null, resolutionMethod: null },
      plugObservedAt: new Date('2026-07-08T17:00:00.000Z'),
      plugReceivedAt: new Date('2026-07-08T18:00:00.000Z'),
      bindingMatches: true,
    });
    expect(decision).toEqual({ action: 'reject', reason: 'plug_before_unplug' });
  });

  it('allows plug only when observed after unplug', () => {
    const decision = evaluatePlugCloseEligibility({
      openEpisode: { openedAt: unplugAt, status: 'OPEN', resolutionEvidenceAt: null, resolutionMethod: null },
      plugObservedAt: new Date('2026-07-08T18:00:00.000Z'),
      plugReceivedAt: new Date('2026-07-08T18:00:05.000Z'),
      bindingMatches: true,
    });
    expect(decision).toEqual({ action: 'resolve' });
  });

  it('rejects historical snapshot backfill for current episode', () => {
    const decision = evaluateHistoricalSnapshotBackfill({
      providerObservedAt: new Date('2026-07-08T17:00:00.000Z'),
      receivedAt: new Date('2026-07-08T18:00:00.000Z'),
      episodeOpenedAt: unplugAt,
      maxBackfillLagMs: DEFAULT_TELEMETRY_RECOVERY_POLICY.maxBackfillLagMs,
    });
    expect(decision).toEqual({
      action: 'reject',
      reason: EpisodeConflictReasonCode.HISTORICAL_BACKFILL_SNAPSHOT,
    });
  });

  it('snapshot evaluator rejects token binding mismatch', () => {
    const result = evaluateSnapshotPlugResolution(
      {
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        provider: 'DIMO',
        hardwareType: 'LTE_R1',
        obdIsPluggedIn: true,
        providerObservedAt: new Date('2026-07-08T18:00:00.000Z'),
        receivedAt: new Date('2026-07-08T18:00:05.000Z'),
        snapshotSource: 'dimo',
        providerBindingId: 'binding-1',
        providerDeviceIdHash: hashProviderDeviceId('DIMO', 99),
        snapshotReferenceId: 'snap-1',
        sourceSubtype: null,
      },
      {
        id: 'ep-1',
        organizationId: 'org-a',
        vehicleId: 'veh-1',
        provider: 'DIMO',
        deviceBindingId: 'binding-1',
        providerDeviceIdHash: hashProviderDeviceId('DIMO', 42),
        openedAt: unplugAt,
        openedByEventId: 'evt-1',
        openedReason: DeviceConnectionEpisodeOpenedReason.OBD_DEVICE_UNPLUGGED_WEBHOOK,
        status: DeviceConnectionEpisodeStatus.OPEN,
        resolvedAt: null,
        resolutionMethod: null,
        resolutionEvidenceAt: null,
        resolutionEventId: null,
        resolutionSnapshotId: null,
        reviewReasonCodes: [],
        stateVersion: 1,
        createdAt: unplugAt,
        updatedAt: unplugAt,
      },
    );
    expect(result).toEqual({ action: 'reject', reason: 'token_binding_mismatch' });
  });
});

describe('INCIDENT stable binding', () => {
  it('does not treat stable binding incident as binding drift', () => {
    const binding = buildCanonicalDeviceBinding({
      provider: 'DIMO',
      dimoTokenId: 1001,
      hardwareType: 'LTE_R1',
      link: {
        id: 'binding-incident',
        sourceType: 'DIMO',
        sourceSubtype: null,
        sourceReferenceId: 'ref-incident',
        activatedAt: new Date('2026-01-01T00:00:00.000Z'),
        deactivatedAt: null,
      },
    });
    const episode = {
      deviceBindingId: 'binding-incident',
      providerDeviceIdHash: hashProviderDeviceId('DIMO', 1001),
    };
    expect(bindingScopeChanged(episode, binding)).toBe(false);
  });
});
