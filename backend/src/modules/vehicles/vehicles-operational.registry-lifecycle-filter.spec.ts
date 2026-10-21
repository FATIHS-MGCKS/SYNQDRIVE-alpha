import { VehiclesOperationalService } from './vehicles-operational.service';

describe('VehiclesOperationalService registryLifecycle filter (VO5C-P2A)', () => {
  const svc = Object.create(VehiclesOperationalService.prototype) as VehiclesOperationalService;
  const buildWhere = (query: Parameters<VehiclesOperationalService['findAllOperational']>[0]) =>
    (svc as unknown as { buildRegisteredWhere: (q: typeof query) => Record<string, unknown> }).buildRegisteredWhere(
      query,
    );

  it('omits lifecycle predicate when parameter is omitted (legacy clients)', () => {
    const where = buildWhere({ registrationState: 'registered' });
    expect(where.registryLifecycle).toBeUndefined();
  });

  it('filters ACTIVE, OFFBOARDED and ARCHIVED explicitly', () => {
    expect(buildWhere({ registryLifecycle: 'ACTIVE' })).toMatchObject({
      registryLifecycle: 'ACTIVE',
    });
    expect(buildWhere({ registryLifecycle: 'OFFBOARDED' })).toMatchObject({
      registryLifecycle: 'OFFBOARDED',
    });
    expect(buildWhere({ registryLifecycle: 'ARCHIVED' })).toMatchObject({
      registryLifecycle: 'ARCHIVED',
    });
  });

  it('omits lifecycle predicate for ALL', () => {
    const where = buildWhere({ registryLifecycle: 'all' });
    expect(where.registryLifecycle).toBeUndefined();
  });
});
