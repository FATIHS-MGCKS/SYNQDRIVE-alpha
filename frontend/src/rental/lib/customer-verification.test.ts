import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DiditSdk } from '@didit-protocol/sdk-web';

const mockStartDiditSession = vi.fn();
const mockGetEligibility = vi.fn();

vi.mock('../../lib/api', () => ({
  api: {
    customerVerification: {
      startDiditSession: (...args: unknown[]) => mockStartDiditSession(...args),
      getEligibility: (...args: unknown[]) => mockGetEligibility(...args),
    },
  },
}));

import { startDiditVerificationSession } from './diditVerificationFlow';
import {
  DIDIT_CONSENT_TEXT,
  diditCompleteMessage,
  documentEligibilityLabelDe,
} from './customer-verification';

describe('startDiditVerificationSession', () => {
  const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    vi.clearAllMocks();
    mockStartDiditSession.mockResolvedValue({
      url: 'https://verify.didit.me/session/abc',
      sessionId: 'sess-1',
      checkId: 'check-1',
      status: 'PENDING',
    });
    DiditSdk.shared.startVerification = vi.fn().mockResolvedValue(undefined);
    DiditSdk.shared.close = vi.fn();
    DiditSdk.shared.onComplete = undefined;
    DiditSdk.shared.onStateChange = undefined;
  });

  it('calls backend and passes only session url to DiditSdk', async () => {
    const promise = startDiditVerificationSession('cust-1', 'book-1', 'ID_DOCUMENT', vi.fn());
    await flushPromises();

    expect(mockStartDiditSession).toHaveBeenCalledWith('cust-1', 'book-1', 'ID_DOCUMENT');
    expect(DiditSdk.shared.startVerification).toHaveBeenCalledWith({
      url: 'https://verify.didit.me/session/abc',
      configuration: expect.objectContaining({
        closeModalOnComplete: true,
      }),
    });

    await DiditSdk.shared.onComplete?.({ type: 'completed' });
    await promise;
  });

  it('onComplete triggers callback only — no local verified state', async () => {
    const onComplete = vi.fn();
    const promise = startDiditVerificationSession('cust-1', undefined, 'DRIVING_LICENSE', onComplete);
    await flushPromises();

    await DiditSdk.shared.onComplete?.({ type: 'completed' });
    await promise;

    expect(onComplete).toHaveBeenCalledWith('completed');
    expect(onComplete).not.toHaveBeenCalledWith('verified');
  });

  it('rejects when Didit SDK reports error state', async () => {
    const promise = startDiditVerificationSession('cust-1', undefined, 'ID_DOCUMENT', vi.fn());
    await flushPromises();

    DiditSdk.shared.onStateChange?.('error', 'Iframe blocked');

    await expect(promise).rejects.toThrow('Iframe blocked');
    expect(DiditSdk.shared.close).toHaveBeenCalled();
  });
});

describe('customer-verification copy', () => {
  it('consent text mentions Didit without Veriff/KYC branding', () => {
    expect(DIDIT_CONSENT_TEXT).toContain('Didit');
    expect(DIDIT_CONSENT_TEXT).not.toMatch(/Veriff/i);
    expect(DIDIT_CONSENT_TEXT).not.toMatch(/\bKYC\b/);
  });

  it('complete message does not approve locally', () => {
    expect(diditCompleteMessage('completed')).toContain('Server');
    expect(diditCompleteMessage('completed')).not.toMatch(/verifiziert/i);
  });

  it('uses German document verification labels', () => {
    expect(documentEligibilityLabelDe('verified')).toBe('Geprüft');
    expect(documentEligibilityLabelDe('pickup_required')).toBe('Prüfung beim Pickup');
    expect(documentEligibilityLabelDe('requires_review')).toBe('Manuell prüfen');
  });
});
