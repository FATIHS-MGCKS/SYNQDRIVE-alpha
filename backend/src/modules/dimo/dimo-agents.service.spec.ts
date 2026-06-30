import { EventEmitter } from 'events';
import { Readable } from 'stream';
import axios from 'axios';
import { DimoAgentsService } from './dimo-agents.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    agentsBaseUrl: 'https://agents.test',
    dimoApiKey: 'test-api-key-value',
    agentUserWallet: '0x0000000000000000000000000000000000000001',
    agentPersonalityVehicleSpecs: undefined,
    agentPersonalityTireSpecs: undefined,
    agentPersonalityDocument: undefined,
    agentPersonalityChat: undefined,
    ...overrides,
  };
}

function makeService(overrides: Record<string, unknown> = {}) {
  const dimoAuth = {
    getDeveloperJwt: jest.fn().mockResolvedValue('eyJ.test.jwt'),
  };
  return new DimoAgentsService(makeConfig(overrides) as any, undefined, dimoAuth as any);
}

function mockSseStream(chunks: string[]) {
  const stream = new EventEmitter();
  setImmediate(() => {
    for (const chunk of chunks) {
      stream.emit('data', Buffer.from(chunk));
    }
    stream.emit('end');
  });
  return stream;
}

describe('DimoAgentsService — use-case routing', () => {
  let svc: DimoAgentsService;

  beforeEach(() => {
    svc = makeService();
    jest.spyOn(svc, 'getOrCreateAgent').mockResolvedValue({ success: true, agentId: 'agent-1' });
    jest.spyOn(svc, 'sendMessageStream').mockResolvedValue({
      success: true,
      response: '{"tankCapacityLiters":55}',
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('vehicle_specs routes to vehicle_specs useCase with tokenIds', async () => {
    await svc.getVehicleSpecs([872], { make: 'VW', model: 'Golf', year: 2020 });

    expect(svc.getOrCreateAgent).toHaveBeenCalledWith({
      useCase: 'vehicle_specs',
      vehicleIds: [872],
    });
    expect(svc.sendMessageStream).toHaveBeenCalledWith(
      'agent-1',
      expect.any(String),
      [872],
      undefined,
      { useCase: 'vehicle_specs' },
    );
  });

  it('vehicle_specs without tokenId sends no vehicleIds (knowledge-only)', async () => {
    await svc.getVehicleSpecs(undefined, { make: 'VW', model: 'Golf', year: 2020 });

    expect(svc.getOrCreateAgent).toHaveBeenCalledWith({ useCase: 'vehicle_specs' });
    expect(svc.sendMessageStream).toHaveBeenCalledWith(
      'agent-1',
      expect.any(String),
      undefined,
      undefined,
      { useCase: 'vehicle_specs' },
    );
  });

  it('tire_specs routes to tire_specs without vehicleIds', async () => {
    const emit = jest.fn();
    jest.spyOn(svc, 'sendMessageStream').mockResolvedValue({ success: true, response: '{}' });

    await svc.getTireSpecsStream({ brand: 'Michelin', model: 'Pilot Sport' }, emit);

    expect(svc.getOrCreateAgent).toHaveBeenCalledWith({ useCase: 'tire_specs' });
    expect(svc.sendMessageStream).toHaveBeenCalledWith(
      'agent-1',
      expect.stringContaining('Knowledge-only tire specification'),
      undefined,
      expect.any(Function),
      { useCase: 'tire_specs' },
    );
  });
});

describe('DimoAgentsService — error handling (mocked DIMO API)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => jest.restoreAllMocks());

  it('create agent error returns clear message without secrets', async () => {
    const svc = makeService();
    mockedAxios.post.mockResolvedValueOnce({
      status: 401,
      data: { message: 'Unauthorized Bearer eyJ.super.secret.token with DIMO_API_KEY=leaked-key' },
    } as any);

    const result = await svc.getOrCreateAgent({ useCase: 'vehicle_specs' });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(401);
    expect(result.error).toMatch(/Unauthorized/);
    expect(result.error).toContain('Bearer [redacted]');
    expect(result.error).toContain('DIMO_API_KEY [redacted]');
    expect(JSON.stringify(result)).not.toContain('leaked-key');
    expect(JSON.stringify(result)).not.toContain('eyJ.super.secret');
  });

  it('detects empty stream content clearly', async () => {
    const svc = makeService();
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      data: mockSseStream([]),
    } as any);

    const result = await svc.sendMessageStream('agent-1', 'ping', undefined, undefined, {
      useCase: 'vehicle_specs',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Empty stream/i);
  });

  it('forwards DIMO stream error payload without leaking secrets', async () => {
    const svc = makeService();
    mockedAxios.post.mockResolvedValueOnce({
      status: 200,
      data: mockSseStream([
        'data: {"error":"Agent unavailable Bearer eyJ.bad.token"}\n\n',
      ]),
    } as any);

    const result = await svc.sendMessageStream('agent-1', 'ping', undefined, undefined, {
      useCase: 'fleet_chat',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Agent unavailable');
    expect(result.error).toContain('Bearer [redacted]');
    expect(result.error).not.toContain('eyJ.bad.token');
  });

  it('stream HTTP error returns status without response body secrets', async () => {
    const svc = makeService();
    mockedAxios.post.mockResolvedValueOnce({
      status: 502,
      data: Readable.from(['DIMO_API_KEY=secret-in-body']),
    } as any);

    const result = await svc.sendMessageStream('agent-1', 'ping');

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(502);
    expect(result.error).toBe('HTTP 502');
    expect(result.error).not.toContain('secret-in-body');
  });
});
