import { DiV0S4cExecutor } from '../di-v0-s4c-executor';
import type { DiV0S4ExecutionContext } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { API_SYNTHETIC_IDENTITY, R1_IDENTITY, UNKNOWN_IDENTITY, signalsBody, staticTransport } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { buildDiV0S4BoundaryFingerprint } from '../../s4a-foundation/di-v0-s4a-identity';
import * as positionAcquisition from '../../position-acquisition/di-v0-position-acquisition';
import * as r1Acquisition from '../../r1-obd-acquisition/di-v0-r1-obd-acquisition';

function prismaFor(rawJson: unknown, start: Date, end: Date, pinned: string | null = null) {
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
  return {
    $queryRaw: jest.fn(async () => [
      {
        organization_id: 'org-1',
        vehicle_id: 'veh-1',
        trip_id: 'trip-1',
        boundary_fingerprint: fp,
        run_purpose: 'PRIMARY',
        pinned_snapshot_hash: pinned,
        trip_status: 'COMPLETED',
        start_time: start,
        end_time: end,
        dimo_segment_id: 'seg',
        merge_parent_trip_id: null,
        raw_detection_meta: {},
        token_id: 99,
        raw_json: rawJson,
      },
    ]),
  } as unknown as import('@prisma/client').PrismaClient;
}

function baseContext(repository: object): DiV0S4ExecutionContext {
  return {
    lease: { workItemId: 'wi', leaseEpoch: BigInt(1), leaseOwner: 'o', attemptCount: 1, transitionId: 'T02_CLAIM' },
    pipelineManifest: {} as DiV0S4ExecutionContext['pipelineManifest'],
    repository: repository as DiV0S4ExecutionContext['repository'],
    signal: new AbortController().signal,
  };
}

