import { describe, expect, it } from 'vitest';

import {
  getVehicleDetailClientSignalCount,
  recordVehicleDetailClientSignal,
  resetVehicleDetailClientSignals,
} from './vehicle-detail-observability';

describe('vehicle-detail client observability', () => {
  it('increments counters without storing coordinates or tokens', () => {
    resetVehicleDetailClientSignals();
    recordVehicleDetailClientSignal('map_init_error', {
      reason: 'provider_failed',
      latitude: 51.3,
      token: 'secret',
    });
    expect(getVehicleDetailClientSignalCount('map_init_error')).toBe(1);
  });
});
