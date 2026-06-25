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
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartDiditSession.mockResolvedValue({
      url: 'https://verify.didit.me/session/abc',
      sessionId: 'sess-1',
      checkId: 'check-1',
      status: 'PENDING',
    });
    DiditSdk.shared.startVerification = vi.fn();
    DiditSdk.shared.onComplete = undefined;
  });

  it('calls backend and passes only session url to DiditSdk', async () => {
    await startDiditVerificationSession('cust-1', 'book-1', 'ID_DOCUMENT', vi.fn());

    expect(mockStartDiditSession).toHaveBeenCalledWith('cust-1', 'book-1', 'ID_DOCUMENT');
    expect(DiditSdk.shared.startVerification).toHaveBeenCalledWith({
      url: 'https://verify.didit.me/session/abc',
    });
    const callArg = (DiditSdk.shared.startVerification as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(Object.keys(callArg)).toEqual(['url']);
  });

  it('onComplete triggers callback only — no local verified state', async () => {
    const onComplete = vi.fn();
    await startDiditVerificationSession('cust-1', undefined, 'DRIVING_LICENSE', onComplete);

    await DiditSdk.shared.onComplete?.({ type: 'completed' });
    expect(onComplete).toHaveBeenCalledWith('completed');
    expect(onComplete).not.toHaveBeenCalledWith('verified');
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
