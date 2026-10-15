import { Prisma } from '@prisma/client';
import {
  DiV0TripSpeedQualityProjectionError,
  DiV0TripSpeedQualityProjectionPersistenceError,
  resolveDiV0TripSpeedQualityProjectionErrorCode,
} from '../di-v0-trip-speed-quality-projection.errors';

describe('resolveDiV0TripSpeedQualityProjectionErrorCode', () => {
  it('reads DiV0TripSpeedQualityProjectionError codes', () => {
    const err = new DiV0TripSpeedQualityProjectionError('SNAPSHOT_VERIFICATION_FAILED', 'drift');
    expect(resolveDiV0TripSpeedQualityProjectionErrorCode(err)).toBe('SNAPSHOT_VERIFICATION_FAILED');
  });

  it('maps persistence errors without instanceof on projection error', () => {
    const err = new DiV0TripSpeedQualityProjectionPersistenceError('CURRENT_SCOPE_CONFLICT', 'race');
    expect(resolveDiV0TripSpeedQualityProjectionErrorCode(err)).toBe('PERSIST_AUTHORITY_REJECTED');
  });

  it('parses canonical message prefix when instanceof fails (duplicate bundle)', () => {
    const foreign = Object.assign(new Error('DI_V0_TRIP_SPEED_QUALITY:NOT_ACTIVE_PRIMARY:stale'), {
      code: 'NOT_ACTIVE_PRIMARY',
    });
    expect(resolveDiV0TripSpeedQualityProjectionErrorCode(foreign)).toBe('NOT_ACTIVE_PRIMARY');
  });

  it('maps Prisma known request errors to PERSIST_DATABASE_REJECTED', () => {
    const err = new Prisma.PrismaClientKnownRequestError('FK violation', {
      code: 'P2003',
      clientVersion: '5.22.0',
    });
    expect(resolveDiV0TripSpeedQualityProjectionErrorCode(err)).toBe('PERSIST_DATABASE_REJECTED');
  });
});
