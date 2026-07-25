import { AI_GET_VEHICLE_LOCATION_TOOL } from '../tools/get-vehicle-location/ai-get-vehicle-location.types';
import { AI_DOMAIN_TOOL_DEFINITION_BY_NAME } from '../registry/ai-domain-tool-registry.definitions';
import { AiAgentToolCacheService } from './ai-agent-tool-cache.service';
import type { AiDomainQueryOutcome } from '../evidence/ai-domain-error.types';

const ORG_ID = '11111111-1111-4111-8111-111111111111';

function makeOutcome(data: Record<string, unknown> | null): AiDomainQueryOutcome<unknown> {
  return {
    tenantId: ORG_ID,
    data,
    errors: [],
    warnings: [],
    partial: false,
    allowLlmInference: true,
    evidence: [],
  };
}

describe('AiAgentToolCacheService', () => {
  const config = {
    agentToolCacheEnabled: true,
    agentLimitsFailOpen: true,
  };

  function createService(redisOverrides: Record<string, unknown> = {}) {
    const redis = {
      get: jest.fn(),
      set: jest.fn(),
      ...redisOverrides,
    };
    const svc = new AiAgentToolCacheService(config as never, redis as never);
    return { svc, redis };
  }

  it('does not cache last-known location as live data', async () => {
    const { svc } = createService();
    const definition = AI_DOMAIN_TOOL_DEFINITION_BY_NAME[AI_GET_VEHICLE_LOCATION_TOOL];
    const context = {
      organizationId: ORG_ID,
      correlationId: 'corr-1',
    } as never;

    const lastKnown = makeOutcome({
      vehicleId: 'veh-1',
      isLastKnownLocation: true,
      freshness: 'offline',
    });

    let calls = 0;
    const execute = jest.fn(async () => {
      calls += 1;
      return lastKnown;
    });

    await svc.getOrExecute({
      context,
      definition,
      cacheKeySuffix: 'veh-1',
      execute,
    });
    await svc.getOrExecute({
      context,
      definition,
      cacheKeySuffix: 'veh-1',
      execute,
    });

    expect(calls).toBe(2);
  });

  it('reuses request_short_ttl cache within correlation', async () => {
    const { svc } = createService();
    const definition = AI_DOMAIN_TOOL_DEFINITION_BY_NAME.get_vehicle_health_summary;
    const context = {
      organizationId: ORG_ID,
      correlationId: 'corr-2',
    } as never;

    let calls = 0;
    const execute = jest.fn(async () => {
      calls += 1;
      return makeOutcome({ status: 'ok' });
    });

    await svc.getOrExecute({
      context,
      definition,
      cacheKeySuffix: 'veh-1',
      execute,
    });
    await svc.getOrExecute({
      context,
      definition,
      cacheKeySuffix: 'veh-1',
      execute,
    });

    expect(calls).toBe(1);
  });
});
