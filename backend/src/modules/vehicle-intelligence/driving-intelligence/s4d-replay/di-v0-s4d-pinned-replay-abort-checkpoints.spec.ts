const s4dReplayS1AbortTestHooks = {
  onAfterBuildS1Input: null as (() => void) | null,
};

jest.mock('./di-v0-s4d-replay-s1', () => {
  const actual = jest.requireActual<typeof import('./di-v0-s4d-replay-s1')>('./di-v0-s4d-replay-s1');
  return {
    ...actual,
    buildDiV0S4dS1InputFromParsedContainer: (
      ...args: Parameters<typeof actual.buildDiV0S4dS1InputFromParsedContainer>
    ) => {
      const result = actual.buildDiV0S4dS1InputFromParsedContainer(...args);
      s4dReplayS1AbortTestHooks.onAfterBuildS1Input?.();
      return result;
    },
  };
});

import { CALIBRATION_UNSET_V0_BUNDLE, DEFAULT_DI_V0_VERSION_TUPLE } from '../core';
import type { DiV0S4ExecutionContext } from '../s4b-orchestration/di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest } from '../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { parseDiV0S4ControlPlaneConfig } from '../s4a-foundation/di-v0-s4a-control-plane';
import type { DiV0S4ReplayRoutingContext } from './di-v0-s4d-replay-types';
import { acquireDiV0HistoricalPositions } from '../position-acquisition/di-v0-position-acquisition';
import {
  buildDiV0S4cNativeChannelInput,
  buildDiV0S4cPositionPresentChannel,
  buildDiV0S4cR1ChannelInput,
} from '../s4c-executor/di-v0-s4c-evidence-channels';
import { buildRequest, labelAt, row, staticTransport, signalsBody } from '../position-acquisition/__tests__/position-acquisition-test-helpers';
import { serializeDiV0S4EvidenceContainer } from '../s4a-foundation/di-v0-s4a-identity';
import { parseDiV0S4EvidenceContainer } from '../s4a-foundation/di-v0-s4a-evidence-container-parse';

const BASE = '2030-01-01T00:00:00Z';

function abortSignalAfterAbortedReadCount(threshold: number): AbortSignal {
  let reads = 0;
  return {
    get aborted() {
      reads += 1;
      return reads >= threshold;
    },
  } as AbortSignal;
}

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

describe('S4D pinned replay abort checkpoints (real runtime path)', () => {
  const controlPlane = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
  const computeBinding = { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE };
  let executeDiV0S4dPinnedReplay: typeof import('./di-v0-s4d-pinned-replay').executeDiV0S4dPinnedReplay;

  beforeAll(async () => {
    ({ executeDiV0S4dPinnedReplay } = await import('./di-v0-s4d-pinned-replay'));
  });

  afterEach(() => {
    s4dReplayS1AbortTestHooks.onAfterBuildS1Input = null;
  });

  it('aborts after deserialize before compute', async () => {
    const ac = new AbortController();
    s4dReplayS1AbortTestHooks.onAfterBuildS1Input = () => ac.abort();
    const parsed = await minimalParsedApiSynthetic();
    const completeWithS2 = jest.fn();
    const failTerminal = jest.fn();
    const readVerifiedPinnedEvidence = jest.fn().mockResolvedValue({ ok: true, parsed });
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

  it('aborts after compute before T06 completion', async () => {
    const parsed = await minimalParsedApiSynthetic();
    const completeWithS2 = jest.fn();
    const failTerminal = jest.fn();
    const readVerifiedPinnedEvidence = jest.fn().mockResolvedValue({ ok: true, parsed });
    const outcome = await executeDiV0S4dPinnedReplay(
      baseCtx(
        { readVerifiedPinnedEvidence, completeWithS2, failTerminal },
        abortSignalAfterAbortedReadCount(6),
      ),
      route,
      computeBinding,
      controlPlane,
    );
    expect(outcome).toEqual({ kind: 'RELEASE' });
    expect(completeWithS2).not.toHaveBeenCalled();
    expect(failTerminal).not.toHaveBeenCalled();
  });
});
