import { BadRequestException } from '@nestjs/common';
import {
  buildFleetRentalHealthCursorWhere,
  decodeFleetRentalHealthCursor,
  encodeFleetRentalHealthCursor,
  encodeFleetRentalHealthCursorFromVehicle,
  resolveFleetRentalHealthLimit,
} from './rental-health-fleet-cursor.util';

describe('rental-health-fleet-cursor.util', () => {
  it('caps requested limit to the safe maximum', () => {
    expect(resolveFleetRentalHealthLimit()).toBe(25);
    expect(resolveFleetRentalHealthLimit(10)).toBe(10);
    expect(resolveFleetRentalHealthLimit(100)).toBe(50);
  });

  it('round-trips cursor payloads', () => {
    const encoded = encodeFleetRentalHealthCursor({
      v: 'DEFAULT',
      id: 'veh-2',
      licensePlate: 'B-XY 123',
    });

    expect(decodeFleetRentalHealthCursor(encoded)).toMatchObject({
      v: 'DEFAULT',
      id: 'veh-2',
      licensePlate: 'B-XY 123',
    });
  });

  it('rejects invalid cursors', () => {
    expect(() => decodeFleetRentalHealthCursor('bad')).toThrow(BadRequestException);
  });

  it('builds cursor where from vehicle row', () => {
    const cursor = encodeFleetRentalHealthCursorFromVehicle({
      id: 'veh-9',
      licensePlate: 'M-AB 999',
    });

    const where = buildFleetRentalHealthCursorWhere(decodeFleetRentalHealthCursor(cursor));
    expect(where).toEqual(expect.objectContaining({ OR: expect.any(Array) }));
  });
});
