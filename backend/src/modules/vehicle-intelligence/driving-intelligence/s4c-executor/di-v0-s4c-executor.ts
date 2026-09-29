import { DI_V0_S4_LIMITS } from '../s4a-foundation/di-v0-s4a-contract';
import type { DiV0S4ExecutionContext, DiV0S4ExecutionOutcome } from '../s4b-orchestration/di-v0-s4b-executor.port';
import { acquireDiV0HistoricalPositions, toDiV0S1PositionInput } from '../position-acquisition/di-v0-position-acquisition';
import { acquireDiV0HistoricalR1Obd, toDiV0S1R1ObdInput } from '../r1-obd-acquisition/di-v0-r1-obd-acquisition';
import { CALIBRATION_UNSET_V0_BUNDLE, computeDiV0TripIntervals, DEFAULT_DI_V0_VERSION_TUPLE } from '../core';
import { mapComputeOutputToPersistRows } from '../shadow-persistence/di-v0-shadow-mapper';
import { resolveDiV0S4cAcquisitionContext } from './di-v0-s4c-acquisition-context';
import {
  buildDiV0S4cNativeChannelInput,
  buildDiV0S4cPositionOutcomeChannel,
  buildDiV0S4cPositionPresentChannel,
  buildDiV0S4cR1ChannelInput,
} from './di-v0-s4c-evidence-channels';
import { mapDiV0S4cPositionFailure } from './di-v0-s4c-position-failure-map';
import type { DiV0S4cExecutorDeps } from './di-v0-s4c-types';

export const DI_V0_S4C_EXECUTOR_ID = 'DI_V0_S4C_LIVE_SHADOW_V1';

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error('DI_V0_S4C_ABORTED');
}

export class DiV0S4cExecutor {
  readonly executorId = DI_V0_S4C_EXECUTOR_ID;

  constructor(private readonly deps: DiV0S4cExecutorDeps) {}

  isReady(): boolean {
    return true;
  }

  async execute(context: DiV0S4ExecutionContext): Promise<DiV0S4ExecutionOutcome> {
    const { lease, pipelineManifest, repository, signal } = context;
    assertNotAborted(signal);

    const resolved = await resolveDiV0S4cAcquisitionContext(this.deps.prisma, lease);
    if (!resolved.ok) {
      await repository.failTerminal(lease, `CONTEXT_${resolved.failure.code}`);
      return { kind: 'SETTLED' };
    }
    const ctx = resolved.context;

    if (ctx.pinnedSnapshotHash != null) {
      return { kind: 'RELEASE' };
    }

    const windowSeconds = (ctx.windowEnd.getTime() - ctx.windowStart.getTime()) / 1000;
    if (windowSeconds > DI_V0_S4_LIMITS.maxAcquisitionWindowSeconds) {
      await repository.skipIneligible(lease, 'WINDOW_EXCEEDS_MAX_8H');
      return { kind: 'SETTLED' };
    }

    if (ctx.sourceFamily === 'UNKNOWN') {
      await repository.skipIneligible(lease, 'POSITION_UNSUPPORTED_SOURCE');
      return { kind: 'SETTLED' };
    }

    assertNotAborted(signal);

    const fromUtc = ctx.windowStart.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const toUtc = ctx.windowEnd.toISOString().replace(/\.\d{3}Z$/, 'Z');
    const acquisitionRequest = {
      organizationId: ctx.organizationId,
      vehicleId: ctx.vehicleId,
      tripId: ctx.tripId,
      dimoTokenId: ctx.dimoTokenId,
      dimoDeviceIdentity: ctx.dimoDeviceIdentity,
      fromUtc,
      toUtc,
    };

    const positionOutcome = await this.deps.ports.runDimo(
      { category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' },
      () => acquireDiV0HistoricalPositions(acquisitionRequest, this.deps.ports.positionTransport, {}),
    );

    assertNotAborted(signal);

    if (positionOutcome.status === 'FAILED') {
      const mapped = mapDiV0S4cPositionFailure(positionOutcome.failure);
      if (mapped.action === 'RETRYABLE_RELEASE') {
        await repository.failRetryable(lease, mapped.reasonCode);
        return { kind: 'RELEASE' };
      }
      if (mapped.action === 'SKIP_T09') {
        await repository.skipIneligible(lease, mapped.skipReason);
        return { kind: 'SETTLED' };
      }
      await repository.failTerminal(lease, mapped.failureReason);
      return { kind: 'SETTLED' };
    }

    const positionResult = positionOutcome.result;
    let r1Result: Awaited<ReturnType<typeof acquireDiV0HistoricalR1Obd>> | null = null;
    const r1Applicable =
      this.deps.controlPlane.r1Enabled &&
      ctx.sourceFamily === 'RUPTELA_R1';

    if (r1Applicable) {
      assertNotAborted(signal);
      r1Result = await this.deps.ports.runDimo(
        { category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' },
        () => acquireDiV0HistoricalR1Obd(acquisitionRequest, this.deps.ports.r1Transport, {}),
      );
      assertNotAborted(signal);
    }

    const r1Failed =
      r1Result?.status === 'FAILED'
        ? { reasonCode: r1Result.failure.code }
        : null;

    const channels = [
      buildDiV0S4cNativeChannelInput(this.deps.controlPlane),
      buildDiV0S4cPositionPresentChannel(ctx.dimoTokenId, ctx.vehicleId, positionResult),
      buildDiV0S4cR1ChannelInput(
        this.deps.controlPlane,
        ctx.sourceFamily,
        ctx.dimoTokenId,
        ctx.vehicleId,
        r1Result?.status === 'ACQUIRED' ? r1Result.result : null,
        r1Failed,
      ),
    ];

    assertNotAborted(signal);
    await repository.pinEvidence(lease, {
      windowStart: ctx.windowStart,
      windowEnd: ctx.windowEnd,
      channels,
    });

    const s1Input = toDiV0S1PositionInput(positionResult);
    const r1Obd = r1Result?.status === 'ACQUIRED' ? toDiV0S1R1ObdInput(r1Result.result) : [];
    const computeOutput = computeDiV0TripIntervals(
      { sourceFamily: s1Input.sourceFamily, positions: s1Input.positions, r1Obd, nativeEvents: [] },
      { versions: DEFAULT_DI_V0_VERSION_TUPLE, calibration: CALIBRATION_UNSET_V0_BUNDLE },
    );
    const intervals = mapComputeOutputToPersistRows(computeOutput, DEFAULT_DI_V0_VERSION_TUPLE);

    assertNotAborted(signal);
    await repository.completeWithS2(lease, { pipelineManifest, intervals });
    return { kind: 'SETTLED' };
  }
}
