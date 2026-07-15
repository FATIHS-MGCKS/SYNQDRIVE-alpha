import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import type {
  TenantInvoiceDetailDto,
  TenantInvoicePaymentHistoryDto,
} from '../../types/billing.types';
import { mapBillingLoadError } from './billing-load.utils';

export function useBillingInvoiceDetail(
  orgId: string | undefined,
  invoiceId: string | null,
  open: boolean,
) {
  const [detail, setDetail] = useState<TenantInvoiceDetailDto | null>(null);
  const [payments, setPayments] = useState<TenantInvoicePaymentHistoryDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const reloadDetail = useCallback(async () => {
    if (!orgId || !invoiceId) return;
    setDetailLoading(true);
    setDetailError(null);
    try {
      const payload = await api.billing.orgInvoiceDetail(orgId, invoiceId);
      setDetail(payload as TenantInvoiceDetailDto);
    } catch (error) {
      setDetailError(mapBillingLoadError(error));
    } finally {
      setDetailLoading(false);
    }
  }, [invoiceId, orgId]);

  const reloadPayments = useCallback(async () => {
    if (!orgId || !invoiceId) return;
    setPaymentsLoading(true);
    setPaymentsError(null);
    try {
      const payload = await api.billing.orgInvoicePayments(orgId, invoiceId);
      setPayments(payload as TenantInvoicePaymentHistoryDto);
    } catch (error) {
      setPaymentsError(mapBillingLoadError(error));
    } finally {
      setPaymentsLoading(false);
    }
  }, [invoiceId, orgId]);

  useEffect(() => {
    if (!open || !orgId || !invoiceId) {
      setDetail(null);
      setPayments(null);
      setDetailError(null);
      setPaymentsError(null);
      return;
    }
    void reloadDetail();
    void reloadPayments();
  }, [open, orgId, invoiceId, reloadDetail, reloadPayments]);

  const openHostedInvoice = useCallback(async () => {
    if (!orgId || !invoiceId) return null;
    const payload = await api.billing.orgInvoiceHosted(orgId, invoiceId);
    return payload.url;
  }, [invoiceId, orgId]);

  const openInvoicePdf = useCallback(async () => {
    if (!orgId || !invoiceId) return null;
    const payload = await api.billing.orgInvoicePdf(orgId, invoiceId);
    return payload.url;
  }, [invoiceId, orgId]);

  return {
    detail,
    payments,
    detailLoading,
    paymentsLoading,
    detailError,
    paymentsError,
    reloadDetail,
    reloadPayments,
    openHostedInvoice,
    openInvoicePdf,
  };
}

export function useInvoiceDocumentAction() {
  const [loadingHosted, setLoadingHosted] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openUrl = async (fetcher: () => Promise<string | null>) => {
    setError(null);
    try {
      const url = await fetcher();
      if (!url) {
        setError('Dokument ist derzeit nicht verfügbar.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      setError(getErrorMessage(caught, 'Dokument konnte nicht geöffnet werden.'));
    }
  };

  return {
    loadingHosted,
    loadingPdf,
    error,
    clearError: () => setError(null),
    openHosted: async (fetcher: () => Promise<string | null>) => {
      setLoadingHosted(true);
      try {
        await openUrl(fetcher);
      } finally {
        setLoadingHosted(false);
      }
    },
    openPdf: async (fetcher: () => Promise<string | null>) => {
      setLoadingPdf(true);
      try {
        await openUrl(fetcher);
      } finally {
        setLoadingPdf(false);
      }
    },
  };
}
