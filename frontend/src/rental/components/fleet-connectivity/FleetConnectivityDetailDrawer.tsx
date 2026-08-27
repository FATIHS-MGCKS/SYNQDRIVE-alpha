import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { DetailDrawer, ErrorState } from '../../../components/patterns';
import { api, type FleetConnectivityDetail } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { OverallStateChip } from './fleet-connectivity.badges';
import { FleetConnectivityDetailSections } from './FleetConnectivityDetailSections';
import { vehicleTitle } from './fleet-connectivity.presentation';

interface FleetConnectivityDetailDrawerProps {
  orgId: string | null;
  vehicleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FleetConnectivityDetailDrawer({
  orgId,
  vehicleId,
  open,
  onOpenChange,
}: FleetConnectivityDetailDrawerProps) {
  const { t, locale } = useLanguage();
  const [detail, setDetail] = useState<FleetConnectivityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId || !vehicleId) return;
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
    if (open && orgId && vehicleId) {
      void load();
    }
    if (!open) {
      setDetail(null);
      setError(null);
    }
  }, [open, orgId, vehicleId, load]);

  const v = detail?.vehicle;

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="sm:max-w-xl"
      title={
        v ? (
          <span>
            {v.make} {v.model}
            {v.year ? ` ${v.year}` : ''}
          </span>
        ) : (
          t('fleetConnectivity.detail.title')
        )
      }
      description={
        v ? (
          <span className="text-[11px] tabular-nums">
            {v.licensePlate ?? '—'} · {vehicleTitle(v)}
          </span>
        ) : undefined
      }
      status={detail ? <OverallStateChip state={detail.overallState} t={t} /> : undefined}
      closeLabel={t('fleetConnectivity.detail.close')}
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span className="text-sm">{t('fleetConnectivity.detail.loading')}</span>
        </div>
      ) : error ? (
        <ErrorState
          title={t('fleetConnectivity.detail.loadError')}
          error={error}
          onRetry={() => void load()}
          retryLabel={t('fleetConnectivity.retry')}
        />
      ) : detail ? (
        <FleetConnectivityDetailSections detail={detail} t={t} locale={locale} />
      ) : null}
    </DetailDrawer>
  );
}
