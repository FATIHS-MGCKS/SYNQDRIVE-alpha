import { computeDiV0TripIntervals } from '../core';
import type { DiV0S4ExecutionContext, DiV0S4ExecutionOutcome } from '../s4b-orchestration/di-v0-s4b-executor.port';
import { mapComputeOutputToPersistRows } from '../shadow-persistence/di-v0-shadow-mapper';
import { evaluateDiV0S4ChannelRun } from '../s4a-foundation/di-v0-s4a-identity';
import type { DiV0CalibrationBundle } from '../core/calibration/types';
import type { DiV0VersionTuple } from '../core/versions';
import { buildDiV0S4dS1InputFromParsedContainer, DiV0S4dReplayS1Error } from './di-v0-s4d-replay-s1';
import type { DiV0S4ReplayRoutingContext } from './di-v0-s4d-replay-types';
import { s4dAbortReleaseOrContinue } from './di-v0-s4d-replay-abort';

function mapVerifiedFailureToTerminal(code: string): string {
  if (code === 'SNAPSHOT_HASH_MISMATCH') return 'SNAPSHOT_HASH_MISMATCH';
  return 'REPLAY_INELIGIBLE';
}

/** S4D pinned replay: verified load → deserialize → S1 → T06. Zero provider calls. */
export async function executeDiV0S4dPinnedReplay(
  context: DiV0S4ExecutionContext,
  route: DiV0S4ReplayRoutingContext,
  computeBinding: { versions: DiV0VersionTuple; calibration: DiV0CalibrationBundle },
  controlPlane: { r1Enabled: boolean; nativeEnabled: boolean; positionEnabled: boolean },
): Promise<DiV0S4ExecutionOutcome> {
  const { lease, pipelineManifest, repository, signal } = context;
  const abort = () => s4dAbortReleaseOrContinue(signal);
  if (abort()) return abort()!;

  const boundaryRecheck = await repository.evaluateAttemptStartBoundary(lease);
  if (abort()) return abort()!;
  if (boundaryRecheck.kind === 'LEASE_LOST') return { kind: 'RELEASE' };
  if (boundaryRecheck.kind === 'SUPERSEDE') {
    if (abort()) return abort()!;
    await repository.holderSupersede(lease, boundaryRecheck.reason);
    return { kind: 'SETTLED' };
  }

  const verified = await repository.readVerifiedPinnedEvidence(lease);
  if (abort()) return abort()!;
  if (!verified.ok) {
    if (verified.code === 'LEASE_LOST') return { kind: 'RELEASE' };
    if (abort()) return abort()!;
    await repository.failTerminal(lease, mapVerifiedFailureToTerminal(verified.code));
    return { kind: 'SETTLED' };
  }

  const { parsed } = verified;
  if (evaluateDiV0S4ChannelRun(controlPlane, parsed.pins, route.sourceFamily) !== 'RUNNABLE') {
    if (abort()) return abort()!;
    await repository.failTerminal(lease, 'REPLAY_INELIGIBLE');
    return { kind: 'SETTLED' };
  }

  let s1Input;
  try {
    if (abort()) return abort()!;
    s1Input = buildDiV0S4dS1InputFromParsedContainer(parsed, route.sourceFamily);
  } catch (error) {
    if (abort()) return abort()!;
    const detail = error instanceof DiV0S4dReplayS1Error ? error.message : 'REPLAY_INELIGIBLE';
    await repository.failTerminal(lease, detail.includes('SNAPSHOT') ? 'REPLAY_INELIGIBLE' : 'REPLAY_INELIGIBLE');
    return { kind: 'SETTLED' };
  }

  if (abort()) return abort()!;
  const computeOutput = computeDiV0TripIntervals(s1Input, {
    versions: computeBinding.versions,
    calibration: computeBinding.calibration,
  });
  if (abort()) return abort()!;
  const intervals = mapComputeOutputToPersistRows(computeOutput, computeBinding.versions);
  await repository.completeWithS2(lease, { pipelineManifest, intervals });
  return { kind: 'SETTLED' };
}
