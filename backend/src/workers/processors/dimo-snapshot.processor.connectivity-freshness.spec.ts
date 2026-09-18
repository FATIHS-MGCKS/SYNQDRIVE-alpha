import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import {
  DimoSnapshotProcessor,
  type DimoSnapshotJobData,
} from './dimo-snapshot.processor';

/**
 * Proves VW-F-008 ordering: physical snapshot evidence runs only after eligible
 * VLS upsert, never on stale-monotonic skip.
 */
describe('DimoSnapshotProcessor — connectivity freshness ordering', () => {
  const vehicleId = 'arteon-veh';
  const dimoTokenId = 187336;
  const T_UNPLUG = '2026-09-17T08:07:14.000Z';
  const T_STALE = '2026-09-16T10:36:56.000Z';

  const buildSignals = (lastSeen: string, obdPlugged: boolean) => ({
    lastSeen,
    obdIsPluggedIn: { value: obdPlugged, timestamp: lastSeen },
  });

  const buildHarness = (input: {
    previousSourceTimestamp: string | null;
    incomingLastSeen: string;
    obdPlugged: boolean;
  }) => {
    const applyPhysicalSnapshotEvidence = jest.fn().mockResolvedValue(null);

    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org-arteon',
          hardwareType: 'LTE_R1',
          dimoVehicle: { connectionStatus: 'DISCONNECTED' },
          dataSourceLinks: [{ id: 'link-1', sourceSubtype: null }],
        }),
      },
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue(
          input.previousSourceTimestamp
            ? {
                id: 'vls-arteon',
                sourceTimestamp: new Date(input.previousSourceTimestamp),
              }
            : null,
        ),
        upsert: jest.fn().mockResolvedValue({
          id: 'vls-arteon-upserted',
          sourceTimestamp: new Date(input.incomingLastSeen),
        }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dimoPollLog: {
        create: jest.fn().mockResolvedValue({ id: 'poll-1' }),
      },
      vehicleTripDetectionState: {
        findUnique: jest.fn().mockResolvedValue({ state: 'RESTING' }),
      },
    };

    const dimoAuth = { getVehicleJwt: jest.fn().mockResolvedValue('jwt') };
    const dimoTelemetry = {
      fetchLatestVehicleSnapshot: jest.fn().mockResolvedValue({
        signalsLatest: buildSignals(input.incomingLastSeen, input.obdPlugged),
      }),
    };
    const tripOrchestration = {
      evaluateSnapshotForTripStart: jest.fn().mockResolvedValue(undefined),
    };
    const batteryObservationProducer = {
      classifyAndEnqueue: jest.fn().mockResolvedValue(null),
    };
    const snapshotPhysicalEvidenceOrchestrator = {
      applyPhysicalSnapshotEvidence,
    };

    const processor = new DimoSnapshotProcessor(
      dimoAuth as never,
      dimoTelemetry as never,
      prisma as never,
      tripOrchestration as never,
      batteryObservationProducer as never,
      undefined as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      snapshotPhysicalEvidenceOrchestrator as never,
      undefined,
    );

    const job = {
      id: 'job-connectivity',
      data: { vehicleId, dimoTokenId },
    } as unknown as Job<DimoSnapshotJobData>;

    return { processor, job, prisma, applyPhysicalSnapshotEvidence };
  };

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stale VLS monotonic skip does not invoke physical snapshot evidence', async () => {
    const h = buildHarness({
      previousSourceTimestamp: T_UNPLUG,
      incomingLastSeen: T_STALE,
      obdPlugged: false,
    });

    await h.processor.process(h.job);

    expect(h.applyPhysicalSnapshotEvidence).not.toHaveBeenCalled();
    expect(h.prisma.vehicleLatestState.upsert).not.toHaveBeenCalled();
    expect(h.prisma.vehicleLatestState.update).toHaveBeenCalled();
  });

  it('eligible snapshot invokes physical evidence after VLS upsert with pre-upsert baseline', async () => {
    const h = buildHarness({
      previousSourceTimestamp: T_STALE,
      incomingLastSeen: T_UNPLUG,
      obdPlugged: false,
    });

    await h.processor.process(h.job);

    expect(h.prisma.vehicleLatestState.upsert).toHaveBeenCalled();
    expect(h.applyPhysicalSnapshotEvidence).toHaveBeenCalledTimes(1);
    expect(h.applyPhysicalSnapshotEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        vehicleLatestStateId: 'vls-arteon-upserted',
        existingVlsSourceTimestamp: new Date(T_STALE),
        signals: buildSignals(T_UNPLUG, false),
      }),
    );
  });

  it('Arteon replay shape: equal lastSeen still calls orchestrator with equal pre-upsert baseline', async () => {
    const h = buildHarness({
      previousSourceTimestamp: T_UNPLUG,
      incomingLastSeen: T_UNPLUG,
      obdPlugged: false,
    });

    await h.processor.process(h.job);

    expect(h.prisma.vehicleLatestState.upsert).toHaveBeenCalled();
    expect(h.applyPhysicalSnapshotEvidence).toHaveBeenCalledTimes(1);
    expect(h.applyPhysicalSnapshotEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        existingVlsSourceTimestamp: new Date(T_UNPLUG),
      }),
    );
  });
});
