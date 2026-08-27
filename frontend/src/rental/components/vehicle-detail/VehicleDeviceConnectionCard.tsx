import { AlertTriangle, Radio } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns/status-utils';
import { api, type DeviceConnectionSummary } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { recordVehicleDetailClientSignal } from '../../lib/vehicle-detail-observability';
import {
  buildVehicleConnectivityOverviewView,
  shouldShowVehicleConnectivityCard,
} from './vehicle-connectivity-presentation';

export interface VehicleDeviceConnectionCardProps {
  orgId: string;
  vehicleId: string;
}

function DetailRow({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: StatusTone;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/35 pb-2 last:border-b-0 last:pb-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <StatusChip tone={tone} className="max-w-[62%] justify-end text-right">
        <span className="whitespace-normal text-pretty">{value}</span>
      </StatusChip>
    </div>
  );
}

export function VehicleDeviceConnectionCard({
  orgId,
  vehicleId,
}: VehicleDeviceConnectionCardProps) {
  const { t, locale } = useLanguage();
  const [summary, setSummary] = useState<DeviceConnectionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!orgId || !vehicleId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.vehicles.deviceConnection(orgId, vehicleId);
      setSummary(res);
    } catch {
      setSummary(null);
      recordVehicleDetailClientSignal('device_connection_error');
    } finally {
      setLoading(false);
    }
  }, [orgId, vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div
        className="surface-premium h-28 animate-pulse rounded-2xl bg-muted/30 p-4"
        aria-hidden
      />
    );
  }

  if (!shouldShowVehicleConnectivityCard(summary)) {
    return null;
  }

  const runtime = summary!.connectivityRuntime!;
  const view = buildVehicleConnectivityOverviewView(summary!, runtime, t, locale);

  return (
    <section
      className="surface-premium space-y-3 rounded-2xl border border-border/70 p-4"
      aria-label={t('vehicleDetail.connectivity.ariaLabel')}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t('vehicleDetail.connectivity.eyebrow')}
          </p>
        </div>
        <StatusChip tone={view.primaryTelemetryTone} className="shrink-0">
          {view.primaryTelemetryLabel}
        </StatusChip>
      </div>

      <p className="text-base font-semibold tracking-[-0.02em] text-foreground">
        {view.primaryTelemetryLabel}
      </p>

      <div className="space-y-2 text-[12px]">
        <DetailRow
          label={t('vehicleDetail.connectivity.lastSignal')}
          value={view.lastSignalText}
          tone="neutral"
        />
        <DetailRow
          label={t('vehicleDetail.connectivity.dataSource')}
          value={view.dataSourceText}
          tone={view.dataSourceTone}
        />
        <DetailRow
          label={t('vehicleDetail.connectivity.device')}
          value={view.deviceText}
          tone={view.deviceTone}
        />
        <DetailRow
          label={t('vehicleDetail.connectivity.interruption')}
          value={view.interruptionText}
          tone={view.interruptionTone}
        />
      </div>

      {view.attentionText ? (
        <div className="space-y-1 border-t border-border/40 pt-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-watch)]" aria-hidden />
            <StatusChip tone={view.attentionTone ?? 'watch'}>{view.attentionText}</StatusChip>
          </div>
          {view.recommendedActionText ? (
            <p className="pl-5 text-[11px] text-muted-foreground">{view.recommendedActionText}</p>
          ) : null}
        </div>
      ) : null}

      {view.showRentalRelevantAlert ? (
        <div className="flex items-center gap-2 border-t border-border/40 pt-2.5 text-[11px]">
          <AlertTriangle className="h-3.5 w-3.5 text-[color:var(--status-critical)]" aria-hidden />
          <StatusChip tone="critical">{t('vehicleDetail.connectivity.duringActiveBooking')}</StatusChip>
        </div>
      ) : null}
    </section>
  );
}
