import { AlertTriangle, Plug, PlugZap, Radio, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusChip } from '../../../components/patterns';
import { api, type DeviceConnectionSummary, getErrorMessage } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import {
  DEVICE_CONNECTION_LABELS,
  deviceConnectionEventLabel,
  deviceConnectionSeverityTone,
  deviceConnectionStatusLabel,
  formatDeviceConnectionTimestamp,
  formatDurationMs,
  isDeviceConnectionForbiddenError,
  isDeviceConnectionRuntimeStale,
  resolveDeviceConnectionCardState,
  sortDeviceConnectionEvents,
} from '../../lib/device-connection-ui';

export interface VehicleDeviceConnectionCardProps {
  orgId: string;
  vehicleId: string;
}

export function VehicleDeviceConnectionCard({
  orgId,
  vehicleId,
}: VehicleDeviceConnectionCardProps) {
  const { hasPermission } = useRentalOrg();
  const canRead = hasPermission('fleet-connectivity', 'read');
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
      const message = getErrorMessage(err, DEVICE_CONNECTION_LABELS.cardError);
      if (isDeviceConnectionForbiddenError(message)) {
        setForbidden(true);
        setError(null);
      } else {
        setError(DEVICE_CONNECTION_LABELS.cardError);
      }
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [canRead, orgId, vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

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
        aria-label="DIMO Geräteverbindung"
        aria-busy="true"
      >
        <p className="sr-only">{DEVICE_CONNECTION_LABELS.cardLoading}</p>
      </section>
    );
  }

  if (cardState === 'forbidden') {
    return (
      <section
        className="surface-premium rounded-2xl border border-border/70 p-4 space-y-2"
        aria-label="DIMO Geräteverbindung"
      >
        <p className="text-sm font-semibold text-foreground">Konnektivität</p>
        <p className="text-[12px] text-muted-foreground">{DEVICE_CONNECTION_LABELS.cardForbidden}</p>
      </section>
    );
  }

  if (cardState === 'error') {
    return (
      <section
        className="surface-premium rounded-2xl border border-border/70 p-4 space-y-3"
        aria-label="DIMO Geräteverbindung"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">Konnektivität</p>
            <p className="text-[12px] text-muted-foreground mt-1">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-muted/40"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {DEVICE_CONNECTION_LABELS.retry}
          </button>
        </div>
      </section>
    );
  }

  if (cardState === 'empty') {
    return (
      <section
        className="surface-premium rounded-2xl border border-border/70 p-4 space-y-2"
        aria-label="DIMO Geräteverbindung"
      >
        <p className="text-sm font-semibold text-foreground">Konnektivität</p>
        <p className="text-[12px] text-muted-foreground">{DEVICE_CONNECTION_LABELS.cardEmpty}</p>
      </section>
    );
  }

  const events = sortDeviceConnectionEvents(summary?.recentEvents ?? []).slice(0, 3);
  const stale = isDeviceConnectionRuntimeStale(summary);

  return (
    <section
      className="surface-premium rounded-2xl border border-border/70 p-4 space-y-3"
      aria-label="DIMO Geräteverbindung"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Konnektivität
            </p>
            <p className="text-sm font-semibold text-foreground">
              {summary?.lteR1Capable
                ? DEVICE_CONNECTION_LABELS.lteR1Connected
                : 'DIMO Geräteverbindung'}
            </p>
          </div>
        </div>
        {summary?.severity && (
          <StatusChip tone={deviceConnectionSeverityTone(summary.severity)}>
            {summary.openUnpluggedEpisode
              ? DEVICE_CONNECTION_LABELS.tamperHint
              : deviceConnectionStatusLabel(summary.currentDeviceConnectionStatus)}
          </StatusChip>
        )}
      </div>

      {stale && (
        <div className="flex items-center gap-2 text-[11px] text-[color:var(--status-watch)]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{DEVICE_CONNECTION_LABELS.cardStaleHint}</span>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2 text-[12px]">
        <div className="rounded-xl border border-border/60 px-3 py-2">
          <p className="text-muted-foreground">Status (Webhook)</p>
          <p className="font-medium mt-0.5 flex items-center gap-1.5">
            {summary?.currentDeviceConnectionStatus === 'unplugged' ? (
              <Plug className="w-3.5 h-3.5 text-[color:var(--status-critical)]" />
            ) : (
              <PlugZap className="w-3.5 h-3.5 text-[color:var(--status-positive)]" />
            )}
            {summary
              ? deviceConnectionStatusLabel(summary.currentDeviceConnectionStatus)
              : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 px-3 py-2">
          <p className="text-muted-foreground">Offene Unterbrechung</p>
          <p className="font-medium mt-0.5">
            {summary?.openUnpluggedEpisode
              ? `${formatDeviceConnectionTimestamp(summary.openUnpluggedSince)} · ${formatDurationMs(summary.openUnpluggedDurationMs)}`
              : DEVICE_CONNECTION_LABELS.noOpenInterruption}
          </p>
        </div>
      </div>

      {(summary?.rentalRelevant && summary.openUnpluggedEpisode) && (
        <div className="flex items-center gap-2 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 text-[color:var(--status-critical)]" />
          <StatusChip tone="critical">{DEVICE_CONNECTION_LABELS.duringActiveBooking}</StatusChip>
        </div>
      )}

      {events.length > 0 && (
        <ul className="space-y-1.5 border-t border-border/40 pt-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex items-center justify-between gap-2 text-[11px]"
            >
              <span className="font-medium">{deviceConnectionEventLabel(event.eventType)}</span>
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