describe('DiV0S4cExecutor matrix (unit)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('C-R1-07: window >8h → T09 skip, zero provider calls', async () => {
    const start = new Date('2030-01-01T00:00:00Z');
    const end = new Date('2030-01-01T09:30:00Z');
    const skipIneligible = jest.fn();
    let dimoRuns = 0;
    const executor = new DiV0S4cExecutor({
      prisma: prismaFor(R1_IDENTITY, start, end),
      controlPlane: parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true', DI_V0_S4_R1_ENABLED: 'true' }),
      ports: {
        runDimo: async (_m, fn) => {
          dimoRuns += 1;
          return fn();
        },
        positionTransport: staticTransport(signalsBody([])),
        r1Transport: { executeHistoricalR1ObdQuery: async () => ({}) },
      },
    });
    const outcome = await executor.execute({ ...baseContext({ skipIneligible }), repository: { skipIneligible } as never });
    expect(outcome).toEqual({ kind: 'SETTLED' });
    expect(skipIneligible).toHaveBeenCalledWith(expect.anything(), 'WINDOW_EXCEEDS_MAX_8H');
    expect(dimoRuns).toBe(0);
  });

  it('UNKNOWN source family → POSITION_UNSUPPORTED_SOURCE without provider', async () => {
    const start = new Date('2030-01-01T00:00:00Z');
    const end = new Date('2030-01-01T00:10:00Z');
    const skipIneligible = jest.fn();
    let dimoRuns = 0;
    const executor = new DiV0S4cExecutor({
      prisma: prismaFor(UNKNOWN_IDENTITY, start, end),
      controlPlane: parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' }),
      ports: {
        runDimo: async (_m, fn) => {
          dimoRuns += 1;
          return fn();
        },
        positionTransport: staticTransport(signalsBody([])),
        r1Transport: { executeHistoricalR1ObdQuery: async () => ({}) },
      },
    });
    await executor.execute({ ...baseContext({ skipIneligible }), repository: { skipIneligible } as never });
    expect(skipIneligible).toHaveBeenCalledWith(expect.anything(), 'POSITION_UNSUPPORTED_SOURCE');
    expect(dimoRuns).toBe(0);
  });

  it('C-R1-04: retryable position SOURCE_FAILURE → failRetryable RELEASE', async () => {
    jest.spyOn(positionAcquisition, 'acquireDiV0HistoricalPositions').mockResolvedValue({
      status: 'FAILED',
      failure: { failureClass: 'PROVIDER_BUDGET_UNAVAILABLE', retryable: true, httpStatus: null, safeMessage: 'budget' },
    });
    const failRetryable = jest.fn();
    const executor = new DiV0S4cExecutor({
      prisma: prismaFor(R1_IDENTITY, new Date('2030-01-01T00:00:00Z'), new Date('2030-01-01T00:10:00Z')),
      controlPlane: parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' }),
      ports: { runDimo: async (_m, fn) => fn(), positionTransport: staticTransport({}), r1Transport: { executeHistoricalR1ObdQuery: async () => ({}) } },
    });
    const outcome = await executor.execute({ ...baseContext({ failRetryable }), repository: { failRetryable } as never });
    expect(outcome).toEqual({ kind: 'RELEASE' });
    expect(failRetryable).toHaveBeenCalled();
  });

  it('C-R1-05: position authorization → T08 terminal', async () => {
    jest.spyOn(positionAcquisition, 'acquireDiV0HistoricalPositions').mockResolvedValue({
      status: 'FAILED',
      failure: { failureClass: 'AUTHORIZATION', retryable: false, httpStatus: 403, safeMessage: 'denied' },
    });
    const failTerminal = jest.fn();
    const executor = new DiV0S4cExecutor({
      prisma: prismaFor(R1_IDENTITY, new Date('2030-01-01T00:00:00Z'), new Date('2030-01-01T00:10:00Z')),
      controlPlane: parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' }),
      ports: { runDimo: async (_m, fn) => fn(), positionTransport: staticTransport({}), r1Transport: { executeHistoricalR1ObdQuery: async () => ({}) } },
    });
    const outcome = await executor.execute({ ...baseContext({ failTerminal }), repository: { failTerminal } as never });
    expect(outcome).toEqual({ kind: 'SETTLED' });
    expect(failTerminal).toHaveBeenCalledWith(expect.anything(), 'POSITION_AUTHORIZATION');
  });

  it('C-R1-03: position OK + R1 failure → position-only degraded completion', async () => {
    jest.spyOn(r1Acquisition, 'acquireDiV0HistoricalR1Obd').mockResolvedValue({
      status: 'FAILED',
      failure: { code: 'NETWORK', retryable: true, message: 'r1 fail' },
    });
    const pinEvidence = jest.fn(async () => ({ snapshotHash: 'snap', combinedInputIdentity: 'id' }));
    const completeWithS2 = jest.fn(async () => ({ shadowRunId: 'run', executionIdentity: 'e', combinedInputIdentity: 'id' }));
    const executor = new DiV0S4cExecutor({
      prisma: prismaFor(R1_IDENTITY, new Date('2030-01-01T00:00:00Z'), new Date('2030-01-01T00:10:00Z')),
      controlPlane: parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true', DI_V0_S4_R1_ENABLED: 'true' }),
      ports: {
        runDimo: async (_m, fn) => fn(),
        positionTransport: staticTransport(
          signalsBody([{ timestamp: '2030-01-01T00:00:01Z', currentLocationCoordinates: { latitude: 52, longitude: 9 } }]),
        ),
        r1Transport: { executeHistoricalR1ObdQuery: async () => ({}) },
      },
    });
    const outcome = await executor.execute({
      ...baseContext({ pinEvidence, completeWithS2 }),
      repository: { pinEvidence, completeWithS2 } as never,
    });
    expect(outcome).toEqual({ kind: 'SETTLED' });
    const channels = (pinEvidence.mock.calls[0] as unknown as [{}, { channels: Array<{ channel: string; outcome: string }> }])[1].channels;
    expect(channels.find((c) => c.channel === 'R1_OBD')?.outcome).toBe('SOURCE_FAILURE');
    expect(channels.find((c) => c.channel === 'POSITION')?.outcome).toBe('PRESENT');
    expect(completeWithS2).toHaveBeenCalled();
  });

  it('C-R1-10: AbortSignal before provider → no acquisition', async () => {
    const acq = jest.spyOn(positionAcquisition, 'acquireDiV0HistoricalPositions');
    const controller = new AbortController();
    controller.abort();
    const executor = new DiV0S4cExecutor({
      prisma: prismaFor(API_SYNTHETIC_IDENTITY, new Date('2030-01-01T00:00:00Z'), new Date('2030-01-01T00:10:00Z')),
      controlPlane: parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' }),
      ports: { runDimo: async (_m, fn) => fn(), positionTransport: staticTransport({}), r1Transport: { executeHistoricalR1ObdQuery: async () => ({}) } },
    });
    await expect(
      executor.execute({ ...baseContext({}), signal: controller.signal }),
    ).rejects.toThrow('DI_V0_S4C_ABORTED');
    expect(acq).not.toHaveBeenCalled();
  });

  it('DIMO budget: runDimo receives POST_TRIP_ENRICHMENT BACKGROUND', async () => {
    const metas: Array<{ category: string; priority: string }> = [];
    const executor = new DiV0S4cExecutor({
      prisma: prismaFor(API_SYNTHETIC_IDENTITY, new Date('2030-01-01T00:00:00Z'), new Date('2030-01-01T00:10:00Z')),
      controlPlane: parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' }),
      ports: {
        runDimo: async (meta, fn) => {
          metas.push(meta);
          return fn();
        },
        positionTransport: staticTransport(
          signalsBody([{ timestamp: '2030-01-01T00:00:01Z', currentLocationCoordinates: { latitude: 52, longitude: 9 } }]),
        ),
        r1Transport: { executeHistoricalR1ObdQuery: async () => ({}) },
      },
    });
    const pinEvidence = jest.fn(async () => ({ snapshotHash: 'snap', combinedInputIdentity: 'id' }));
    const completeWithS2 = jest.fn(async () => ({ shadowRunId: 'run', executionIdentity: 'e', combinedInputIdentity: 'id' }));
    await executor.execute({ ...baseContext({ pinEvidence, completeWithS2 }), repository: { pinEvidence, completeWithS2 } as never });
    expect(metas.every((m) => m.category === 'POST_TRIP_ENRICHMENT' && m.priority === 'BACKGROUND')).toBe(true);
  });
});
