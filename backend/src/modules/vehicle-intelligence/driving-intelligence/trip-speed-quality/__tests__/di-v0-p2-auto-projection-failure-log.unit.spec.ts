import { Prisma } from '@prisma/client';
import {
  attachDiV0P2AutoProjectionFailureStep,
  formatDiV0P2AutoProjectionFailureForLog,
  readDiV0P2AutoProjectionFailureStep,
} from '../di-v0-p2-auto-projection-failure-log';
import { DiV0TripSpeedQualityProjectionError } from '../di-v0-trip-speed-quality-projection.errors';

describe('P2 auto projection failure logging', () => {
  it('preserves compute vs persist failureStep without wrapping instanceof', () => {
    const err = new Error('boom');
    attachDiV0P2AutoProjectionFailureStep(err, 'persist');
    expect(readDiV0P2AutoProjectionFailureStep(err)).toBe('persist');
    expect(err instanceof Error).toBe(true);
  });

  it('logs projection errors with explicit code only', () => {
    const err = new DiV0TripSpeedQualityProjectionError('SNAPSHOT_VERIFICATION_FAILED', 'drift');
    attachDiV0P2AutoProjectionFailureStep(err, 'compute');
    const line = formatDiV0P2AutoProjectionFailureForLog(err);
    expect(line).toContain('failureStep=compute');
    expect(line).toContain('code=SNAPSHOT_VERIFICATION_FAILED');
    expect(line).not.toContain('meta');
  });

  it('logs Prisma known errors with prismaCode only (no meta blob)', () => {
    const err = new Prisma.PrismaClientKnownRequestError('FK', {
      code: 'P2003',
      clientVersion: '5.22.0',
      meta: { field_name: 'organization_id (index)' },
    });
    const line = formatDiV0P2AutoProjectionFailureForLog(err, 'persist');
    expect(line).toContain('prismaCode=P2003');
    expect(line).not.toContain('organization_id');
  });
});
