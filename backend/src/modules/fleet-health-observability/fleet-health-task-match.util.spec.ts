import {
  classifyHealthTaskLegacyMatch,
  countAmbiguousHealthTaskLegacyMatches,
  type FleetHealthTaskMatchInput,
} from './fleet-health-task-match.util';

function task(overrides: Partial<FleetHealthTaskMatchInput>): FleetHealthTaskMatchInput {
  return {
    vehicleId: 'v1',
    status: 'OPEN',
    type: 'VEHICLE_SERVICE',
    sourceType: 'HEALTH',
    source: null,
    blocksVehicleAvailability: false,
    metadata: { healthModule: 'battery' },
    ...overrides,
  };
}

describe('fleet-health task match util', () => {
  it('returns module_exact for matching health module task', () => {
    const outcome = classifyHealthTaskLegacyMatch(
      [task({ metadata: { healthModule: 'battery' } })],
      'v1',
      'battery',
      false,
    );
    expect(outcome).toBe('module_exact');
  });

  it('detects ambiguous legacy matches when multiple paths apply', () => {
    const outcome = classifyHealthTaskLegacyMatch(
      [
        task({
          metadata: { healthModule: 'battery' },
          sourceType: 'HEALTH',
        }),
        task({
          metadata: {},
          blocksVehicleAvailability: true,
          sourceType: 'MANUAL',
        }),
      ],
      'v1',
      'battery',
      true,
    );
    expect(outcome).toBe('ambiguous');
  });

  it('counts vehicles with multiple health modules as ambiguous', () => {
    const count = countAmbiguousHealthTaskLegacyMatches([
      task({ metadata: { healthModule: 'battery' } }),
      task({ metadata: { healthModule: 'tires' }, type: 'TIRE_SERVICE' }),
    ]);
    expect(count).toBe(1);
  });
});
