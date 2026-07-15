import { describe, expect, it } from 'vitest';
import { taskQueryKeys } from './query-keys';
import { TASK_BUCKETS } from './types';

describe('task query keys', () => {
  it('builds stable list keys regardless of filter property order', () => {
    const a = taskQueryKeys.list('org1', { bucket: 'OVERDUE', priority: 'HIGH' });
    const b = taskQueryKeys.list('org1', { priority: 'HIGH', bucket: 'OVERDUE' });
    expect(a).toEqual(b);
  });

  it('separates bucket list keys from generic list keys', () => {
    const bucketKey = taskQueryKeys.listBucket('org1', 'TODAY', { assignedUserId: 'u1' });
    const listKey = taskQueryKeys.list('org1', { bucket: 'TODAY', assignedUserId: 'u1' });
    expect(bucketKey).not.toEqual(listKey);
    expect(bucketKey[3]).toBe('bucket');
    expect(bucketKey[4]).toBe('TODAY');
  });

  it('exposes canonical bucket ids aligned with backend', () => {
    expect(TASK_BUCKETS).toEqual([
      'NOW',
      'TODAY',
      'UPCOMING',
      'PLANNED',
      'OVERDUE',
      'UNASSIGNED',
      'ALL_OPEN',
      'COMPLETED',
    ]);
  });
});
