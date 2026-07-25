import { describe, expect, it, vi } from 'vitest';
import { ApiHttpError } from '../../lib/httpError';
import {
  extractDraftConflict,
  isHandoverDraftVersionConflict,
  withDraftSaveRetry,
} from './operatorHandoverDraftSync';

describe('operatorHandoverDraftSync', () => {
  it('detects version conflict codes', () => {
    const err = new ApiHttpError(
      409,
      { code: 'HANDOVER_DRAFT_VERSION_CONFLICT', currentVersion: 7, message: 'conflict' },
      '/draft',
    );
    expect(isHandoverDraftVersionConflict(err)).toBe(true);
    expect(extractDraftConflict(err)?.serverVersion).toBe(7);
  });

  it('retries retryable errors and eventually succeeds', async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce(new ApiHttpError(503, { message: 'down' }, '/draft'))
      .mockResolvedValueOnce({ version: 2 });

    const result = await withDraftSaveRetry(op);
    expect(result).toEqual({ version: 2 });
    expect(op).toHaveBeenCalledTimes(2);
  });

  it('does not retry version conflicts', async () => {
    const err = new ApiHttpError(
      409,
      { code: 'HANDOVER_DRAFT_VERSION_CONFLICT', currentVersion: 4 },
      '/draft',
    );
    const op = vi.fn().mockRejectedValue(err);

    await expect(withDraftSaveRetry(op)).rejects.toBe(err);
    expect(op).toHaveBeenCalledTimes(1);
  });
});
