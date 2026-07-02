import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  const openMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('window', {
      open: openMock,
      setTimeout,
    });
    vi.clearAllMocks();
    vi.useRealTimers();
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

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens Didit in a popup and completes when the popup closes', async () => {
    vi.useFakeTimers();
    const popup = { closed: false, focus: vi.fn() };
    openMock.mockReturnValue(popup as unknown as Window);

    const onComplete = vi.fn();
    const promise = startDiditVerificationSession('cust-1', 'book-1', 'ID_DOCUMENT', onComplete);
    await Promise.resolve();

    expect(mockStartDiditSession).toHaveBeenCalledWith('cust-1', 'book-1', 'ID_DOCUMENT');
    expect(openMock).toHaveBeenCalledWith(
      'https://verify.didit.me/session/abc',
      'synqdrive-didit-verification',
      expect.stringContaining('popup=yes'),
    );
    expect(DiditSdk.shared.startVerification).not.toHaveBeenCalled();

    popup.closed = true;
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(onComplete).toHaveBeenCalledWith('completed');
    vi.useRealTimers();
  });

  it('falls back to DiditSdk when popup is blocked', async () => {
    openMock.mockReturnValue(null);

    const onComplete = vi.fn();
    const promise = startDiditVerificationSession('cust-1', undefined, 'ID_DOCUMENT', onComplete);
    await flushPromises();

    expect(DiditSdk.shared.startVerification).toHaveBeenCalledWith({
      url: 'https://verify.didit.me/session/abc',
      configuration: expect.objectContaining({
        closeModalOnComplete: true,
        zIndex: 99999,
      }),
    });

    await DiditSdk.shared.onComplete?.({ type: 'completed' });
    await promise;
    expect(onComplete).toHaveBeenCalledWith('completed');
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
