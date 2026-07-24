import { describe, expect, it, vi, beforeEach } from 'vitest';
import { executeLifecycleAction } from './data-processing-lifecycle.api';

const apiMock = vi.hoisted(() => ({
  dataProcessing: {
    lifecycle: {
      revokeActivity: vi.fn(),
      rejectActivity: vi.fn(),
    },
    review: { submitActivity: vi.fn() },
  },
  dataAuthorizations: {
    grant: vi.fn(),
    revoke: vi.fn(),
  },
}));

vi.mock('../../lib/api', () => ({ api: apiMock }));

describe('data-processing-lifecycle.api integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('routes revoke with mandatory reason to policy lifecycle', async () => {
    apiMock.dataProcessing.lifecycle.revokeActivity.mockResolvedValue({ id: 'a1' });
    await executeLifecycleAction('revoke', {
      orgId: 'org-1',
      entityKind: 'processing-activity',
      entityId: 'a1',
      reason: 'Contract ended',
    });
    expect(apiMock.dataProcessing.lifecycle.revokeActivity).toHaveBeenCalledWith(
      'org-1',
      'a1',
      'Contract ended',
    );
  });

  it('routes reject separately from revoke', async () => {
    apiMock.dataProcessing.lifecycle.rejectActivity.mockResolvedValue({ id: 'a1' });
    await executeLifecycleAction('reject', {
      orgId: 'org-1',
      entityKind: 'processing-activity',
      entityId: 'a1',
      reason: 'Incomplete',
    });
    expect(apiMock.dataProcessing.lifecycle.rejectActivity).toHaveBeenCalled();
    expect(apiMock.dataProcessing.lifecycle.revokeActivity).not.toHaveBeenCalled();
  });

  it('surfaces conflict errors from API', async () => {
    apiMock.dataProcessing.lifecycle.revokeActivity.mockRejectedValue(
      new Error('[POLICY_IMMUTABLE] Active conflict'),
    );
    await expect(
      executeLifecycleAction('revoke', {
        orgId: 'org-1',
        entityKind: 'processing-activity',
        entityId: 'a1',
        reason: 'x',
      }),
    ).rejects.toThrow('Active conflict');
  });
});
