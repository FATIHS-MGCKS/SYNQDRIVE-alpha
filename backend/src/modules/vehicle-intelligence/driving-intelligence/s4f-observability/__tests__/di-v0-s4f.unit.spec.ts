import { DimoProviderBudgetError, DimoRateLimitedError } from '@modules/dimo/provider-budget/dimo-http-error.util';
import { classifyDiV0PositionTransportError } from '../../position-acquisition/di-v0-position-errors';
import { acquireDiV0HistoricalPositions } from '../../position-acquisition/di-v0-position-acquisition';
import { mapDiV0S4cPositionFailure } from '../../s4c-executor/di-v0-s4c-position-failure-map';
import { DiV0S4cExecutor } from '../../s4c-executor/di-v0-s4c-executor';
import type { DiV0S4ExecutionContext } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { buildDiV0S4RuntimePipelineManifest } from '../../s4b-orchestration/di-v0-s4b-pipeline-manifest';
import { buildDiV0S4BoundaryFingerprint } from '../../s4a-foundation/di-v0-s4a-identity';
import { parseDiV0S4ControlPlaneConfig } from '../../s4a-foundation/di-v0-s4a-control-plane';
import { R1_IDENTITY } from '../../position-acquisition/__tests__/position-acquisition-test-helpers';
import { DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1 } from '../di-v0-s4f-observability-contract';
import { DI_V0_S4F_KEYSET_CURSOR_AUTHORITY } from '../di-v0-s4f-keyset-cursor';
import { evaluateDiV0S4fTinyActivationReadiness, frozenTinyActivationGateKeys } from '../di-v0-s4f-activation-readiness';
import { assertBoundedPrometheusLabels } from '../di-v0-s4f-metric-labels';
import { auditDiV0S4ProviderBackpressure } from '../di-v0-s4f-provider-backpressure-audit';
import { evaluateDiV0S4fExecutorLiveness } from '../di-v0-s4f-executor-liveness';
import { DiV0S4ExecutorRegistry } from '../../s4b-orchestration/di-v0-s4b-executor.port';
import { DI_V0_S4F_OPERATIONAL_AGGREGATE_SCAN_KIND } from '../di-v0-s4f-operational-aggregates';

