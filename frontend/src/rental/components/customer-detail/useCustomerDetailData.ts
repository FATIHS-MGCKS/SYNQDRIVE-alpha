import { useCallback, useEffect, useState } from 'react';
import { api, getErrorMessage } from '../../../lib/api';
import type { CustomerDocumentRecord } from '../CustomerDocumentUploadBox';
import type {
  CustomerDetail,
  CustomerEligibility,
  DrivingAggregateMeta,
} from './customerDetailTypes';

export function useCustomerDetail(orgId: string | null | undefined, customerId: string) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!orgId || !customerId) return;
    setLoading(true);
    setError(null);
    api.customers
      .get(orgId, customerId)
      .then((row) => setDetail(row as unknown as CustomerDetail))
      .catch((err: unknown) => {
        setDetail(null);
        const msg = err instanceof Error ? err.message : 'Kunde konnte nicht geladen werden';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [orgId, customerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { detail, loading, error, refresh };
}

export function useCustomerDocumentStatus(orgId: string | null | undefined, customerId: string) {
  const [status, setStatus] = useState<import('../../../lib/api').CustomerDocumentVerificationStatusDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!orgId || !customerId) return;
    setLoading(true);
    setError(null);
    api.customers.customerDocuments
      .status(orgId, customerId)
      .then(setStatus)
      .catch(() => {
        setStatus(null);
        setError('Dokumentenstatus konnte nicht geladen werden');
      })
      .finally(() => setLoading(false));
  }, [orgId, customerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { status, loading, error, refresh };
}

export function useCustomerDocuments(orgId: string | null | undefined, customerId: string) {
  const [documents, setDocuments] = useState<CustomerDocumentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!orgId || !customerId) return;
    setLoading(true);
    setError(null);
    api.customers.customerDocuments
      .list(orgId, customerId)
      .then((rows) =>
        setDocuments(Array.isArray(rows) ? (rows as unknown as CustomerDocumentRecord[]) : []),
      )
      .catch(() => {
        setDocuments([]);
        setError('Dokumente konnten nicht geladen werden');
      })
      .finally(() => setLoading(false));
  }, [orgId, customerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { documents, loading, error, refresh };
}

export function useCustomerEligibility(orgId: string | null | undefined, customerId: string) {
  const [eligibility, setEligibility] = useState<CustomerEligibility | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!orgId || !customerId) {
      setEligibility(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    api.customers
      .eligibility(orgId, customerId)
      .then(setEligibility)
      .catch((err: unknown) => {
        setEligibility(null);
        setError(getErrorMessage(err, 'Mietfreigabe konnte nicht geladen werden'));
      })
      .finally(() => setLoading(false));
  }, [orgId, customerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { eligibility, loading, error, refresh };
}

export function useCustomerTimeline(orgId: string | null | undefined, customerId: string) {
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    if (!orgId || !customerId) return;
    setLoading(true);
    setError(null);
    api.customers.customerTimeline
      .list(orgId, customerId, { limit: 50 })
      .then((res) => setEvents(res.data ?? []))
      .catch(() => {
        setEvents([]);
        setError('Timeline konnte nicht geladen werden');
      })
      .finally(() => setLoading(false));
  }, [orgId, customerId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { events, loading, error, refresh };
}

export function useCustomerFines(orgId: string | null | undefined, customerId: string) {
  const [fines, setFines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !customerId) return;
    setLoading(true);
    api.fines
      .byCustomer(orgId, customerId)
      .then((rows) => setFines(Array.isArray(rows) ? rows : []))
      .catch(() => {
        setFines([]);
        setError('Bußgelder konnten nicht geladen werden');
      })
      .finally(() => setLoading(false));
  }, [orgId, customerId]);

  return { fines, loading, error };
}

export function useCustomerInvoices(orgId: string | null | undefined, customerId: string) {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !customerId) return;
    setLoading(true);
    api.invoices
      .byCustomer(orgId, customerId)
      .then((rows) => setInvoices(Array.isArray(rows) ? rows : []))
      .catch(() => {
        setInvoices([]);
        setError('Rechnungen konnten nicht geladen werden');
      })
      .finally(() => setLoading(false));
  }, [orgId, customerId]);

  return { invoices, loading, error };
}

export function useCustomerDrivingAggregate(
  orgId: string | null | undefined,
  customerId: string,
): DrivingAggregateMeta {
  const [agg, setAgg] = useState<DrivingAggregateMeta>({
    analysisCount: 0,
    drivingEvents: 0,
    abuseEvents: 0,
    lastAnalysisAt: null,
  });

  useEffect(() => {
    if (!orgId || !customerId) return;
    api.rentalDrivingAnalyses
      .list(orgId, { driverId: customerId, limit: 100 })
      .then((res) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        let drivingEvents = 0;
        let abuseEvents = 0;
        let lastAnalysisAt: string | null = null;
        for (const row of rows) {
          const payload = (row as any).payload ?? {};
          const ev = payload.eventSummary ?? {};
          drivingEvents += Number(ev.drivingEventsCount ?? 0) || 0;
          abuseEvents += Number(ev.abuseDetectionCount ?? 0) || 0;
          const ts = (row as any).periodEnd || (row as any).createdAt;
          if (ts && (!lastAnalysisAt || new Date(ts) > new Date(lastAnalysisAt))) {
            lastAnalysisAt = ts;
          }
        }
        setAgg({
          analysisCount: rows.length,
          drivingEvents,
          abuseEvents,
          lastAnalysisAt,
        });
      })
      .catch(() => {
        /* keep defaults */
      });
  }, [orgId, customerId]);

  return agg;
}

export function useCustomerLatestRentalAnalysis(
  orgId: string | null | undefined,
  customerId: string,
) {
  const [analysis, setAnalysis] = useState<import('../../../lib/api').RentalDrivingAnalysisItem | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orgId || !customerId) {
      setAnalysis(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.rentalDrivingAnalyses
      .list(orgId, { driverId: customerId, limit: 1 })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setAnalysis(rows[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setAnalysis(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId, customerId]);

  return { analysis, loading };
}
