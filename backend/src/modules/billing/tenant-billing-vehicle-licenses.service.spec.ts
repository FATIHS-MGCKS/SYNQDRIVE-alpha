import { TenantBillingVehicleLicensesService } from './tenant-billing-vehicle-licenses.service';

describe('TenantBillingVehicleLicensesService', () => {
  const prisma = {
    billingQuantityEvent: { findMany: jest.fn(), count: jest.fn() },
  };

  let service: TenantBillingVehicleLicensesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TenantBillingVehicleLicensesService(prisma as never);
  });

  it('returns paginated vehicle license events', async () => {
    prisma.billingQuantityEvent.findMany.mockResolvedValue([
      {
        id: 'evt-1',
        eventType: 'VEHICLE_CONNECTED',
        effectiveAt: new Date('2026-07-01'),
        reason: null,
        vehicle: { licensePlate: 'B-AB 123', make: 'VW', model: 'Golf' },
      },
    ]);
    prisma.billingQuantityEvent.count.mockResolvedValue(1);

    const result = await service.listVehicleLicenses('org-a', { page: 1, pageSize: 10 });

    expect(result.data[0].licensePlate).toBe('B-AB 123');
    expect(result.data[0].eventTypeLabel).toBe('Fahrzeug abrechenbar');
    expect(result.meta.total).toBe(1);
  });

  it('applies search filter', async () => {
    prisma.billingQuantityEvent.findMany.mockResolvedValue([]);
    prisma.billingQuantityEvent.count.mockResolvedValue(0);

    await service.listVehicleLicenses('org-a', { search: 'B-AB' });

    expect(prisma.billingQuantityEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              vehicle: expect.objectContaining({
                licensePlate: { contains: 'B-AB', mode: 'insensitive' },
              }),
            }),
          ]),
        }),
      }),
    );
  });
});
