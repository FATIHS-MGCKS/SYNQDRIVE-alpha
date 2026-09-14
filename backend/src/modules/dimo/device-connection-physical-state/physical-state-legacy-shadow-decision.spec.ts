import { comparePhysicalStateShadowDecisions } from './physical-state-shadow-comparator';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';
import { PhysicalStateCanonicalGate } from './physical-state-authority.types';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { hashProviderDeviceId } from '../device-connection-episode.service';
import {
  buildLegacyBindingKeyFromEpisode,
  buildLegacySnapshotShadowDecision,
  resolveLegacyBindingKey,
} from './physical-state-legacy-shadow-decision';

describe('physical-state-legacy-shadow-decision (snapshot)', () => {
  const currentBinding = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 200001 });
  const oldTokenHash = hashProviderDeviceId('DIMO', 100001);
  const oldBindingKey = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: 100001 }).bindingKey;

  const scope = { organizationId: 'org', vehicleId: 'veh', provider: 'DIMO' };

  function compareSnapshotShadow(input: {
    legacyShadow: ReturnType<typeof buildLegacySnapshotShadowDecision>;
    physicalBindingKey: string;
    physicalAccepted: boolean;
    physicalState: 'PLUGGED' | 'UNPLUGGED';
    physicalTs: string;
  }) {
    return comparePhysicalStateShadowDecisions({
      scope,
      legacyDecision: {
        accepted: input.legacyShadow.accepted,
        gate: PhysicalStateCanonicalGate.LEGACY,
      },
      physicalDecision: {
        accepted: input.physicalAccepted,
        gate: PhysicalStateCanonicalGate.PHYSICAL,
        effectiveState: input.physicalState,
      },
      legacyEffectivePlugState: input.legacyShadow.effectivePlugState,
      legacyEvidenceObservedAt: input.legacyShadow.evidenceObservedAt?.toISOString() ?? null,
      evidenceObservedAt: input.physicalTs,
      legacyBindingKey: input.legacyShadow.bindingKey,
      physicalBindingKey: input.physicalBindingKey,
      bindingKey: input.physicalBindingKey,
    });
  }

  it('A. same legacy + physical binding => no BINDING_DIVERGENCE', () => {
    const legacyShadow = buildLegacySnapshotShadowDecision({
      evaluation: { action: 'resolve', providerObservedAt: new Date(), resolvedAt: new Date() },
      episode: {
        id: 'ep',
        organizationId: 'org',
        vehicleId: 'veh',
        provider: 'DIMO',
        deviceBindingId: null,
        providerDeviceIdHash: currentBinding.providerDeviceIdHash,
        openedAt: new Date(),
        openedByEventId: null,
        openedReason: 'OBD_DEVICE_UNPLUGGED_WEBHOOK',
        status: 'OPEN',
        resolvedAt: null,
        resolutionMethod: null,
        resolutionEvidenceAt: null,
        resolutionEventId: null,
        resolutionSnapshotId: null,
        reviewReasonCodes: [],
        stateVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      lastLegacyEvent: null,
    });
    const result = compareSnapshotShadow({
      legacyShadow,
      physicalBindingKey: currentBinding.bindingKey,
      physicalAccepted: true,
      physicalState: 'PLUGGED',
      physicalTs: '2026-09-12T15:00:00.000Z',
    });
    expect(result.classification).not.toBe(PhysicalStateShadowClassification.BINDING_DIVERGENCE);
  });

  it('B. legacy episode old token vs current physical token => BINDING_DIVERGENCE', () => {
    const legacyShadow = buildLegacySnapshotShadowDecision({
      evaluation: { action: 'reject', reason: 'token_binding_mismatch' },
      episode: {
        id: 'ep',
        organizationId: 'org',
        vehicleId: 'veh',
        provider: 'DIMO',
        deviceBindingId: null,
        providerDeviceIdHash: oldTokenHash,
        openedAt: new Date('2026-09-12T14:00:00.000Z'),
        openedByEventId: null,
        openedReason: 'OBD_DEVICE_UNPLUGGED_WEBHOOK',
        status: 'OPEN',
        resolvedAt: null,
        resolutionMethod: null,
        resolutionEvidenceAt: null,
        resolutionEventId: null,
        resolutionSnapshotId: null,
        reviewReasonCodes: [],
        stateVersion: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      lastLegacyEvent: {
        eventType: 'OBD_DEVICE_UNPLUGGED',
        observedAt: new Date('2026-09-12T14:00:00.000Z'),
        tokenId: 100001,
        provider: 'DIMO',
      },
    });
    expect(legacyShadow.bindingKey).toBe(oldBindingKey);
    const result = compareSnapshotShadow({
      legacyShadow,
      physicalBindingKey: currentBinding.bindingKey,
      physicalAccepted: true,
      physicalState: 'PLUGGED',
      physicalTs: '2026-09-12T15:00:00.000Z',
    });
    expect(result.classification).toBe(PhysicalStateShadowClassification.BINDING_DIVERGENCE);
  });

  it('C. legacy binding derived from persisted event token when no episode', () => {
    const bindingKey = resolveLegacyBindingKey({
      episode: null,
      lastLegacyEvent: {
        eventType: 'OBD_DEVICE_UNPLUGGED',
        observedAt: new Date('2026-09-12T14:00:00.000Z'),
        tokenId: 100001,
        provider: 'DIMO',
      },
    });
    expect(bindingKey).toBe(oldBindingKey);
  });

  it('E. unknown legacy state remains null and is never synthesized from candidate', () => {
    const legacyShadow = buildLegacySnapshotShadowDecision({
      evaluation: { action: 'reject', reason: 'no_open_episode' },
      episode: null,
      lastLegacyEvent: null,
    });
    expect(legacyShadow.effectivePlugState).toBeNull();
    expect(legacyShadow.bindingKey).toBeNull();
  });

  it('buildLegacyBindingKeyFromEpisode returns null without persisted hash', () => {
    expect(buildLegacyBindingKeyFromEpisode(null)).toBeNull();
  });
});
