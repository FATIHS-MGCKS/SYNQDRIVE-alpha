import { describe, expect, it, vi } from 'vitest';
import {
  invalidateRentalHealthForVehicle,
  registerRentalHealthReloadHandler,
  registerRentalHealthVehicleReloadHandler,
  resetRentalHealthReloadHandlers,
} from './invalidate';

describe('rental-health invalidate bus', () => {
  it('dispatches org and vehicle reload handlers', () => {
    resetRentalHealthReloadHandlers();
    const orgHandler = vi.fn();
    const vehicleHandler = vi.fn();

    registerRentalHealthReloadHandler('org-1', orgHandler);
    registerRentalHealthVehicleReloadHandler('org-1', 'veh-1', vehicleHandler);

    invalidateRentalHealthForVehicle('org-1', 'veh-1');

    expect(orgHandler).toHaveBeenCalledTimes(1);
    expect(vehicleHandler).toHaveBeenCalledTimes(1);
  });
});
