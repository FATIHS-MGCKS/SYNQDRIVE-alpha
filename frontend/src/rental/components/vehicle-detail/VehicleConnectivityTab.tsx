import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ErrorState } from '../../../components/patterns';
import { api, type FleetConnectivityDetail } from '../../../lib/api';
import { FleetConnectivityDetailSections } from '../fleet-connectivity/FleetConnectivityDetailSections';
import { useLanguage } from '../../i18n/LanguageContext';

export interface VehicleConnectivityTabProps {
  orgId: string;
  vehicleId: string | null;
}

export function VehicleConnectivityTab({ orgId, vehicleId }: VehicleConnectivityTabProps) {
  const { t, locale } = useLanguage();
  const [detail, setDetail] = useState<FleetConnectivityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !vehicleId) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.vehicles.fleetConnectivityDetail(orgId, vehicleId);
      setDetail(res);
    } catch {
      setDetail(null);
      setError(t('fleetConnectivity.detail.loadError'));
    } finally {
      setLoading(false);
    }
  }, [orgId, vehicleId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!vehicleId) {
    return null;
  }

  return (
    <div
      className="min-w-0 max-w-full space-y-4 px-0 sm:px-0"
      data-testid="vehicle-connectivity-tab"
      aria-label={t('vehicleDetail.connectivityTab.ariaLabel')}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="text-sm">{t('vehicleDetail.connectivityTab.loading')}</span>
        </div>
      ) : error ? (
        <ErrorState
          title={t('fleetConnectivity.detail.loadError')}
          error={error}
          onRetry={() => void load()}
          retryLabel={t('fleetConnectivity.retry')}
        />
      ) : detail ? (
        <FleetConnectivityDetailSections detail={detail} t={t} locale={locale} variant="page" />
      ) : null}
    </div>
  );
}
