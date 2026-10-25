import { DiV0MotionCoreShadowTripMapReadService } from '../di-v0-motion-core-shadow-trip-map-read.service';
import { DiV0MotionCoreShadowRunRepository } from '../di-v0-motion-core-shadow-run.repository';
import type { PrismaService } from '@shared/database/prisma.service';

describe('DiV0MotionCoreShadowTripMapReadService — run selection', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-1';
  const tripId = 'trip-1';

  function makeService(mocks: {
    findLatestRunForTrip: jest.Mock;
    findLatestSucceededRunForTrip: jest.Mock;
    vehicleTrip?: jest.Mock;
    pendingOutbox?: boolean;
  }) {
    const prisma = {
      vehicleTrip: {
        findFirst: mocks.vehicleTrip ?? jest.fn().mockResolvedValue({ id: tripId }),
      },
      $queryRaw: jest.fn().mockResolvedValue(mocks.pendingOutbox ? [{ status: 'PENDING' }] : []),
    };
    const service = new DiV0MotionCoreShadowTripMapReadService(prisma as unknown as PrismaService);
    const runs = (service as unknown as { runs: DiV0MotionCoreShadowRunRepository }).runs;
    jest.spyOn(runs, 'findLatestRunForTrip').mockImplementation(mocks.findLatestRunForTrip);
    jest.spyOn(runs, 'findLatestSucceededRunForTrip').mockImplementation(mocks.findLatestSucceededRunForTrip);
    return { service, runs };
  }

  it('returns NOT_AVAILABLE when no motion run, outbox, or failed run (legacy trips without S4 WI)', async () => {
    const { service } = makeService({
      findLatestRunForTrip: jest.fn().mockResolvedValue(null),
      findLatestSucceededRunForTrip: jest.fn().mockResolvedValue(null),
      pendingOutbox: false,
    });
    const res = await service.readForTrip(organizationId, vehicleId, tripId);
    expect(res.status).toBe('NOT_AVAILABLE');
  });

  it('returns FAILED when only non-succeeded runs exist', async () => {
    const { service, runs } = makeService({
      findLatestRunForTrip: jest.fn().mockResolvedValue({
        id: 'run-fail',
        shadowStatus: 'FAILED',
        workItemId: 'wi',
        pinnedSnapshotHash: 'hash',
        combinedInputIdentity: 'id',
      }),
      findLatestSucceededRunForTrip: jest.fn().mockResolvedValue(null),
    });
    jest.spyOn(runs, 'decodePayload').mockImplementation(() => {
      throw new Error('decodePayload should not run');
    });
    const res = await service.readForTrip(organizationId, vehicleId, tripId);
    expect(res.status).toBe('FAILED');
    expect(res.runId).toBe('run-fail');
  });

  it('serves latest succeeded run and surfaces newer failed run metadata', async () => {
    const succeeded = {
      id: 'run-ok',
      shadowStatus: 'SUCCEEDED',
      workItemId: 'wi',
      pinnedSnapshotHash: 'hash',
      combinedInputIdentity: 'id',
      payloadGzip: Buffer.from(''),
      summaryJson: { limitations: [] },
    };
    const { service, runs } = makeService({
      findLatestRunForTrip: jest.fn().mockResolvedValue({
        id: 'run-new-fail',
        shadowStatus: 'FAILED',
        workItemId: 'wi2',
        pinnedSnapshotHash: 'hash2',
        combinedInputIdentity: 'id2',
      }),
      findLatestSucceededRunForTrip: jest.fn().mockResolvedValue(succeeded),
    });
    jest.spyOn(runs, 'decodePayload').mockReturnValue({
      contract: {
        algorithmVersions: {
          c4: '1',
          c5_1: null,
          fsm: '1',
          gapBridgeV1: null,
          fsmAuxBinding: null,
          events: '1',
          bundle: '1',
        },
        speedAuthority: 'C4_ONLY',
        timeSemantics: { computedAtUtc: '2026-01-01T00:00:00Z' },
        sparse: { limitations: [] },
      },
      speeds: [],
      fsmLabels: [],
      events: [],
      stopEpisodes: [],
    } as never);
    jest.spyOn(service as unknown as { loadPositionGrid: () => Promise<unknown> }, 'loadPositionGrid').mockResolvedValue({
      rows: [],
      snapshotBindingVerified: true,
    });

    const res = await service.readForTrip(organizationId, vehicleId, tripId);
    expect(res.status).toBe('SUCCEEDED_EMPTY');
    expect(res.runId).toBe('run-ok');
    expect(res.newerFailedRunId).toBe('run-new-fail');
    expect(res.newerFailedRunStatus).toBe('FAILED');
  });

  it('strips map geometry when snapshot binding is not verified', async () => {
    const succeeded = {
      id: 'run-ok',
      shadowStatus: 'SUCCEEDED',
      workItemId: 'wi',
      pinnedSnapshotHash: 'hash',
      combinedInputIdentity: 'id',
      payloadGzip: Buffer.from(''),
      summaryJson: { limitations: [] },
    };
    const { service, runs } = makeService({
      findLatestRunForTrip: jest.fn().mockResolvedValue(succeeded),
      findLatestSucceededRunForTrip: jest.fn().mockResolvedValue(succeeded),
    });
    jest.spyOn(runs, 'decodePayload').mockReturnValue({
      contract: {
        algorithmVersions: {
          c4: '1',
          c5_1: null,
          fsm: '1',
          gapBridgeV1: null,
          fsmAuxBinding: null,
          events: '1',
          bundle: '1',
        },
        speedAuthority: 'C4_ONLY',
        timeSemantics: { computedAtUtc: '2026-01-01T00:00:00Z' },
        sparse: { limitations: [] },
      },
      speeds: [{ bucketLabelUtc: '2026-01-01T10:00:00Z', speedKmh: 40 }],
      fsmLabels: [{ bucketLabelUtc: '2026-01-01T10:00:00Z', state: 'MOVING', evidenceQuality: 'DIRECT' }],
      events: [],
      stopEpisodes: [],
    } as never);
    jest.spyOn(service as unknown as { loadPositionGrid: () => Promise<unknown> }, 'loadPositionGrid').mockResolvedValue({
      rows: [{ bucketLabelUtc: '2026-01-01T10:00:00Z', latitude: 50, longitude: 8, availability: 'PRESENT' }],
      snapshotBindingVerified: false,
    });

    const res = await service.readForTrip(organizationId, vehicleId, tripId);
    expect(res.snapshotBindingVerified).toBe(false);
    expect(res.geometrySource).toBe('NONE');
    expect(res.samples.every((s) => s.latitude == null && s.longitude == null)).toBe(true);
    expect(res.limitations).toContain('SNAPSHOT_BINDING_UNVERIFIED');
  });
});
