import { DimoProviderBudgetError, DimoRateLimitedError } from '@modules/dimo/provider-budget/dimo-http-error.util';
import { DimoRequestExecutor } from '@modules/dimo/provider-budget/dimo-request-executor.service';
import {
  getDimoRequestContext,
  runWithDimoRequestContext,
} from '@modules/dimo/provider-budget/dimo-request-context';
import { DI_V0_S4C_DIMO_REQUEST_CONTEXT, buildDiV0S4cDimoAcquisitionPorts } from '../../s4c-executor/di-v0-s4c-dimo-ports';
import { DiV0S4cExecutor } from '../../s4c-executor/di-v0-s4c-executor';
import { evaluateDiV0S4fTinyActivationReadiness } from '../di-v0-s4f-activation-readiness';
import { auditDiV0S4ProviderBackpressure } from '../di-v0-s4f-provider-backpressure-audit';
import { DI_V0_S4F2_PROVIDER_BACKPRESSURE_CERTIFICATION } from '../di-v0-s4f-provider-backpressure-certification';

describe('S4F-2 provider backpressure certification (unit)', () => {
  it('PB15/PB16 frozen S4C DIMO context is POST_TRIP_ENRICHMENT BACKGROUND without bypass', () => {
    expect(DI_V0_S4C_DIMO_REQUEST_CONTEXT).toEqual({
      category: 'POST_TRIP_ENRICHMENT',
      priority: 'BACKGROUND',
    });
    expect(DI_V0_S4C_DIMO_REQUEST_CONTEXT.bypassBudget).toBeUndefined();
  });

  it('PB17/PB18 parent bypass=true does not infect S4 runDimo context', async () => {
    const ports = buildDiV0S4cDimoAcquisitionPorts({
      auth: { getVehicleJwt: async () => 'jwt' },
      telemetry: { queryGraphQL: async () => ({}) },
    });
    await runWithDimoRequestContext(
      { category: 'ADMIN', priority: 'CRITICAL', bypassBudget: true },
      async () => {
        await ports.runDimo({ category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' }, async () => {
          expect(getDimoRequestContext()).toEqual(DI_V0_S4C_DIMO_REQUEST_CONTEXT);
          expect(getDimoRequestContext().bypassBudget).not.toBe(true);
        });
      },
    );
  });

  it('PB18 S4 runDimo still acquires budget when parent had bypass', async () => {
    const acquire = jest.fn(async () => ({
      token: 't',
      category: 'POST_TRIP_ENRICHMENT' as const,
      acquiredAt: Date.now(),
    }));
    const release = jest.fn();
    const executor = new DimoRequestExecutor({
      isEnabled: () => true,
      getConfig: () => ({ globalMaxRetries: 0, globalRetryAfterMaxMs: 60_000 }),
      getMetrics: () => ({
        requestsTotal: { inc: jest.fn() },
        requestDurationSeconds: { observe: jest.fn() },
        rateLimitedTotal: { inc: jest.fn() },
        retryAfterSeconds: { observe: jest.fn() },
      }),
      acquirePermit: acquire,
      releasePermit: release,
      record429: jest.fn(),
    } as unknown as import('@modules/dimo/provider-budget/dimo-provider-budget.service').DimoProviderBudgetService);

    const ports = buildDiV0S4cDimoAcquisitionPorts({
      auth: { getVehicleJwt: async () => 'jwt' },
      telemetry: { queryGraphQL: async () => ({}) },
    });

    await runWithDimoRequestContext({ category: 'ADMIN', bypassBudget: true }, async () => {
      await ports.runDimo({ category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' }, async () => {
        await executor.execute({ execute: async () => 'ok' });
      });
    });
    expect(acquire).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it('PB23 global budget DISABLED => NOT_READY even if gap CLOSED', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      providerGlobalBudgetEnabled: 'DISABLED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
    });
    expect(r.providerGlobalBudgetEnabledGate).toBe('NOT_SATISFIED');
    expect(r.tinyActivationReady).toBe(false);
  });

  it('PB24 global budget UNKNOWN => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      locationRetentionGovernanceNote: 'PRESENT',
      explicitOperatorAuthorization: 'GRANTED',
    });
    expect(r.providerGlobalBudgetEnabledGate).toBe('UNKNOWN');
    expect(r.tinyActivationReady).toBe(false);
  });

  it('PB25 all technical gates satisfied but operator auth absent => NOT_READY', () => {
    const r = evaluateDiV0S4fTinyActivationReadiness({
      replayDeserializerGap: 'CLOSED',
      snapshotRehashVerification: 'IMPLEMENTED',
      providerBackpressureGap: 'CLOSED',
      providerGlobalBudgetEnabled: 'ENABLED',
      locationRetentionGovernanceNote: 'PRESENT',
    });
    expect(r.explicitOperatorAuthorizationGate).toBe('UNKNOWN');
    expect(r.tinyActivationReady).toBe(false);
  });

  it('audit reflects S4F-2 CLOSED certification markers', () => {
    const audit = auditDiV0S4ProviderBackpressure();
    expect(DI_V0_S4F2_PROVIDER_BACKPRESSURE_CERTIFICATION.gapStatus).toBe('CLOSED');
    expect(audit.gapStatus).toBe('CLOSED');
    expect(audit.multiReplicaBackpressureProven).toBe(true);
    expect(audit.s4BudgetBypassPossible).toBe(false);
  });

  it('PB12/PB13 shared transport maps budget errors to retryable classes (no HTTP)', async () => {
    const { classifyDiV0PositionTransportError } = await import(
      '../../position-acquisition/di-v0-position-errors'
    );
    const redisFailure = classifyDiV0PositionTransportError(
      new DimoProviderBudgetError('Redis unavailable', 'REDIS_UNAVAILABLE', 'POST_TRIP_ENRICHMENT'),
    );
    expect(redisFailure.retryable).toBe(true);
    const timeoutFailure = classifyDiV0PositionTransportError(
      new DimoProviderBudgetError('timeout', 'ACQUIRE_TIMEOUT', 'POST_TRIP_ENRICHMENT'),
    );
    expect(timeoutFailure.retryable).toBe(true);
    const rateLimited = classifyDiV0PositionTransportError(new DimoRateLimitedError('429', 1000));
    expect(rateLimited.failureClass).toBe('RATE_LIMITED');
  });

  it('SHARED_TRANSPORT_RETRY_OWNER documented; S4 executor has no local retry loop field', () => {
    expect(DI_V0_S4F2_PROVIDER_BACKPRESSURE_CERTIFICATION.sharedTransportRetryOwner).toBe(
      'SHARED_REQUEST_EXECUTOR',
    );
    expect(DI_V0_S4F2_PROVIDER_BACKPRESSURE_CERTIFICATION.s4LocalRetryLoopPresent).toBe(false);
    expect(new DiV0S4cExecutor({ prisma: {} as any, controlPlane: {} as any, ports: {} as any })).toBeTruthy();
  });
});
