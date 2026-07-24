import {
  classifyVehicleDetailProviderError,
  redactVehicleDetailLogContext,
} from './vehicle-detail-log.util';

describe('vehicle-detail log util', () => {
  it('redacts coordinates and secrets from log context', () => {
    expect(
      redactVehicleDetailLogContext({
        endpoint: 'live_gps',
        latitude: 51.3,
        longitude: 9.4,
        token: 'secret',
        errorClass: 'timeout',
      }),
    ).toEqual({
      endpoint: 'live_gps',
      errorClass: 'timeout',
    });
  });

  it('classifies provider errors without leaking payload', () => {
    expect(classifyVehicleDetailProviderError({ status: 429 })).toBe('rate_limited');
    expect(classifyVehicleDetailProviderError({ code: 'ETIMEDOUT' })).toBe('timeout');
    expect(classifyVehicleDetailProviderError({ status: 403 })).toBe('auth');
    expect(classifyVehicleDetailProviderError(new Error('provider down'))).toBe('provider_error');
  });
});
