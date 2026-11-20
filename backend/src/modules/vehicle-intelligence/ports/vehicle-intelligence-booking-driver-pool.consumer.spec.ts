import * as fs from 'fs';
import * as path from 'path';

const CONSUMERS = [
  'driver-attribution/driver-attribution.service.ts',
  'trips/trip-attribution.service.ts',
  'trips/trip-canonical-hydration.batch.ts',
];

describe('VI booking driver pool port — consumer wiring', () => {
  for (const relative of CONSUMERS) {
    it(`${relative} uses port contract and does not import booking-allowed-drivers.util`, () => {
      const src = fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');
      expect(src).toMatch(
        /VEHICLE_INTELLIGENCE_BOOKING_DRIVER_POOL_PORT|VehicleIntelligenceBookingDriverPoolPort/,
      );
      expect(src).not.toMatch(/from ['"].*booking-allowed-drivers\.util/);
    });
  }
});