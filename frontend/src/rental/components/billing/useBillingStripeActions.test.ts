// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../../test/renderHook';
import { api } from '../../../lib/api';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import { resolveStripePortalActionErrorMessage } from '../../lib/rental-tenant-billing-i18n';
import { useBillingStripeActions } from './useBillingStripeActions';

const PROVIDER_PORTAL_URL = 'https://provider.example/x7/billing?token=raw-x7';

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey) =>
    dict[key] ?? key;

describe('useBillingStripeActions', () => {
  let assignSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    assignSpy = vi.spyOn(window.location, 'assign').mockImplementation(() => undefined);
  });

  afterEach(() => {
    assignSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('assigns exact provider portal URL without normalization', async () => {
    vi.spyOn(api.billing, 'orgStripeCustomerPortal').mockResolvedValue({
      url: PROVIDER_PORTAL_URL,
    } as never);
    const { result, unmount } = renderHook(() =>
      useBillingStripeActions('org-x7', 'configured', true),
    );

    await act(async () => {
      await result.current.openCustomerPortal();
    });

    expect(assignSpy).toHaveBeenCalledWith(PROVIDER_PORTAL_URL);
    expect(result.current.error).toBeNull();
    unmount();
  });

  it('uses host open-failed error when portal URL is missing', async () => {
    vi.spyOn(api.billing, 'orgStripeCustomerPortal').mockResolvedValue({} as never);
    const { result, unmount } = renderHook(() =>
      useBillingStripeActions('org-x7', 'configured', true),
    );

    await act(async () => {
      await result.current.openCustomerPortal();
    });

    expect(result.current.error).toEqual({ kind: 'host', code: 'openFailed' });
    expect(resolveStripePortalActionErrorMessage(result.current.error, translate(en))).toBe(
      en['tenantBilling.paymentMethod.error.portalOpenFailed'],
    );
    expect(resolveStripePortalActionErrorMessage(result.current.error, translate(de))).toBe(
      de['tenantBilling.paymentMethod.error.portalOpenFailed'],
    );
    unmount();
  });

  it('uses host not-configured error for Stripe unavailable responses', async () => {
    vi.spyOn(api.billing, 'orgStripeCustomerPortal').mockRejectedValue(
      new Error('Stripe not_configured'),
    );
    const { result, unmount } = renderHook(() =>
      useBillingStripeActions('org-x7', 'configured', true),
    );

    await act(async () => {
      await result.current.openCustomerPortal();
    });

    expect(result.current.error).toEqual({ kind: 'host', code: 'notConfigured' });
    expect(resolveStripePortalActionErrorMessage(result.current.error, translate(en))).toBe(
      en['tenantBilling.paymentMethod.error.portalNotConfigured'],
    );
    unmount();
  });

  it('preserves portal loading state through request lifecycle', async () => {
    let resolvePortal: (() => void) | undefined;
    vi.spyOn(api.billing, 'orgStripeCustomerPortal').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePortal = () => resolve({ url: PROVIDER_PORTAL_URL } as never);
        }),
    );
    const { result, unmount } = renderHook(() =>
      useBillingStripeActions('org-x7', 'configured', true),
    );

    let pending: Promise<void> | undefined;
    act(() => {
      pending = result.current.openCustomerPortal();
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolvePortal?.();
      await pending;
    });
    expect(result.current.loading).toBe(false);
    unmount();
  });
});
