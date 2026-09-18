import { DeviceConnectionPhysicalTransitionDecision } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalStateEvidenceWriterService } from './physical-state-evidence-writer.service';
import { PhysicalStateSnapshotEvidenceOrchestrator } from './physical-state-snapshot-evidence-orchestrator.service';
import { PhysicalStateShadowClassification } from './physical-state-shadow.classification';

describe('PhysicalStateSnapshotEvidenceOrchestrator — connectivity freshness semantics', () => {
  const T0 = '2026-09-16T10:36:56.000Z';
  const T1 = '2026-09-17T08:07:14.000Z';
  const T2 = '2026-09-18T00:03:43.588Z';
  const T3 = '2026-09-18T12:00:00.000Z';

  let orchestrator: PhysicalStateSnapshotEvidenceOrchestrator;
  let prisma: {
    deviceConnectionEpisode: { findFirst: jest.Mock };
    dimoDeviceConnectionEvent: { findFirst: jest.Mock };
    deviceConnectionPhysicalState: { findFirst: jest.Mock };
  };
  let writer: {
    shouldRoutePhysicalAuthority: jest.Mock;
    isWriterCapable: jest.Mock;
    writeSnapshotEvidence: jest.Mock;
  };

  const baseInput = {
    organizationId: 'org-arteon',
    vehicleId: '8c850ff1-4201-432b-af2e-2711dbc7ca48',
    tokenId: 187336,
    providerBindingId: null,
    hardwareType: 'LTE_R1',
    sourceSubtype: null,
    fetchedAt: new Date(T2),
    vehicleLatestStateId: 'vls-arteon',
  };

  function snapshotInput(
    plugged: boolean,
    timestamp: string,
    existingVlsSourceTimestamp: Date | null,
  ) {
    return {
      ...baseInput,
      signals: { obdIsPluggedIn: { value: plugged, timestamp } },
      existingVlsSourceTimestamp,
    };
  }

  beforeEach(() => {
    prisma = {
      deviceConnectionEpisode: { findFirst: jest.fn().mockResolvedValue(null) },
      dimoDeviceConnectionEvent: { findFirst: jest.fn().mockResolvedValue(null) },
      deviceConnectionPhysicalState: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    writer = {
      shouldRoutePhysicalAuthority: jest.fn().mockResolvedValue(false),
      isWriterCapable: jest.fn().mockReturnValue(true),
      writeSnapshotEvidence: jest.fn().mockResolvedValue({
        physicalDecision: DeviceConnectionPhysicalTransitionDecision.APPLIED,
        shadowComparison: {
          classification: PhysicalStateShadowClassification.EXPECTED_FIX_OLD_REJECT_NEW_ACCEPT,
          correctnessBlocking: false,
        },
      }),
    };
    orchestrator = new PhysicalStateSnapshotEvidenceOrchestrator(
      prisma as unknown as PrismaService,
      writer as unknown as PhysicalStateEvidenceWriterService,
    );
  });

  it('STALE PLUGGED bootstrap: equal-ts cached PLUG replay skips writer', async () => {
    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput(true, T1, new Date(T1)),
    );
    expect(result).toBeNull();
    expect(writer.writeSnapshotEvidence).not.toHaveBeenCalled();
  });

  it('STALE UNPLUG replay: equal-ts cached UNPLUG skips writer', async () => {
    prisma.deviceConnectionPhysicalState.findFirst.mockResolvedValue({
      effectiveState: 'UNPLUGGED',
      evidenceObservedAt: new Date(T1),
    });
    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput(false, T1, new Date(T1)),
    );
    expect(result).toBeNull();
    expect(writer.writeSnapshotEvidence).not.toHaveBeenCalled();
  });

  it('STALE PLUG replay while offline: older OBD ts skips writer', async () => {
    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput(true, T0, new Date(T1)),
    );
    expect(result).toBeNull();
    expect(writer.writeSnapshotEvidence).not.toHaveBeenCalled();
  });

  it('FRESH UNPLUG: newer OBD ts invokes writer with obd_false legacy path', async () => {
    prisma.deviceConnectionPhysicalState.findFirst.mockResolvedValue({
      effectiveState: 'PLUGGED',
      evidenceObservedAt: new Date(T0),
    });
    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput(false, T1, new Date(T0)),
    );
    expect(result).not.toBeNull();
    expect(writer.writeSnapshotEvidence).toHaveBeenCalledTimes(1);
    expect(writer.writeSnapshotEvidence.mock.calls[0][0].gtR1Proof?.scenario).toBe(
      'SNAPSHOT_UNPLUG_TRANSITION',
    );
  });

  it('FRESH reconnect via snapshot: newer PLUG OBD invokes writer', async () => {
    prisma.dimoDeviceConnectionEvent.findFirst.mockResolvedValue({
      eventType: 'OBD_DEVICE_UNPLUGGED',
      observedAt: new Date(T1),
      tokenId: 187336,
      provider: 'DIMO',
    });
    prisma.deviceConnectionPhysicalState.findFirst.mockResolvedValue({
      effectiveState: 'UNPLUGGED',
      evidenceObservedAt: new Date(T1),
    });
    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput(true, T3, new Date(T1)),
    );
    expect(result).not.toBeNull();
    expect(writer.writeSnapshotEvidence).toHaveBeenCalledTimes(1);
    expect(writer.writeSnapshotEvidence.mock.calls[0][0].gtR1Proof?.scenario).toBe(
      'SNAPSHOT_PLUG_REPAIR_UNPLUGGED_BASELINE',
    );
  });

  it('ARTEON exact: wrong PLUGGED projection + equal-ts UNPLUG replay skips writer', async () => {
    prisma.deviceConnectionPhysicalState.findFirst.mockResolvedValue({
      effectiveState: 'PLUGGED',
      evidenceObservedAt: new Date(T0),
    });
    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput(false, T1, new Date(T1)),
    );
    expect(result).toBeNull();
    expect(writer.writeSnapshotEvidence).not.toHaveBeenCalled();
  });

  it('intentional non-bootstrap: absent projection + equal-ts UNPLUG is ineligible (no false certainty)', async () => {
    const result = await orchestrator.applyPhysicalSnapshotEvidence(
      snapshotInput(false, T1, new Date(T1)),
    );
    expect(result).toBeNull();
    expect(writer.writeSnapshotEvidence).not.toHaveBeenCalled();
    expect(prisma.deviceConnectionPhysicalState.findFirst).not.toHaveBeenCalled();
  });
});
