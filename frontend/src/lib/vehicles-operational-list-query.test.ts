import { describe, expect, it } from 'vitest';
import { buildVehiclesOperationalListQuery } from './vehicles-operational-list-query';

describe('buildVehiclesOperationalListQuery', () => {
  it('R — sends registryLifecycle=all explicitly', () => {
    const qs = buildVehiclesOperationalListQuery({ registryLifecycle: 'all', page: 1 });
    expect(qs).toContain('registryLifecycle=all');
  });

  it('drops other filters when value is all', () => {
    const qs = buildVehiclesOperationalListQuery({
      registryLifecycle: 'ACTIVE',
      integrationConnectivity: 'all',
    });
    expect(qs).toContain('registryLifecycle=ACTIVE');
    expect(qs).not.toContain('integrationConnectivity');
  });
});
