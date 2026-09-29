import { DiV0S4cExecutor } from '../di-v0-s4c-executor';
import type { DiV0S4ExecutionContext } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { API_SYNTHETIC_IDENTITY, signalsBody, staticTransport } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { buildDiV0S4BoundaryFingerprint } from '../../s4a-foundation/di-v0-s4a-identity';

describe('DiV0S4cExecutor (unit)', () => {
  it('C-API-04: API_SYNTHETIC path does not call R1 transport', async () => {
    const dimoCalls: Array<{ category: string; priority: string }> = [];
    let r1Calls = 0;
    const start = new Date('2030-01-01T00:00:00Z');
    const end = new Date('2030-01-01T00:10:00Z');
    const fp = buildDiV0S4BoundaryFingerprint({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStatus: 'COMPLETED',
      startTime: start,
      endTime: end,
      dimoSegmentId: 'seg',
      mergeParentTripId: null,
      boundaryRepairGeneration: null,
    });
    const prisma = {
      $queryRaw: jest.fn(async () => [
        {
          organization_id: 'org-1',
          vehicle_id: 'veh-1',
          trip_id: 'trip-1',
          boundary_fingerprint: fp,
          run_purpose: 'PRIMARY',
          pinned_snapshot_hash: null,
          trip_status: 'COMPLETED',
          start_time: start,
          end_time: end,
          dimo_segment_id: 'seg',
          merge_parent_trip_id: null,
          raw_detection_meta: {},
          token_id: 99,
          raw_json: API_SYNTHETIC_IDENTITY,
        },
      ]),
    } as unknown as import('@prisma/client').PrismaClient;

    const positionTransport = staticTransport(signalsBody([{ timestamp: '2030-01-01T00:00:01Z', currentLocationCoordinates: { latitude: 52, longitude: 9 } }]));
    const r1Transport = { executeHistoricalR1ObdQuery: jest.fn(async () => { r1Calls += 1; return {}; }) };

    const pinEvidence = jest.fn(async () => ({ snapshotHash: 'snap', combinedInputIdentity: 'id' }));
    const controlPlane = parseDiV0S4ControlPlaneConfig({
      DI_V0_S4_MASTER_ENABLED: 'true',
      DI_V0_S4_R1_ENABLED: 'true',
      DI_V0_S4_NATIVE_ENABLED: 'false',
    });
    const repository = {
      evaluateAttemptStartBoundary: jest.fn().mockResolvedValue({ kind: 'CURRENT' }),
      pinEvidence,
      completeWithS2: jest.fn(async () => ({ shadowRunId: 'run', executionIdentity: 'e', combinedInputIdentity: 'id' })),
      failTerminal: jest.fn(),
      failRetryable: jest.fn(),
      skipIneligible: jest.fn(),
    };

    const executor = new DiV0S4cExecutor({
      prisma,
      controlPlane,
      ports: {
        runDimo: async (meta, fn) => {
          dimoCalls.push(meta);
          return fn();
        },
        positionTransport,
        r1Transport,
      },
    });

    const lease = {
      workItemId: 'wi-1',
      leaseEpoch: BigInt(1),
      leaseOwner: 'owner',
      attemptCount: 1,
      transitionId: 'T02_CLAIM' as const,
    };

    const outcome = await executor.execute({
      lease,
      pipelineManifest: buildDiV0S4RuntimePipelineManifest(controlPlane).manifest,
      repository: repository as unknown as DiV0S4ExecutionContext['repository'],
      signal: new AbortController().signal,
    });

    expect(outcome).toEqual({ kind: 'SETTLED' });
    expect(r1Calls).toBe(0);
    expect(dimoCalls).toEqual([{ category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' }]);
    expect(pinEvidence).toHaveBeenCalled();
    const pinArg = (pinEvidence.mock.calls[0] as unknown as [{}, { channels: Array<{ channel: string; outcome: string }> }])[1];
    const r1 = pinArg.channels.find((c) => c.channel === 'R1_OBD');
    expect(r1?.outcome).toBe('NOT_APPLICABLE');
  });

  it('C-R1-08: existing pin → RELEASE without provider calls', async () => {
    const start = new Date('2030-01-01T00:00:00Z');
    const end = new Date('2030-01-01T00:10:00Z');
    const fp = buildDiV0S4BoundaryFingerprint({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      tripId: 'trip-1',
      tripStatus: 'COMPLETED',
      startTime: start,
      endTime: end,
      dimoSegmentId: 'seg',
      mergeParentTripId: null,
      boundaryRepairGeneration: null,
    });
    const prisma = {
      $queryRaw: jest.fn(async () => [
        {
          organization_id: 'org-1',
          vehicle_id: 'veh-1',
          trip_id: 'trip-1',
          boundary_fingerprint: fp,
          run_purpose: 'PRIMARY',
          pinned_snapshot_hash: 'existing-snap',
          trip_status: 'COMPLETED',
          start_time: start,
          end_time: end,
          dimo_segment_id: 'seg',
          merge_parent_trip_id: null,
          raw_detection_meta: {},
          token_id: 99,
          raw_json: API_SYNTHETIC_IDENTITY,
        },
      ]),
    } as unknown as import('@prisma/client').PrismaClient;

    let positionCalls = 0;
    const controlPlane = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
    const executor = new DiV0S4cExecutor({
      prisma,
      controlPlane,
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: { executeHistoricalPositionQuery: async () => { positionCalls += 1; return {}; } },
        r1Transport: { executeHistoricalR1ObdQuery: async () => ({}) },
      },
    });

    const outcome = await executor.execute({
      lease: { workItemId: 'wi', leaseEpoch: BigInt(1), leaseOwner: 'o', attemptCount: 1, transitionId: 'T02_CLAIM' as const },
      pipelineManifest: buildDiV0S4RuntimePipelineManifest(controlPlane).manifest,
      repository: {
        evaluateAttemptStartBoundary: jest.fn().mockResolvedValue({ kind: 'CURRENT' }),
      } as unknown as DiV0S4ExecutionContext['repository'],
      signal: new AbortController().signal,
    });
    expect(outcome).toEqual({ kind: 'RELEASE' });
    expect(positionCalls).toBe(0);
  });
});
