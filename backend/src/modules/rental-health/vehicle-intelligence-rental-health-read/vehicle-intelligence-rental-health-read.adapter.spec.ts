import { VehicleIntelligenceRentalHealthReadAdapter } from './vehicle-intelligence-rental-health-read.adapter';
import type { RentalHealthService } from '../rental-health.service';

describe('VehicleIntelligenceRentalHealthReadAdapter', () => {
  const getVehicleHealth = jest.fn();
  const rentalHealth = { getVehicleHealth } as unknown as RentalHealthService;
  const adapter = new VehicleIntelligenceRentalHealthReadAdapter(rentalHealth);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates organizationId and vehicleId unchanged', async () => {
    getVehicleHealth.mockResolvedValue({ vehicle_id: 'v1' });

    await adapter.getVehicleHealth('org-a', 'v1');

    expect(getVehicleHealth).toHaveBeenCalledWith('org-a', 'v1');
  });

  it('returns service result', async () => {
    const payload = { vehicle_id: 'v1', overall_state: 'good' };
    getVehicleHealth.mockResolvedValue(payload);
    await expect(adapter.getVehicleHealth('org-a', 'v1')).resolves.toEqual(payload);
  });
});