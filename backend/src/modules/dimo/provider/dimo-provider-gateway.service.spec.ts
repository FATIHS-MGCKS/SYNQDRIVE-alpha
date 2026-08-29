import { DimoProviderGateway } from './dimo-provider-gateway.service';
import { DimoProviderOperation } from './dimo-provider-gateway.types';

describe('DimoProviderGateway (S1 pass-through)', () => {
  const gateway = new DimoProviderGateway();

  it('returns invoke result unchanged', async () => {
    const result = await gateway.execute({
      operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
      requestContext: { tokenId: 42 },
      invoke: async () => ({ data: { ok: true } }),
    });
    expect(result).toEqual({ data: { ok: true } });
  });

  it('propagates invoke rejection unchanged', async () => {
    const err = Object.assign(new Error('DIMO GraphQL error: forbidden'), {
      response: { status: 403 },
    });
    await expect(
      gateway.execute({
        operation: DimoProviderOperation.TELEMETRY_GRAPHQL,
        invoke: async () => {
          throw err;
        },
      }),
    ).rejects.toBe(err);
  });
});
