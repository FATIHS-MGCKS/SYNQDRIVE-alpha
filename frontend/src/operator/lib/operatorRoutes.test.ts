import { describe, expect, it } from 'vitest';
import {
  buildOperatorBookingUrl,
  buildOperatorScanQueryUrl,
  buildOperatorVehicleUrl,
  isUuidLike,
  resolveOperatorDeepLink,
} from './operatorRoutes';

const BOOKING_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '22222222-2222-4222-8222-222222222222';

describe('operator deep links', () => {
  it('recognizes canonical UUIDs', () => {
    expect(isUuidLike(BOOKING_ID)).toBe(true);
    expect(isUuidLike('not-a-uuid')).toBe(false);
  });

  it('resolves vehicle path params', () => {
    expect(
      resolveOperatorDeepLink('/operator/vehicles/x', new URLSearchParams(), {
        vehicleId: VEHICLE_ID,
      }),
    ).toEqual({ type: 'vehicle', vehicleId: VEHICLE_ID });
  });

  it('resolves booking path params', () => {
    expect(
      resolveOperatorDeepLink('/operator/bookings/x', new URLSearchParams(), {
        bookingId: BOOKING_ID,
      }),
    ).toEqual({ type: 'booking', bookingId: BOOKING_ID });
  });

  it('resolves scan query from q parameter', () => {
    expect(resolveOperatorDeepLink('/operator', new URLSearchParams('q=B-XY%20123'))).toEqual({
      type: 'scan',
      query: 'B-XY 123',
    });
  });

  it('resolves tab intents from query string', () => {
    expect(resolveOperatorDeepLink('/operator', new URLSearchParams('tab=tasks'))).toEqual({
      type: 'tab',
      tab: 'tasks',
    });
  });

  it('ignores invalid tab values', () => {
    expect(resolveOperatorDeepLink('/operator', new URLSearchParams('tab=settings'))).toBeNull();
  });

  it('maps /scan suffix to scan tab', () => {
    expect(resolveOperatorDeepLink('/operator/scan', new URLSearchParams())).toEqual({
      type: 'tab',
      tab: 'scan',
    });
  });

  it('prefers path vehicle over query booking', () => {
    expect(
      resolveOperatorDeepLink(
        '/operator/vehicles/x',
        new URLSearchParams(`bookingId=${BOOKING_ID}`),
        { vehicleId: VEHICLE_ID },
      ),
    ).toEqual({ type: 'vehicle', vehicleId: VEHICLE_ID });
  });
});

describe('operator URL builders', () => {
  it('builds stable vehicle and booking URLs', () => {
    expect(buildOperatorVehicleUrl(VEHICLE_ID)).toContain(`/operator/vehicles/${VEHICLE_ID}`);
    expect(buildOperatorBookingUrl(BOOKING_ID)).toContain(`/operator/bookings/${BOOKING_ID}`);
    expect(buildOperatorScanQueryUrl('B-XY 123')).toContain('tab=scan');
    expect(buildOperatorScanQueryUrl('B-XY 123')).toContain('q=B-XY%20123');
  });
});
