import { describe, expect, it } from 'vitest';
import {
  formatPostMutationSyncFailure,
  shouldApplyGrantLoadResult,
  syncRefreshFailedError,
} from './product-management-sync-errors';

describe('product-management-sync-errors', () => {
  it('shouldApplyGrantLoadResult rejects stale product context', () => {
    expect(shouldApplyGrantLoadResult(2, 2, 'VYMOD', 'RENTAL')).toBe(false);
    expect(shouldApplyGrantLoadResult(2, 3, 'VYMOD', 'VYMOD')).toBe(false);
    expect(shouldApplyGrantLoadResult(2, 2, 'VYMOD', 'VYMOD')).toBe(true);
  });

  it('formatPostMutationSyncFailure distinguishes sync failure after save', () => {
    const err = syncRefreshFailedError('network');
    expect(formatPostMutationSyncFailure(err)).toContain('wurde gespeichert');
    expect(formatPostMutationSyncFailure(new Error('plain'))).toBe('plain');
  });
});