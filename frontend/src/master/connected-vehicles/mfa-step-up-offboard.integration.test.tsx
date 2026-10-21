// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MfaStepUpDialog } from '../../components/mfa/MfaStepUpDialog';

const challengeMock = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    account: {
      mfa: {
        challenge: (...args: unknown[]) => challengeMock(...args),
      },
    },
  },
}));

vi.mock('../../lib/auth', () => ({
  getStoredUser: () => ({ id: 'u1' }),
  setAuth: vi.fn(),
}));

vi.mock('../../lib/mfa', () => ({
  newIdempotencyKey: () => 'mfa:key',
  setStepUpToken: vi.fn(),
}));

describe('MfaStepUpDialog + Hub offboard callback order', () => {
  beforeEach(() => {
    challengeMock.mockReset();
    challengeMock.mockResolvedValue({ stepUpToken: 'step', accessToken: 'access' });
  });

  it('onSuccess then onClose does not run abandon cleanup', async () => {
    const abandonPending = vi.fn();
    const retryAfterMfa = vi.fn().mockResolvedValue(null);
    const skipMfaCancelCleanupRef = { current: false };

    const handleMfaSuccess = async () => {
      await retryAfterMfa();
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        createElement(MfaStepUpDialog, {
          open: true,
          action: 'MASTER_INTEGRATIONS',
          onSuccess: () => {
            skipMfaCancelCleanupRef.current = true;
            void handleMfaSuccess();
          },
          onClose: () => {
            if (skipMfaCancelCleanupRef.current) {
              skipMfaCancelCleanupRef.current = false;
              return;
            }
            abandonPending();
          },
        }),
      );
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    const verifyBtn = buttons.find((b) => b.textContent === 'Bestätigen');
    expect(verifyBtn).toBeTruthy();

    await act(async () => {
      verifyBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(retryAfterMfa).toHaveBeenCalled();
    expect(abandonPending).not.toHaveBeenCalled();

    root.unmount();
    container.remove();
  });
});
