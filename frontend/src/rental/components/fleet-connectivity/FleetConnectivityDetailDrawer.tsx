import { Info, MapPin, Radio, Shield } from 'lucide-react';
import { DetailDrawer, StatusChip } from '../../../components/patterns';
import { SupportContextButton } from '../../../components/support/SupportContextButton';
import type { FleetConnectivityVehicle } from '../../../lib/api';
import { formatOdometerKmFloor } from '../../../lib/formatVehicleDisplay';
import {
  ConnectionStatusChip,
  CoverageStateChip,
  SignalStateChip,
} from './fleet-connectivity.badges';
import {
  SIGNAL_MATRIX_LABELS,
  deviceConnectionRowLabel,
  deviceConnectionSeverityTone,
  jammingSnapshotSummary,
  maskedIdentity,
  obdPlugDisplay,
} from './fleet-connectivity.utils';
import {
  DEVICE_CONNECTION_LABELS,
  formatDeviceConnectionTimestamp,
  formatDurationMs,
} from '../../lib/device-connection-ui';
import { DeviceConnectionWebhookChip } from './fleet-connectivity.badges';

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,38%)_1fr] gap-2 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground break-words">{value}</span>
    </div>
  );
}

interface FleetConnectivityDetailDrawerProps {
  vehicle: FleetConnectivityVehicle | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FleetConnectivityDetailDrawer({
  vehicle,
  open,
  onOpenChange,
}: FleetConnectivityDetailDrawerProps) {
  if (!vehicle) return null;

  const obd = obdPlugDisplay(vehicle.obdIsPluggedIn);
  const jammingText = jammingSnapshotSummary(
    vehicle.jammingDetectedCount,
    vehicle.signals.jamming,
  );
  const location =
    vehicle.latitude != null && vehicle.longitude != null
      ? `${vehicle.latitude.toFixed(5)}, ${vehicle.longitude.toFixed(5)}`
      : 'No data';

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      widthClassName="sm:max-w-xl"
      eyebrow="Technical telemetry"
      title={
        <span>
          {vehicle.make} {vehicle.model}
          {vehicle.year ? ` ${vehicle.year}` : ''}
        </span>
      }
      description={
        <span className="font-mono text-[11px]">
          {vehicle.licensePlate ?? '—'} · {vehicle.vin}
        </span>
      }
      status={<ConnectionStatusChip status={vehicle.connectionStatus} />}
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5 text-[12px] text-muted-foreground flex gap-2">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Read-only technical view. Data coverage reflects capability-aware
            signal freshness — not mechanical vehicle health.
          </p>
        </div>

        <DetailSection title="Connection summary">
          <div className="surface-premium rounded-xl p-3 space-y-2.5">
            <DetailRow label="Status" value={<ConnectionStatusChip status={vehicle.connectionStatus} />} />
            <DetailRow label="Note" value={vehicle.statusNote} />
            <DetailRow label="Provider" value={vehicle.provider} />
            <DetailRow label="Connection type" value={vehicle.connectionType} />
            <DetailRow label="Source type" value={vehicle.sourceType ?? '—'} />
            <DetailRow
              label="Paired / linked"
              value={
                vehicle.pairedAt
                  ? new Date(vehicle.pairedAt).toLocaleString('de-DE')
                  : '—'
              }
            />
            <DetailRow
              label="Last signal"
              value={
                vehicle.lastSeenAt
                  ? new Date(vehicle.lastSeenAt).toLocaleString('de-DE')
                  : '—'
              }
            />
            <DetailRow
              label="Last sync"
              value={
                vehicle.lastSyncedAt
                  ? new Date(vehicle.lastSyncedAt).toLocaleString('de-DE')
                  : '—'
              }
            />
            <DetailRow label="Data freshness" value={vehicle.freshnessLabel} />
          </div>
        </DetailSection>

        <DetailSection title="Device identity (masked)">
          <div className="surface-premium rounded-xl p-3 space-y-2.5 font-mono text-[11px]">
            <DetailRow label="Device serial" value={maskedIdentity(vehicle.maskedDeviceSerial)} />
            <DetailRow label="DIMO token ID" value={maskedIdentity(vehicle.maskedDimoTokenId)} />
            <DetailRow
              label="Synthetic token ID"
              value={maskedIdentity(vehicle.maskedSyntheticTokenId)}
            />
          </div>
        </DetailSection>

        <DetailSection title="Data coverage">
          <div className="surface-premium rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <CoverageStateChip
                state={vehicle.coverageState}
                freshCount={vehicle.freshSignalCount}
                expectedCount={vehicle.expectedSignalCount}
              />
              {vehicle.coveragePercent != null && (
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {vehicle.freshSignalCount}/{vehicle.expectedSignalCount} fresh expected
                  {vehicle.staleSignalCount > 0
                    ? ` · ${vehicle.staleSignalCount} stale`
                    : ''}
                  {vehicle.missingSignalCount > 0
                    ? ` · ${vehicle.missingSignalCount} missing`
                    : ''}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Fresh usable expected signals divided by expected and supported signals.
              Non-applicable capabilities (e.g. EV SoC on ICE) are excluded.
            </p>
            {vehicle.reasonCodes.length > 0 && (
              <p className="text-[10px] text-muted-foreground font-mono">
                {vehicle.reasonCodes.join(' · ')}
              </p>
            )}
          </div>
        </DetailSection>

        <DetailSection title="Signal matrix">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(SIGNAL_MATRIX_LABELS) as Array<
              keyof typeof SIGNAL_MATRIX_LABELS
            >).map((key) => (
              <div
                key={key}
                className="rounded-xl border border-border/60 px-2.5 py-2 space-y-1.5"
              >
                <p className="text-[10px] font-semibold text-muted-foreground">
                  {SIGNAL_MATRIX_LABELS[key]}
                </p>
                <SignalStateChip state={vehicle.signals[key]} />
              </div>
            ))}
          </div>
        </DetailSection>

        <DetailSection title="OBD & cellular">
          <div className="surface-premium rounded-xl p-3 space-y-3">
            <div className="flex items-start gap-2">
              <Radio className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
              <div>
                <p className="text-[12px] font-medium">{obd.text}</p>
                <StatusChip tone={obd.tone} className="mt-1.5">
                  {DEVICE_CONNECTION_LABELS.snapshotObd}
                </StatusChip>
              </div>
            </div>

            {vehicle.deviceConnection?.eventSource === 'dimo_webhook' && (
              <div className="flex items-start gap-2 border-t border-border/50 pt-3">
                <Shield className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
                <div className="space-y-2 w-full">
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    DIMO Device Connection (Webhook)
                  </p>
                  <DeviceConnectionWebhookChip device={vehicle.deviceConnection} />
                  <DetailRow
                    label="Status"
                    value={deviceConnectionRowLabel(vehicle.deviceConnection)}
                  />
                  <DetailRow
                    label="Last unplugged"
                    value={formatDeviceConnectionTimestamp(
                      vehicle.deviceConnection.lastDeviceUnpluggedAt,
                    )}
                  />
                  <DetailRow
                    label="Last plugged"
                    value={formatDeviceConnectionTimestamp(
                      vehicle.deviceConnection.lastDevicePluggedInAt,
                    )}
                  />
                  <DetailRow
                    label="Open episode"
                    value={
                      vehicle.deviceConnection.openUnpluggedEpisode
                        ? `${formatDeviceConnectionTimestamp(vehicle.deviceConnection.openUnpluggedSince)} · ${formatDurationMs(vehicle.deviceConnection.openUnpluggedDurationMs)}`
                        : DEVICE_CONNECTION_LABELS.noOpenInterruption
                    }
                  />
                  {vehicle.deviceConnection.duringActiveBooking && (
                    <StatusChip tone="critical">
                      {DEVICE_CONNECTION_LABELS.duringActiveBooking}
                    </StatusChip>
                  )}
                  {vehicle.deviceConnection.severity && (
                    <StatusChip tone={deviceConnectionSeverityTone(vehicle.deviceConnection)}>
                      Severity: {vehicle.deviceConnection.severity}
                    </StatusChip>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 border-t border-border/50 pt-3">
              <Shield className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Latest snapshot indication
                </p>
                <p className="text-[12px]">{jammingText}</p>
                {vehicle.jammingSnapshotNote && (
                  <p className="text-[11px] text-muted-foreground">
                    {vehicle.jammingSnapshotNote}
                  </p>
                )}
                {vehicle.jammingDetectedCount > 0 &&
                  vehicle.jammingIncidents[0] && (
                    <p className="text-[11px] text-muted-foreground font-mono">
                      Snapshot at{' '}
                      {vehicle.jammingIncidents[0].detectedAt
                        ? new Date(
                            vehicle.jammingIncidents[0].detectedAt,
                          ).toLocaleString('de-DE')
                        : '—'}
                      {vehicle.jammingIncidents[0].where
                        ? ` · ${vehicle.jammingIncidents[0].where}`
                        : ''}
                    </p>
                  )}
              </div>
            </div>
          </div>
        </DetailSection>

        <DetailSection title="Location & odometer">
          <div className="surface-premium rounded-xl p-3 space-y-2.5">
            <DetailRow label="Odometer" value={formatOdometerKmFloor(vehicle.odometerKm)} />
            <DetailRow
              label="Location"
              value={
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  {location}
                </span>
              }
            />
            <DetailRow label="Station" value={vehicle.station ?? '—'} />
          </div>
        </DetailSection>

        <SupportContextButton
          kind="fleet-connectivity"
          className="w-full"
          contextData={{
            vehicleId: vehicle.vehicleId,
            licensePlate: vehicle.licensePlate,
            vin: vehicle.vin,
            connectionStatus: vehicle.connectionStatus,
            lastSeen: vehicle.lastSeenAt,
            provider: vehicle.provider,
            readinessLevel: vehicle.readinessLevel,
          }}
        />
      </div>
    </DetailDrawer>
  );
}
