import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '../../../lib/api';
import {
  diditCompleteMessage,
  type CustomerVerificationCheckKind,
  type CustomerVerificationCheckRecord,
  type CustomerVerificationEligibility,
} from '../../lib/customer-verification';
import { startDiditVerificationSession } from '../../lib/diditVerificationFlow';

export function useCustomerVerification(
  customerId: string | undefined,
  bookingId?: string,
) {
  const [eligibility, setEligibility] = useState<CustomerVerificationEligibility | null>(null);
  const [checks, setChecks] = useState<CustomerVerificationCheckRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startingKind, setStartingKind] = useState<CustomerVerificationCheckKind | null>(null);

  const refresh = useCallback(async () => {
    if (!customerId) {
      setEligibility(null);
      setChecks([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [elig, listed] = await Promise.all([
        api.customerVerification.getEligibility(customerId, bookingId),
        api.customerVerification.getChecks(customerId, bookingId),
      ]);
      setEligibility(elig);
      setChecks(
        listed.map((check) => ({
          ...check,
          provider: check.provider as CustomerVerificationCheckRecord['provider'],
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Prüfstatus konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }, [customerId, bookingId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startDiditCheck = useCallback(
    async (kind: CustomerVerificationCheckKind) => {
      if (!customerId) return;
      setStartingKind(kind);
      try {
        toast.info('Didit öffnet sich in einem neuen Fenster…');
        await startDiditVerificationSession(customerId, bookingId, kind, async (status) => {
          toast.info(diditCompleteMessage(status));
          await refresh();
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Didit-Sitzung konnte nicht gestartet werden');
      } finally {
        setStartingKind(null);
      }
    },
    [customerId, bookingId, refresh],
  );

  return {
    eligibility,
    checks,
    loading,
    error,
    startingKind,
    refresh,
    startDiditCheck,
  };
}
