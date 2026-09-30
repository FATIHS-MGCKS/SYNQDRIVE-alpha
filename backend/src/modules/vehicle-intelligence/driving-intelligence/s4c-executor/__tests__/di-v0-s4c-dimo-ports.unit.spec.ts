import { buildDiV0S4cDimoAcquisitionPorts, DI_V0_S4C_DIMO_REQUEST_CONTEXT } from '../di-v0-s4c-dimo-ports';

jest.mock('@modules/dimo/provider-budget/dimo-request-context', () => ({
  runWithDimoRequestContext: jest.fn(async (_meta: unknown, fn: () => Promise<unknown>) => fn()),
}));

import { runWithDimoRequestContext } from '@modules/dimo/provider-budget/dimo-request-context';

describe('buildDiV0S4cDimoAcquisitionPorts', () => {
  it('routes acquisition through runWithDimoRequestContext(POST_TRIP_ENRICHMENT, BACKGROUND)', async () => {
    const ports = buildDiV0S4cDimoAcquisitionPorts({
      auth: { getVehicleJwt: async () => 'jwt' },
      telemetry: { queryGraphQL: async () => ({}) },
    });
    await ports.runDimo({ category: 'POST_TRIP_ENRICHMENT', priority: 'BACKGROUND' }, async () => 'ok');
    expect(runWithDimoRequestContext).toHaveBeenCalledWith(
      DI_V0_S4C_DIMO_REQUEST_CONTEXT,
      expect.any(Function),
    );
  });
});
