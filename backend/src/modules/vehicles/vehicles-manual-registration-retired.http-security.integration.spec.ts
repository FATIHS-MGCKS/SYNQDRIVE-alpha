import { MANUAL_VEHICLE_REGISTRATION_RETIRED_CODE } from './legacy-manual-vehicle-registration.errors';
import { VehiclesController } from './vehicles.controller';

describe('Vehicles manual registration retirement (controller contract)', () => {
  const vehiclesService = {
    create: jest.fn(),
  };

  const controller = new VehiclesController(
    vehiclesService as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createByOrg fails closed before VehiclesService.create', async () => {
    await expect(
      controller.createByOrg('org-1', { vin: 'VIN1' } as never, { user: { id: 'u1' } }),
    ).rejects.toMatchObject({
      response: { code: MANUAL_VEHICLE_REGISTRATION_RETIRED_CODE },
    });
    expect(vehiclesService.create).not.toHaveBeenCalled();
  });
});