import { describe, expect, it } from 'vitest';
import {
  formatPostMutationSyncFailure,
  isSyncRefreshFailure,
  resolveGuardedMutationError,
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

  it('resolveGuardedMutationError keeps saved-but-sync-failed wording (not raw prefix)', () => {
    const err = syncRefreshFailedError('network down');
    expect(isSyncRefreshFailure(err)).toBe(true);
    const shown = resolveGuardedMutationError(err);
    expect(shown).toContain('wurde gespeichert');
    expect(shown).not.toContain('SYNC_REFRESH_FAILED');
  });
});