describe('DI V0 S4F unit', () => {
  it('F25 empty input fails every required Tiny Activation gate closed', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({});
    expect(r.finalState).toBe('NOT_READY');
    expect(r.tinyActivationReady).toBe(false);
    for (const key of frozenTinyActivationGateKeys()) {
      expect(r[key as keyof typeof r]).not.toBe('SATISFIED');
    }
  });

  it('F26 replay evidence missing => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
    });
    expect(r.replayDeserializerGate).toBe('UNKNOWN');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F27 snapshot-rehash evidence missing => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      providerBackpressureGap: 'CLOSED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
    });
    expect(r.snapshotRehashGate).toBe('UNKNOWN');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F16-F19 activation gates fail closed without explicit evidence', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({});
    expect(r.replayDeserializerGate).toBe('UNKNOWN');
    expect(r.snapshotRehashGate).toBe('UNKNOWN');
    expect(r.providerBackpressureGate).toBe('UNKNOWN');
    expect(r.locationRetentionGovernanceGate).toBe('UNKNOWN');
    expect(r.explicitOperatorAuthorizationGate).toBe('UNKNOWN');
  });

  it('F17 provider backpressure OPEN => NOT_READY', () => {
    const audit = auditDiV0S4ProviderBackpressure();
    expect(audit.gapStatus).toBe('OPEN_CONFIRMED');
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
      providerBackpressureGap: 'OPEN',
    });
    expect(r.providerBackpressureGate).toBe('NOT_SATISFIED');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F18 location governance absent => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      explicitOperatorAuthorization: 'GRANTED',
      locationRetentionGovernanceNote: 'ABSENT',
    });
    expect(r.locationRetentionGovernanceGate).toBe('NOT_SATISFIED');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('F19 explicit operator authorization absent => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      locationRetentionGovernanceNote: 'PRESENT',
    });
    expect(r.explicitOperatorAuthorizationGate).toBe('UNKNOWN');
    expect(r.finalState).toBe('NOT_READY');
  });

  it('all frozen Tiny Activation gates explicitly satisfied => READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
    });
    expect(r.finalState).toBe('READY');
    expect(r.tinyActivationReady).toBe(true);
    expect(Object.keys(r)).not.toContain('nativeReadinessGate');
  });

  it('F15 high-cardinality IDs absent from metric label schema', () => {
    expect(() => assertBoundedPrometheusLabels({ s4_work_status: 'PENDING' })).not.toThrow();
    expect(() => assertBoundedPrometheusLabels({ organization_id: 'x' })).toThrow(/FORBIDDEN/);
  });

  it('F21 ACTIVE pipeline with no global executor signal reported honestly', () => {
    const registry = new DiV0S4ExecutorRegistry();
    const l = evaluateDiV0S4fExecutorLiveness(1, registry);
    expect(l.globalExecutorLivenessAuthorityPresent).toBe(false);
    expect(l.signal).toBe('LOCAL_REPLICA_REGISTRY_ONLY');
    expect(l.localExecutorReady).toBe(false);
  });

  it('F36 operational aggregate boundedness classification truthful', () => {
    expect(DI_V0_S4F_OPERATIONAL_AGGREGATE_SCAN_KIND).toBe('FULL_TABLE_AGGREGATE');
  });

  it('observability contract version is stable', () => {
    expect(DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1).toBe('DI_V0_S4_OBSERVABILITY_SNAPSHOT_V1');
  });

  it('provider budget REDIS_UNAVAILABLE maps to retryable PROVIDER_BUDGET_UNAVAILABLE', () => {
    const failure = classifyDiV0PositionTransportError(
      new DimoProviderBudgetError('Redis unavailable', 'REDIS_UNAVAILABLE', 'POST_TRIP_ENRICHMENT'),
    );
    expect(failure.failureClass).toBe('PROVIDER_BUDGET_UNAVAILABLE');
    expect(failure.retryable).toBe(true);
  });

  it('provider budget ACQUIRE_TIMEOUT maps to retryable PROVIDER_BUDGET_UNAVAILABLE', () => {
    const failure = classifyDiV0PositionTransportError(
      new DimoProviderBudgetError('timeout', 'ACQUIRE_TIMEOUT', 'POST_TRIP_ENRICHMENT'),
    );
    expect(failure.failureClass).toBe('PROVIDER_BUDGET_UNAVAILABLE');
    expect(failure.retryable).toBe(true);
  });

  it('provider 429 maps to retryable RATE_LIMITED', () => {
    const failure = classifyDiV0PositionTransportError(new DimoRateLimitedError('rate limited', 1000));
    expect(failure.failureClass).toBe('RATE_LIMITED');
    expect(failure.retryable).toBe(true);
  });

  it('keyset cursor authority documents scan watermark', () => {
    expect(DI_V0_S4F_KEYSET_CURSOR_AUTHORITY).toBe(
      'SCAN_WATERMARK_CREATED_AT_THEN_SETTLEMENT_ANCHOR_AT_THEN_WORK_ITEM_ID',
    );
  });

  describe('H1 full provider failure → S4C T07 (no network)', () => {
    function prismaForS4c(start: Date, end: Date) {
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
            pinned_snapshot_hash: null,
            trip_status: 'COMPLETED',
            start_time: start,
            end_time: end,
            dimo_segment_id: 'seg',
            merge_parent_trip_id: null,
            raw_detection_meta: {},
            token_id: 99,
            raw_json: R1_IDENTITY,
          },
        ]),
      } as unknown as import('@prisma/client').PrismaClient;
    }

    function s4cContext(spies: {
      failRetryable?: jest.Mock;
      failTerminal?: jest.Mock;
      skipIneligible?: jest.Mock;
      completeWithS2?: jest.Mock;
    }): DiV0S4ExecutionContext {
      const cp = parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' });
      const repository = {
        evaluateAttemptStartBoundary: jest.fn().mockResolvedValue({ kind: 'CURRENT' }),
        readReplayRoutingContext: jest.fn().mockResolvedValue({ ok: true, mode: 'FRESH' as const }),
        failRetryable: spies.failRetryable ?? jest.fn(),
        failTerminal: spies.failTerminal ?? jest.fn(),
        skipIneligible: spies.skipIneligible ?? jest.fn(),
        completeWithS2: spies.completeWithS2 ?? jest.fn(),
      };
      return {
        lease: { workItemId: 'wi', leaseEpoch: BigInt(1), leaseOwner: 'o', attemptCount: 1, transitionId: 'T02_CLAIM' },
        pipelineManifest: buildDiV0S4RuntimePipelineManifest(cp).manifest,
        repository: repository as unknown as DiV0S4ExecutionContext['repository'],
        signal: new AbortController().signal,
      };
    }

    async function runH1Case(
      label: string,
      transportError: Error,
      expectedReason: string,
    ): Promise<void> {
      const start = new Date('2030-01-01T00:00:00Z');
      const end = new Date('2030-01-01T00:10:00Z');
      let transportCalls = 0;
      const failRetryable = jest.fn();
      const failTerminal = jest.fn();
      const skipIneligible = jest.fn();
      const completeWithS2 = jest.fn();
      const executor = new DiV0S4cExecutor({
        prisma: prismaForS4c(start, end),
        controlPlane: parseDiV0S4ControlPlaneConfig({ DI_V0_S4_MASTER_ENABLED: 'true' }),
        ports: {
          runDimo: async (_m, fn) => fn(),
          positionTransport: {
            executeHistoricalPositionQuery: async () => {
              transportCalls += 1;
              throw transportError;
            },
          },
          r1Transport: { executeHistoricalR1ObdQuery: async () => ({}) },
        },
      });

      const outcome = await executor.execute(
        s4cContext({ failRetryable, failTerminal, skipIneligible, completeWithS2 }),
      );

      const acquisition = await acquireDiV0HistoricalPositions(
        {
          organizationId: 'org-1',
          vehicleId: 'veh-1',
          tripId: 'trip-1',
          dimoTokenId: 99,
          dimoDeviceIdentity: R1_IDENTITY,
          fromUtc: '2030-01-01T00:00:00Z',
          toUtc: '2030-01-01T00:10:00Z',
        },
        {
          executeHistoricalPositionQuery: async () => {
            throw transportError;
          },
        },
        {},
      );

      expect(acquisition.status).toBe('FAILED');
      if (acquisition.status !== 'FAILED') return;
      expect(acquisition.failure.retryable).toBe(true);
      const mapped = mapDiV0S4cPositionFailure(acquisition.failure);
      expect(mapped).toEqual({ action: 'RETRYABLE_RELEASE', reasonCode: expectedReason });

      expect(outcome).toEqual({ kind: 'RELEASE' });
      expect(failRetryable).toHaveBeenCalledWith(expect.anything(), expectedReason);
      expect(failTerminal).not.toHaveBeenCalled();
      expect(skipIneligible).not.toHaveBeenCalled();
      expect(completeWithS2).not.toHaveBeenCalled();
      expect(transportCalls).toBe(1);
      expect(label).toBeTruthy();
    }

    it('H1 REDIS_UNAVAILABLE → PROVIDER_BUDGET_UNAVAILABLE → failRetryable (T07)', async () => {
      await runH1Case(
        'REDIS_UNAVAILABLE',
        new DimoProviderBudgetError('Redis unavailable', 'REDIS_UNAVAILABLE', 'POST_TRIP_ENRICHMENT'),
        'PROVIDER_BUDGET_UNAVAILABLE',
      );
    });

    it('H1 ACQUIRE_TIMEOUT → PROVIDER_BUDGET_UNAVAILABLE → failRetryable (T07)', async () => {
      await runH1Case(
        'ACQUIRE_TIMEOUT',
        new DimoProviderBudgetError('timeout', 'ACQUIRE_TIMEOUT', 'POST_TRIP_ENRICHMENT'),
        'PROVIDER_BUDGET_UNAVAILABLE',
      );
    });

    it('H1 exhausted HTTP 429 → RATE_LIMITED → failRetryable (T07)', async () => {
      await runH1Case(
        'RATE_LIMITED',
        new DimoRateLimitedError('rate limited', 1000),
        'RATE_LIMITED',
      );
    });
  });
});
