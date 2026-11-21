// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

/**
 * Regression for F1: Master App must not clear IAM pending before retry when
 * MfaStepUpDialog completes successfully (success path no longer calls onClose).
 */
describe('Master App MFA + IAM pending orchestration', () => {
  function buildMasterMfaHandlers() {
    const clearOrgPending = vi.fn();
    const clearIamPending = vi.fn();
    const retryOrg = vi.fn().mockResolvedValue(false);
    const retryIam = vi.fn().mockResolvedValue(true);
    const skipMfaCancelCleanupRef = { current: false };
    let stepUpOpen = true;

    const onClose = () => {
      stepUpOpen = false;
      if (skipMfaCancelCleanupRef.current) {
        skipMfaCancelCleanupRef.current = false;
        return;
      }
      clearOrgPending();
      clearIamPending();
    };

    const onSuccess = () => {
      skipMfaCancelCleanupRef.current = true;
      return (async () => {
        try {
          await retryOrg();
          await retryIam();
        } finally {
          skipMfaCancelCleanupRef.current = false;
          stepUpOpen = false;
        }
      })();
    };

    return {
      clearOrgPending,
      clearIamPending,
      retryOrg,
      retryIam,
      onClose,
      onSuccess,
      get stepUpOpen() {
        return stepUpOpen;
      },
    };
  }

  it('MFA success retries IAM once without cancel cleanup', async () => {
    const h = buildMasterMfaHandlers();
    const run = h.onSuccess();
    expect(h.clearIamPending).not.toHaveBeenCalled();
    await run;
    expect(h.retryIam).toHaveBeenCalledTimes(1);
    expect(h.retryOrg).toHaveBeenCalledTimes(1);
    expect(h.clearIamPending).not.toHaveBeenCalled();
    expect(h.stepUpOpen).toBe(false);
  });

  it('MFA cancel clears pending and does not retry', () => {
    const h = buildMasterMfaHandlers();
    h.onClose();
    expect(h.clearOrgPending).toHaveBeenCalledTimes(1);
    expect(h.clearIamPending).toHaveBeenCalledTimes(1);
    expect(h.retryIam).not.toHaveBeenCalled();
  });

  it('success onClose with skip flag does not clear pending before retry completes', async () => {
    const skipMfaCancelCleanupRef = { current: true };
    const clearIamPending = vi.fn();
    const retryIam = vi.fn().mockResolvedValue(true);

  const onClose = () => {
    if (skipMfaCancelCleanupRef.current) {
      skipMfaCancelCleanupRef.current = false;
      return;
    }
    clearIamPending();
  };

    const run = (async () => {
      await retryIam();
      skipMfaCancelCleanupRef.current = false;
    })();

    onClose();
    expect(clearIamPending).not.toHaveBeenCalled();
    await run;
    expect(retryIam).toHaveBeenCalledTimes(1);
    expect(clearIamPending).not.toHaveBeenCalled();
  });
});