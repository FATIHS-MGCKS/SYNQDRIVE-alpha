import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../../core';
import type { DiV0S4ExecutionContext } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { executeDiV0S4dPinnedReplay } from '../di-v0-s4d-pinned-replay';
import type { DiV0S4ReplayRoutingContext } from '../di-v0-s4d-replay-types';
import { acquireDiV0HistoricalPositions } from '../../position-acquisition/di-v0-position-acquisition';
import {
  buildDiV0S4cNativeChannelInput,
  buildDiV0S4cPositionPresentChannel,
  buildDiV0S4cR1ChannelInput,
} from '../../s4c-executor/di-v0-s4c-evidence-channels';
import { buildRequest, labelAt, row, staticTransport, signalsBody } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { serializeDiV0S4EvidenceContainer } from '../../s4a-foundation/di-v0-s4a-identity';
import { parseDiV0S4EvidenceContainer } from '../../s4a-foundation/di-v0-s4a-evidence-container-parse';

const BASE = '2030-01-01T00:00:00Z';

async function minimalParsedApiSynthetic() {
  const control = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
  const acquired = await acquireDiV0HistoricalPositions(
    buildRequest(BASE, labelAt(BASE, 2)),
    staticTransport(signalsBody([row(labelAt(BASE, 1), 52, 9)])),
    {},
  );
  if (acquired.status !== 'ACQUIRED') throw new Error('acquire failed');
  const container = serializeDiV0S4EvidenceContainer({
    organizationId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    boundaryFingerprint: 'fp',
    windowStart: new Date(BASE),
    windowEnd: new Date(labelAt(BASE, 2)),
    channels: [
      buildDiV0S4cNativeChannelInput(control, 'API_SYNTHETIC'),
      buildDiV0S4cPositionPresentChannel(acquired.result),
      buildDiV0S4cR1ChannelInput(control, 'API_SYNTHETIC', 1, 'veh-1', null, null),
    ],
  });
  return parseDiV0S4EvidenceContainer(container.container);
}

function baseCtx(repository: object, signal: AbortSignal): DiV0S4ExecutionContext {
  const controlPlane = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
  return {
    lease: { workItemId: 'wi', leaseEpoch: BigInt(1), leaseOwner: 'o', attemptCount: 1, transitionId: 'T02_CLAIM' },
    pipelineManifest: buildDiV0S4RuntimePipelineManifest(controlPlane).manifest,
    repository: {
      evaluateAttemptStartBoundary: jest.fn().mockResolvedValue({ kind: 'CURRENT' }),
      ...(repository as object),
    } as unknown as DiV0S4ExecutionContext['repository'],
    signal,
  };
}

const route: DiV0S4ReplayRoutingContext = {
  organizationId: 'org-1',
  vehicleId: 'veh-1',
  tripId: 'trip-1',
  sourceFamily: 'API_SYNTHETIC',
  boundaryFingerprint: 'fp',
  runPurpose: 'PRIMARY',
  pinnedSnapshotHash: 'snap',
};

describe('S4D pinned replay abort authority', () => {
  const controlPlane = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
  const computeBinding = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };

  it('aborts at entry without authoritative writes', async () => {
    const ac = new AbortController();
    ac.abort();
    const completeWithS2 = jest.fn();
    const failTerminal = jest.fn();
    const outcome = await executeDiV0S4dPinnedReplay(
      baseCtx({ readVerifiedPinnedEvidence: jest.fn(), completeWithS2, failTerminal }, ac.signal),
      route,
      computeBinding,
      controlPlane,
    );
    expect(outcome).toEqual({ kind: 'RELEASE' });
    expect(completeWithS2).not.toHaveBeenCalled();
    expect(failTerminal).not.toHaveBeenCalled();
  });

  it('aborts after verified load before compute', async () => {
    const ac = new AbortController();
    const parsed = await minimalParsedApiSynthetic();
    const completeWithS2 = jest.fn();
    const failTerminal = jest.fn();
    const readVerifiedPinnedEvidence = jest.fn().mockImplementation(async () => {
      ac.abort();
      return { ok: true, parsed };
    });
    const outcome = await executeDiV0S4dPinnedReplay(
      baseCtx({ readVerifiedPinnedEvidence, completeWithS2, failTerminal }, ac.signal),
      route,
      computeBinding,
      controlPlane,
    );
    expect(outcome).toEqual({ kind: 'RELEASE' });
    expect(completeWithS2).not.toHaveBeenCalled();
    expect(failTerminal).not.toHaveBeenCalled();
  });

  it('aborts before failTerminal without terminal write', async () => {
    const ac = new AbortController();
    const completeWithS2 = jest.fn();
    const failTerminal = jest.fn();
    const readVerifiedPinnedEvidence = jest.fn().mockImplementation(async () => {
      ac.abort();
      return { ok: false as const, code: 'SNAPSHOT_HASH_MISMATCH' };
    });
    const outcome = await executeDiV0S4dPinnedReplay(
      baseCtx({ readVerifiedPinnedEvidence, completeWithS2, failTerminal }, ac.signal),
      route,
      computeBinding,
      controlPlane,
    );
    expect(outcome).toEqual({ kind: 'RELEASE' });
    expect(completeWithS2).not.toHaveBeenCalled();
    expect(failTerminal).not.toHaveBeenCalled();
  });

  it('aborts before holderSupersede without T13 write', async () => {
    let abortReads = 0;
    const signal = {
      get aborted() {
        abortReads += 1;
        return abortReads >= 2;
      },
    } as AbortSignal;
    const completeWithS2 = jest.fn();
    const failTerminal = jest.fn();
    const holderSupersede = jest.fn();
    const outcome = await executeDiV0S4dPinnedReplay(
      baseCtx(
        {
          evaluateAttemptStartBoundary: jest.fn().mockResolvedValue({ kind: 'SUPERSEDE', reason: 'stale' }),
          holderSupersede,
          readVerifiedPinnedEvidence: jest.fn(),
          completeWithS2,
          failTerminal,
        },
        signal,
      ),
      route,
      computeBinding,
      controlPlane,
    );
    expect(outcome).toEqual({ kind: 'RELEASE' });
    expect(holderSupersede).not.toHaveBeenCalled();
    expect(completeWithS2).not.toHaveBeenCalled();
    expect(failTerminal).not.toHaveBeenCalled();
  });
});
