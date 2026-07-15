import {
  buildVehicleCleaningMetadata,
  isBareLegacyVehicleCleaningDedupKey,
  isCanonicalVehicleCleaningDedupKey,
  isLegacyBookingCleanDedupKey,
  legacyBookingCleanDedupKey,
  resolveCleaningPriorityFromPickup,
  resolveCleaningPurpose,
  vehicleCleaningDedupKey,
} from './vehicle-cleaning-task.util';

describe('vehicle-cleaning-task.util', () => {
  it('builds canonical dedup keys per vehicle and preparation window', () => {
    expect(vehicleCleaningDedupKey('v1', 'PRE_BOOKING')).toBe('vehicle:cleaning:v1:pre-booking');
    expect(vehicleCleaningDedupKey('v1', 'STANDALONE')).toBe('vehicle:cleaning:v1:standalone');
  });

  it('detects legacy and canonical dedup namespaces', () => {
    expect(isLegacyBookingCleanDedupKey(legacyBookingCleanDedupKey('b1'))).toBe(true);
    expect(isCanonicalVehicleCleaningDedupKey('vehicle:cleaning:v1:pre-booking')).toBe(true);
    expect(isBareLegacyVehicleCleaningDedupKey('vehicle:cleaning:v1')).toBe(true);
    expect(isBareLegacyVehicleCleaningDedupKey('vehicle:cleaning:v1:standalone')).toBe(false);
  });

  it('resolves cleaning purpose from booking context', () => {
    expect(resolveCleaningPurpose({ nextBookingId: 'b1' })).toBe('PRE_BOOKING');
    expect(resolveCleaningPurpose({ preparationWindow: 'PRE_BOOKING' })).toBe('PRE_BOOKING');
    expect(resolveCleaningPurpose({})).toBe('STANDALONE');
  });

  it('escalates priority when pickup is within 24 hours', () => {
    const now = new Date('2026-07-15T12:00:00.000Z');
    expect(resolveCleaningPriorityFromPickup(new Date('2026-07-16T10:00:00.000Z'), now)).toBe('HIGH');
    expect(resolveCleaningPriorityFromPickup(new Date('2026-07-20T10:00:00.000Z'), now)).toBe('NORMAL');
  });

  it('structures metadata with booking as context only', () => {
    const metadata = buildVehicleCleaningMetadata({
      dedupKey: 'vehicle:cleaning:v1:pre-booking',
      vehicleId: 'v1',
      cleaningPurpose: 'PRE_BOOKING',
      nextBookingId: 'b1',
      nextPickupAt: '2026-07-25T10:00:00.000Z',
      customerId: 'c1',
    });
    expect(metadata).toMatchObject({
      generatedKey: 'vehicle:cleaning:v1:pre-booking',
      vehicleId: 'v1',
      cleaning: {
        purpose: 'PRE_BOOKING',
        preparationWindow: 'PRE_BOOKING',
        nextBookingId: 'b1',
      },
    });
  });
});
