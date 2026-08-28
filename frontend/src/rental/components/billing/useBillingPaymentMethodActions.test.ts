// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '../../../test/renderHook';
import { api } from '../../../lib/api';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  resolvePaymentMethodActionErrorMessage,
  resolvePaymentMethodDetachErrorMessage,
} from '../../lib/rental-tenant-billing-i18n';
import { useBillingPaymentMethodActions } from './useBillingPaymentMethodActions';

const PAYMENT_METHOD_ID = 'pm_provider_X7';
const RAW_DETACH_ERROR = 'Provider Detach Error X7';

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey) =>
    dict[key] ?? key;

describe('useBillingPaymentMethodActions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls set-default with exact payment method ID', async () => {
    const setDefaultSpy = vi
      .spyOn(api.billing, 'orgPaymentMethodSetDefault')
      .mockResolvedValue({} as never);
    const { result, unmount } = renderHook(() =>
      useBillingPaymentMethodActions('org-x7', true),
    );

    await act(async () => {
      await result.current.setDefault(PAYMENT_METHOD_ID);
    });

    expect(setDefaultSpy).toHaveBeenCalledTimes(1);
    expect(setDefaultSpy).toHaveBeenCalledWith('org-x7', PAYMENT_METHOD_ID);
    unmount();
  });

  it('calls detach with exact payment method ID', async () => {
    const detachSpy = vi
      .spyOn(api.billing, 'orgPaymentMethodDetach')
      .mockResolvedValue({ paymentMethods: [] } as never);
    const { result, unmount } = renderHook(() =>
      useBillingPaymentMethodActions('org-x7', true),
    );

    await act(async () => {
      await result.current.detach(PAYMENT_METHOD_ID);
    });

    expect(detachSpy).toHaveBeenCalledTimes(1);
    expect(detachSpy).toHaveBeenCalledWith('org-x7', PAYMENT_METHOD_ID);
    unmount();
  });

  it('preserves raw detach provider error', async () => {
    vi.spyOn(api.billing, 'orgPaymentMethodDetach').mockRejectedValue(
      new Error(RAW_DETACH_ERROR),
    );
    const { result, unmount } = renderHook(() =>
      useBillingPaymentMethodActions('org-x7', true),
    );

    await act(async () => {
      await result.current.detach(PAYMENT_METHOD_ID);
    });

    expect(result.current.error).toEqual({
      source: 'detach',
      error: { kind: 'raw', message: RAW_DETACH_ERROR },
    });
    expect(resolvePaymentMethodDetachErrorMessage(result.current.error?.source === 'detach' ? result.current.error.error : null, translate(en))).toBe(
      RAW_DETACH_ERROR,
    );
    expect(resolvePaymentMethodDetachErrorMessage(result.current.error?.source === 'detach' ? result.current.error.error : null, translate(de))).toBe(
      RAW_DETACH_ERROR,
    );
    unmount();
  });

  it('uses localized host detach fallback for unknown exceptions', async () => {
    vi.spyOn(api.billing, 'orgPaymentMethodDetach').mockRejectedValue({});
    const { result, unmount } = renderHook(() =>
      useBillingPaymentMethodActions('org-x7', true),
    );

    await act(async () => {
      await result.current.detach(PAYMENT_METHOD_ID);
    });

    expect(result.current.error).toEqual({
      source: 'detach',
      error: { kind: 'host', code: 'detachFailed' },
    });
    expect(resolvePaymentMethodActionErrorMessage(result.current.error, translate(en))).toBe(
      en['tenantBilling.paymentMethod.error.detachFailed'],
    );
    expect(resolvePaymentMethodActionErrorMessage(result.current.error, translate(de))).toBe(
      de['tenantBilling.paymentMethod.error.detachFailed'],
    );
    unmount();
  });

  it('preserves loadingId through mutation lifecycle', async () => {
    let resolveDetach: (() => void) | undefined;
    vi.spyOn(api.billing, 'orgPaymentMethodDetach').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDetach = () => resolve({ paymentMethods: [] } as never);
        }),
    );
    const { result, unmount } = renderHook(() =>
      useBillingPaymentMethodActions('org-x7', true),
    );

    let pending: Promise<boolean> | undefined;
    act(() => {
      pending = result.current.detach(PAYMENT_METHOD_ID);
    });
    expect(result.current.loadingId).toBe(PAYMENT_METHOD_ID);

    await act(async () => {
      resolveDetach?.();
      await pending;
    });
    expect(result.current.loadingId).toBeNull();
    unmount();
  });
});
