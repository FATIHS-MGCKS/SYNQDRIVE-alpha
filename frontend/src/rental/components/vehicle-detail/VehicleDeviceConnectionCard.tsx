import { AlertTriangle, Radio } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import type { StatusTone } from '../../../components/patterns/status-utils';
import { cn } from '../../../components/ui/utils';
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

function valueToneClass(tone: StatusTone): string {
  switch (tone) {
    case 'critical':
      return 'text-[color:var(--status-critical)]';
    case 'warning':
    case 'watch':
      return 'text-[color:var(--status-watch)]';
    case 'success':
      return 'text-[color:var(--status-positive)]';
    default:
      return 'text-foreground';
  }
}

function primaryStateToneClass(tone: StatusTone): string {
  return cn('font-semibold tracking-[-0.02em]', valueToneClass(tone));
}

function DetailRow({
  label,
  value,
  tone = 'neutral',
  lines,
}: {
  label: string;
  value: string;
  tone?: StatusTone;
  lines?: string[];
}) {
  const valueLines = lines ?? [value];

  return (
    <div className="grid grid-cols-[minmax(0,42%)_1fr] gap-x-3 gap-y-0.5 border-b border-border/30 py-2 first:pt-0 last:border-b-0 last:pb-0">
      <span className="text-[11px] leading-snug text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right">
        {valueLines.map((line, index) => (
          <p
            key={`${line}-${index}`}
            className={cn(
              'text-[12px] font-medium leading-snug text-pretty',
              index === 0 ? valueToneClass(tone) : 'text-muted-foreground',
            )}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function splitDataSourceLines(value: string): string[] {
  const parts = value.split(' · ').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [value];
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

  const lastSignalAbsolute = runtime.lastTelemetryAt
    ? new Date(runtime.lastTelemetryAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null;
  const lastSignalDisplay =
    lastSignalAbsolute && view.lastSignalText && lastSignalAbsolute !== view.lastSignalText
      ? `${lastSignalAbsolute} · ${view.lastSignalText}`
      : view.lastSignalText;

  return (
    <section
      className="surface-premium rounded-2xl border border-border/70 p-4"
      aria-label={t('vehicleDetail.connectivity.ariaLabel')}
    >
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('vehicleDetail.connectivity.eyebrow')}
        </p>
        <span
          className={cn('ml-auto h-2 w-2 shrink-0 rounded-full', {
            'bg-[color:var(--status-positive)]': view.primaryTelemetryTone === 'success',
            'bg-[color:var(--status-watch)]':
              view.primaryTelemetryTone === 'watch' || view.primaryTelemetryTone === 'warning',
            'bg-[color:var(--status-critical)]': view.primaryTelemetryTone === 'critical',
            'bg-muted-foreground/45':
              view.primaryTelemetryTone === 'neutral' || view.primaryTelemetryTone === 'noData',
          })}
          aria-hidden
        />
      </div>

      <p className={cn('mt-2 text-[15px] leading-tight', primaryStateToneClass(view.primaryTelemetryTone))}>
        {view.primaryTelemetryLabel}
      </p>

      <div className="mt-3">
        <DetailRow
          label={t('vehicleDetail.connectivity.lastSignal')}
          value={lastSignalDisplay}
          tone="neutral"
        />
        <DetailRow
          label={t('vehicleDetail.connectivity.dataSource')}
          value={view.dataSourceText}
          lines={splitDataSourceLines(view.dataSourceText)}
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
        <div className="mt-2.5 space-y-1 border-t border-border/30 pt-2.5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-watch)]" aria-hidden />
            <StatusChip tone={view.attentionTone ?? 'watch'}>{view.attentionText}</StatusChip>
          </div>
          {view.recommendedActionText ? (
            <p className="pl-5 text-[11px] leading-snug text-muted-foreground">
              {view.recommendedActionText}
            </p>
          ) : null}
        </div>
      ) : null}

      {view.showRentalRelevantAlert ? (
        <div className="mt-2.5 flex items-center gap-2 border-t border-border/30 pt-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-[color:var(--status-critical)]" aria-hidden />
          <StatusChip tone="critical">{t('vehicleDetail.connectivity.duringActiveBooking')}</StatusChip>
        </div>
      ) : null}
    </section>
  );
}
