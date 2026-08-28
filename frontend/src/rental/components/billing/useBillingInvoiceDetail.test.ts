// @vitest-environment happy-dom
import { act } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '../../../test/renderHook';
import { de } from '../../i18n/translations/de';
import { en } from '../../i18n/translations/en';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  resolveInvoiceDocumentActionErrorMessage,
  useInvoiceDocumentAction,
} from './useBillingInvoiceDetail';

const DOCUMENT_URL = 'https://provider.example/x7/invoice.pdf?token=raw-x7';
const RAW_PROVIDER_ERROR = 'Provider Document Error X7';
const RAW_BACKEND_ERROR = 'Backend Document Error X7';

const translate =
  (dict: Record<string, string>) =>
  (key: TranslationKey) =>
    dict[key] ?? key;

describe('useInvoiceDocumentAction', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('preserves raw Error.message on catch', async () => {
    const { result, unmount } = renderHook(() => useInvoiceDocumentAction());

    await act(async () => {
      await result.current.openHosted(async () => {
        throw new Error(RAW_PROVIDER_ERROR);
      });
    });

    expect(result.current.error).toEqual({ kind: 'raw', message: RAW_PROVIDER_ERROR });
    expect(openSpy).not.toHaveBeenCalled();
    unmount();
  });

  it('preserves raw string exception on catch', async () => {
    const { result, unmount } = renderHook(() => useInvoiceDocumentAction());

    await act(async () => {
      await result.current.openPdf(async () => {
        throw RAW_BACKEND_ERROR;
      });
    });

    expect(result.current.error).toEqual({ kind: 'raw', message: RAW_BACKEND_ERROR });
    expect(openSpy).not.toHaveBeenCalled();
    unmount();
  });

  it('uses localized host openFailed fallback for unknown non-error exceptions', async () => {
    const { result, unmount } = renderHook(() => useInvoiceDocumentAction());

    await act(async () => {
      await result.current.openHosted(async () => {
        throw {};
      });
    });

    expect(result.current.error).toEqual({ kind: 'host', code: 'openFailed' });
    expect(resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(en))).toBe(
      en['invoices.list.error.openFailed'],
    );
    expect(resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(de))).toBe(
      de['invoices.list.error.openFailed'],
    );
    expect(resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(en))).not.toBe(
      resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(de)),
    );
    unmount();
  });

  it('uses localized host unavailable message for null URL', async () => {
    const { result, unmount } = renderHook(() => useInvoiceDocumentAction());

    await act(async () => {
      await result.current.openHosted(async () => null);
    });

    expect(result.current.error).toEqual({ kind: 'host', code: 'unavailable' });
    expect(resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(en))).toBe(
      en['tenantBilling.invoices.document.unavailable'],
    );
    expect(resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(de))).toBe(
      de['tenantBilling.invoices.document.unavailable'],
    );
    expect(resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(en))).not.toBe(
      resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(de)),
    );
    unmount();
  });

  it('opens exact provider URL without altering it', async () => {
    const { result, unmount } = renderHook(() => useInvoiceDocumentAction());

    await act(async () => {
      await result.current.openPdf(async () => DOCUMENT_URL);
    });

    expect(result.current.error).toBeNull();
    expect(openSpy).toHaveBeenCalledWith(DOCUMENT_URL, '_blank', 'noopener,noreferrer');
    unmount();
  });

  it('keeps raw provider error locale-invariant across host fallback translations', async () => {
    const { result, unmount } = renderHook(() => useInvoiceDocumentAction());

    await act(async () => {
      await result.current.openHosted(async () => {
        throw new Error(RAW_PROVIDER_ERROR);
      });
    });

    const enMessage = resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(en));
    const deMessage = resolveInvoiceDocumentActionErrorMessage(result.current.error, translate(de));

    expect(enMessage).toBe(RAW_PROVIDER_ERROR);
    expect(deMessage).toBe(RAW_PROVIDER_ERROR);
    unmount();
  });
});

describe('resolveInvoiceDocumentActionErrorMessage', () => {
  it('renders raw messages verbatim without exposing host codes', () => {
    const message = resolveInvoiceDocumentActionErrorMessage(
      { kind: 'raw', message: RAW_PROVIDER_ERROR },
      translate(en),
    );
    expect(message).toBe(RAW_PROVIDER_ERROR);
    expect(message).not.toContain('openFailed');
    expect(message).not.toContain('unavailable');
  });
});
