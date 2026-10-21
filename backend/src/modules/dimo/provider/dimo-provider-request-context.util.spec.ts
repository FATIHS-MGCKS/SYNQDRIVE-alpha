import {
  buildDimoProviderRequestContext,
  mergeDimoProviderRequestContext,
} from './dimo-provider-request-context.util';

describe('dimo-provider-request-context.util', () => {
  it('buildDimoProviderRequestContext merges tokenId with vehicle/org', () => {
    expect(
      buildDimoProviderRequestContext(42, {
        vehicleId: 'veh-1',
        organizationId: 'org-1',
      }),
    ).toEqual({
      tokenId: 42,
      vehicleId: 'veh-1',
      organizationId: 'org-1',
    });
  });

  it('mergeDimoProviderRequestContext preserves override fields', () => {
    expect(
      mergeDimoProviderRequestContext(
        { tokenId: 1, organizationId: 'org-a' },
        { vehicleId: 'veh-b' },
      ),
    ).toEqual({
      tokenId: 1,
      organizationId: 'org-a',
      vehicleId: 'veh-b',
    });
  });
});
