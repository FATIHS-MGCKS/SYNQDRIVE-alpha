import { resolveProviderPollEligibility } from './vehicle-connectivity-runtime-batch.assembler';

describe('resolveProviderPollEligibility — registry lifecycle (VO5C D1)', () => {
  const connectedVehicle = {
    status: 'AVAILABLE',
    registryLifecycle: 'ACTIVE',
    dimoVehicleId: 'dv-1',
    dimoVehicle: { connectionStatus: 'CONNECTED', tokenId: 187336, lastSignal: null },
  };

  it('ACTIVE CONNECTED vehicle remains poll-eligible', () => {
    expect(resolveProviderPollEligibility(connectedVehicle)).toBe(true);
  });

  it('OFFBOARDED vehicle is not poll-eligible even when mirror is CONNECTED', () => {
    expect(
      resolveProviderPollEligibility({
        ...connectedVehicle,
        registryLifecycle: 'OFFBOARDED',
      }),
    ).toBe(false);
  });

  it('ARCHIVED vehicle is not poll-eligible', () => {
    expect(
      resolveProviderPollEligibility({
        ...connectedVehicle,
        registryLifecycle: 'ARCHIVED',
      }),
    ).toBe(false);
  });
});
