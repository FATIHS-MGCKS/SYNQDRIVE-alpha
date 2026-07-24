import { AlertTriangle, Plug, PlugZap, Radio, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { api, type DeviceConnectionSummary, getErrorMessage } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import { useVehicleDetailOverviewPollingEnabled } from '../../hooks/useVehicleDetailOverviewPollingEnabled';
import { usePollingWhen } from '../../hooks/usePollingWhen';
import { VEHICLE_DETAIL_POLLING } from '../../lib/vehicle-detail-polling-policy';
import {
  deviceConnectionSeverityTone,
  formatDeviceConnectionTimestamp,
  isDeviceConnectionForbiddenError,
  isDeviceConnectionRuntimeStale,
  resolveDeviceConnectionCardState,
  sortDeviceConnectionEvents,
} from '../../lib/device-connection-ui';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  formatDeviceConnectionDuration,
  translateDeviceConnectionEventType,
  translateDeviceConnectionStatus,
} from '../../lib/vehicle-detail-i18n';

export interface VehicleDeviceConnectionCardProps {
  orgId: string;
  vehicleId: string;
}

export function VehicleDeviceConnectionCard({
  orgId,
  vehicleId,
}: VehicleDeviceConnectionCardProps) {
  const { t } = useLanguage();
  const { hasPermission } = useRentalOrg();
  const canRead = hasPermission('fleet-connectivity', 'read');
  const overviewPollingEnabled = useVehicleDetailOverviewPollingEnabled(vehicleId);
  const [summary, setSummary] = useState<DeviceConnectionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = useCallback(async () => {
    if (!orgId || !vehicleId) {
      setLoading(false);
      return;
    }
    if (!canRead) {
      setForbidden(true);
      setError(null);
      setSummary(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setForbidden(false);
    setError(null);
    try {
      const res = await api.vehicles.deviceConnection(orgId, vehicleId);
      setSummary(res);
    } catch (err) {
      const message = getErrorMessage(err, t('vehicleDetail.deviceConnection.cardError'));
      if (isDeviceConnectionForbiddenError(message)) {
        setForbidden(true);
        setError(null);
      } else {
        setError(t('vehicleDetail.deviceConnection.cardError'));
      }
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [canRead, orgId, t, vehicleId]);

  useEffect(() => {
    if (overviewPollingEnabled && canRead) return;
    void load();
  }, [load, overviewPollingEnabled, canRead]);

  usePollingWhen(
    load,
    VEHICLE_DETAIL_POLLING.DEVICE_CONNECTION_MS,
    overviewPollingEnabled && canRead,
  );

  const cardState = useMemo(
    () =>
      resolveDeviceConnectionCardState({
        loading,
        forbidden,
        error,
        summary,
      }),
    [loading, forbidden, error, summary],
  );

  if (cardState === 'loading') {
    return (
      <section
        className="surface-premium rounded-2xl border border-border/70 p-4 animate-pulse h-28 bg-muted/30"
        aria-label={t('vehicleDetail.deviceConnection.aria')}
        aria-busy="true"
      >
        <p className="sr-only">{t('vehicleDetail.deviceConnection.cardLoading')}</p>
      </section>
    );
  }

  if (cardState === 'forbidden') {
    return (
      <section
        className="surface-premium rounded-2xl border border-border/70 p-4 space-y-2"
        aria-label={t('vehicleDetail.deviceConnection.aria')}
      >
        <p className="text-sm font-semibold text-foreground">{t('vehicleDetail.deviceConnection.title')}</p>
        <p className="text-[12px] text-muted-foreground">{t('vehicleDetail.deviceConnection.cardForbidden')}</p>
      </section>
    );
  }

  if (cardState === 'error') {
    return (
      <section
        className="surface-premium rounded-2xl border border-border/70 p-4 space-y-3"
        aria-label={t('vehicleDetail.deviceConnection.aria')}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">{t('vehicleDetail.deviceConnection.title')}</p>
            <p className="text-[12px] text-muted-foreground mt-1">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted/40"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t('vehicleDetail.deviceConnection.retry')}
          </button>
        </div>
      </section>
    );
  }

  if (cardState === 'empty') {
    return (
      <section
        className="surface-premium rounded-2xl border border-border/70 p-4 space-y-2"
        aria-label={t('vehicleDetail.deviceConnection.aria')}
      >
        <p className="text-sm font-semibold text-foreground">{t('vehicleDetail.deviceConnection.title')}</p>
        <p className="text-[12px] text-muted-foreground">{t('vehicleDetail.deviceConnection.cardEmpty')}</p>
      </section>
    );
  }

  const events = sortDeviceConnectionEvents(summary?.recentEvents ?? []).slice(0, 3);
  const stale = isDeviceConnectionRuntimeStale(summary);

  return (
    <section
      className="surface-premium rounded-2xl border border-border/70 p-4 space-y-3"
      aria-label={t('vehicleDetail.deviceConnection.aria')}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('vehicleDetail.deviceConnection.title')}
            </p>
            <p className="text-sm font-semibold text-foreground">
              {summary?.lteR1Capable
                ? t('vehicleDetail.deviceConnection.lteConnected')
                : t('vehicleDetail.deviceConnection.aria')}
            </p>
          </div>
        </div>
        {summary?.severity && (
          <StatusChip tone={deviceConnectionSeverityTone(summary.severity)}>
            {summary.openUnpluggedEpisode
              ? t('vehicleDetail.deviceConnection.telematicsInterruption')
              : translateDeviceConnectionStatus(summary.currentDeviceConnectionStatus, t)}
          </StatusChip>
        )}
      </div>

      {stale && (
        <div className="flex items-center gap-2 text-[11px] text-[color:var(--status-watch)]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{t('vehicleDetail.deviceConnection.cardStaleHint')}</span>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 text-[12px]">
        <div className="rounded-xl border border-border/60 px-3 py-2">
          <p className="text-muted-foreground">{t('vehicleDetail.deviceConnection.webhookStatus')}</p>
          <p className="font-medium mt-0.5 flex items-center gap-1.5">
            {summary?.currentDeviceConnectionStatus === 'unplugged' ? (
              <Plug className="w-3.5 h-3.5 text-[color:var(--status-critical)]" />
            ) : (
              <PlugZap className="w-3.5 h-3.5 text-[color:var(--status-positive)]" />
            )}
            {summary
              ? translateDeviceConnectionStatus(summary.currentDeviceConnectionStatus, t)
              : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 px-3 py-2">
          <p className="text-muted-foreground">{t('vehicleDetail.deviceConnection.openInterruption')}</p>
          <p className="font-medium mt-0.5">
            {summary?.openUnpluggedEpisode
              ? `${formatDeviceConnectionTimestamp(summary.openUnpluggedSince)} · ${formatDeviceConnectionDuration(summary.openUnpluggedDurationMs, t)}`
              : t('vehicleDetail.deviceConnection.noOpenInterruption')}
          </p>
        </div>
      </div>

      {(summary?.rentalRelevant && summary.openUnpluggedEpisode) && (
        <div className="flex items-center gap-2 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 text-[color:var(--status-critical)]" />
          <StatusChip tone="critical">{t('vehicleDetail.deviceConnection.duringActiveBooking')}</StatusChip>
        </div>
      )}

      {events.length > 0 && (
        <ul className="space-y-1.5 border-t border-border/40 pt-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="font-medium">{translateDeviceConnectionEventType(event.eventType, t)}</span>
              <span className="text-muted-foreground tabular-nums">
                {formatDeviceConnectionTimestamp(event.observedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
