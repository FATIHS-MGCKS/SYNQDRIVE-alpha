import { AiVehicleBookingContextReadAdapter } from './ai-vehicle-booking-context-read.adapter';
import type { VehicleBookingContextService } from '../vehicle-booking-context/vehicle-booking-context.service';

describe('AiVehicleBookingContextReadAdapter', () => {
  const getVehicleBookingOperationalContext = jest.fn();
  const vehicleBookingContext = {
    getVehicleBookingOperationalContext,
  } as unknown as VehicleBookingContextService;
  const adapter = new AiVehicleBookingContextReadAdapter(vehicleBookingContext);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates with organizationId, vehicleId, and options', async () => {
    getVehicleBookingOperationalContext.mockResolvedValue({ vehicleId: 'v1', contextKind: 'NONE' });

    await adapter.getVehicleBookingOperationalContext('org-a', 'v1', {
      now: new Date('2026-01-01'),
      includeCustomerDisplayName: true,
    });

    expect(getVehicleBookingOperationalContext).toHaveBeenCalledWith('org-a', 'v1', {
      now: new Date('2026-01-01'),
      includeCustomerDisplayName: true,
    });
  });

  it('returns null when service returns null', async () => {
    getVehicleBookingOperationalContext.mockResolvedValue(null);
    await expect(adapter.getVehicleBookingOperationalContext('org-a', 'missing')).resolves.toBeNull();
  });
});