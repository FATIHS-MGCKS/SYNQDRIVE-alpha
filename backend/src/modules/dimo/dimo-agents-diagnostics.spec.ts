import { promises as dns } from 'dns';
import axios from 'axios';
import { DimoAgentsService } from './dimo-agents.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    agentsBaseUrl: 'https://agents.dimo.zone',
    dimoApiKey: 'test-api-key',
    agentUserWallet: '0x0000000000000000000000000000000000000001',
    agentPersonalityVehicleSpecs: undefined,
    agentPersonalityTireSpecs: undefined,
    agentPersonalityDocument: undefined,
    agentPersonalityChat: undefined,
    ...overrides,
  };
}

describe('DimoAgentsService.runAgentDiagnostics', () => {
  beforeEach(() => {
    jest.spyOn(dns, 'lookup').mockResolvedValue({ address: '1.2.3.4', family: 4 });
    mockedAxios.get.mockResolvedValue({
      status: 200,
      data: { service: 'agents', status: 'healthy', version: '1.0.0' },
    } as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('returns config-only diagnostics when skipLiveTests is true', async () => {
    const svc = new DimoAgentsService(makeConfig() as any);
    const res = await svc.runAgentDiagnostics({ skipLiveTests: true });

    expect(res.configured).toBe(true);
    expect(res.hasApiKey).toBe(true);
    expect(res.hasUserWallet).toBe(true);
    expect(res.walletMasked).toBe('0x0000…0001');
    expect(res.baseUrl).toBe('https://agents.dimo.zone');
    expect(res.personalities.vehicle_specs).toBe('master_technician');
    expect(res.personalities.fleet_chat).toBe('fleet_manager_pro');
    expect(res.checks.some((c) => c.name === 'config' && c.ok)).toBe(true);
    expect(res.checks.some((c) => c.name === 'personalities')).toBe(true);
    expect(res.checks.some((c) => c.name === 'agents_connectivity' && c.ok)).toBe(true);
    expect(res.checks.some((c) => c.name === 'create_agent')).toBe(false);
    expect(res.errors).toEqual([]);
  });

  it('reports missing credentials without leaking secrets', async () => {
    const svc = new DimoAgentsService(makeConfig({ dimoApiKey: '', agentUserWallet: '' }) as any);
    const res = await svc.runAgentDiagnostics({ skipLiveTests: true });

    expect(res.configured).toBe(false);
    expect(res.hasApiKey).toBe(false);
    expect(res.hasUserWallet).toBe(false);
    expect(res.walletMasked).toBeUndefined();
    expect(JSON.stringify(res)).not.toContain('test-api-key');
    expect(res.checks.find((c) => c.name === 'config')?.ok).toBe(false);
  });

  it('probes developer JWT availability without exposing the token', async () => {
    const dimoAuth = { getDeveloperJwt: jest.fn().mockResolvedValue('eyJ.secret.token') };
    const svc = new DimoAgentsService(makeConfig() as any, undefined, dimoAuth as any);
    const res = await svc.runAgentDiagnostics({ skipLiveTests: true });

    expect(res.hasDeveloperJwt).toBe(true);
    expect(res.checks.find((c) => c.name === 'developer_jwt')?.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain('eyJ.secret.token');
  });
});
