import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * VO-3 non-cutover characterization — legacy paths remain unchanged in this slice.
 */
describe('VO-3 legacy registration path characterization', () => {
  it('registerFromDimo still contains known synthetic VIN debt', () => {
    const src = readFileSync(
      join(__dirname, '../../vehicles/vehicles.service.ts'),
      'utf8',
    );
    expect(src).toContain('dimoVehicle.vin || `DIMO-${dimoVehicle.externalId}`');
  });

  it('registerHmOnlyVehicle entry still exists', () => {
    const src = readFileSync(
      join(__dirname, '../../high-mobility/high-mobility-registration.service.ts'),
      'utf8',
    );
    expect(src).toContain('async registerHmOnlyVehicle');
  });
});
