import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, Loader2, RefreshCw, ShieldOff } from 'lucide-react';
import { DetailDrawer, StatusChip } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { useLanguage } from '../../i18n/LanguageContext';
import { useConnectedVehicleDetail } from './useConnectedVehiclesOperational';
import { RegistryLifecycleChip } from './RegistryLifecycleChip';
import { VehicleOffboardDialog } from './VehicleOffboardDialog';
import { canOffboardRegisteredVehicle } from './registry-lifecycle.utils';
import type { VehicleOffboardReasonCode } from './vehicle-offboard.types';
import {
  CvAttentionChip,
  CvIntegrationChip,
  CvIntegrityChip,
  CvTelemetryChip,
} from './ConnectedVehicleStatusChips';
import { ConnectivityDiagnosticPanel } from './ConnectivityDiagnosticPanel';
import { formatDateTimeDe } from './cv.utils';

interface ConnectedVehicleDetailDrawerProps {
  open: boolean;
  vehicleId: string | null;
  dimoVehicleId: string | null;
  onClose: () => void;
  offboardUiEnabled?: boolean;
  onOffboard?: (input: {
    organizationId: string;
    vehicleId: string;
    reason: VehicleOffboardReasonCode;
    note?: string;
  }) => Promise<void>;
  offboardSubmitting?: boolean;
  onRegisterDetailRefresh?: (refresh: () => void) => void;
  onOpenOrganization?: (organizationId: string) => void;
}

export function ConnectedVehicleDetailDrawer({
  open,
  vehicleId,
  dimoVehicleId,
  onClose,
  offboardUiEnabled = true,
  onOffboard,
  offboardSubmitting = false,
  onRegisterDetailRefresh,
  onOpenOrganization,
}: ConnectedVehicleDetailDrawerProps) {
  const { t } = useLanguage();
  const {
    detail,
    diagnostics,
    loading,
    diagnosticsLoading,
    error,
    diagnosticsError,
    refresh,
    loadDiagnostics,
  } = useConnectedVehicleDetail(open ? vehicleId : null, open ? dimoVehicleId : null);

  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [showOffboard, setShowOffboard] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowDiagnostics(false);
      setShowOffboard(false);
    }
  }, [open]);

  useEffect(() => {
    onRegisterDetailRefresh?.(refresh);
  }, [onRegisterDetailRefresh, refresh]);

  const offboardAllowed =
    offboardUiEnabled &&
    Boolean(onOffboard) &&
    detail &&
    canOffboardRegisteredVehicle(detail);

  const handleOffboardConfirm = async (input: {
    reason: VehicleOffboardReasonCode;
    note?: string;
  }) => {
    if (!vehicleId || !detail?.organizationId || !onOffboard || offboardSubmitting) return;
    try {
      await onOffboard({
        organizationId: detail.organizationId,
        vehicleId,
        reason: input.reason,
        note: input.note,
      });
      setShowOffboard(false);
    } catch {
      /* hub surfaces toast; keep dialog open for retry */
    }
  };

  return (
    <>
      <DetailDrawer
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={detail?.displayTitle ?? 'Fahrzeug'}
        description={detail?.displaySubtitle}
        widthClassName="sm:max-w-2xl"
      >
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" aria-hidden />
            Details werden geladen…
          </div>
        ) : error ? (
          <div className="space-y-4 p-4">
            <div className="rounded-xl border border-[color:var(--status-warning)]/40 bg-muted/30 p-4" role="alert">
              <p className="text-sm text-foreground">Basisdaten konnten nicht vollständig geladen werden.</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
            <Button type="button" variant="outline" onClick={() => refresh()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Erneut versuchen
            </Button>
          </div>
        ) : detail ? (
          <div className="space-y-6 pb-8">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kontext</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Organisation</p>
                  {detail.organizationId && detail.organizationName ? (
                    <button
                      type="button"
                      className="mt-1 flex items-center gap-2 text-sm font-medium text-[color:var(--brand)] hover:underline"
                      onClick={() => onOpenOrganization?.(detail.organizationId!)}
                    >
                      <Building2 className="h-4 w-4" aria-hidden />
                      {detail.organizationName}
                    </button>
                  ) : (
                    <p className="mt-1 text-sm text-foreground">Nicht zugeordnet</p>
                  )}
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Integrität</p>
                  <div className="mt-1">
                    <CvIntegrityChip state={detail.integrity} />
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <RegistryLifecycleChip lifecycle={detail.registryLifecycle} />
                <CvIntegrationChip label={detail.integrationConnectivityLabel} state={detail.integrationConnectivity} />
                <CvTelemetryChip label={detail.telemetryLabel} freshness={detail.telemetryFreshness} />
                <CvAttentionChip attention={detail.attention} />
              </div>
            </section>

            {detail.authorization.platformDimoDegraded ? (
              <div className="rounded-xl border border-[color:var(--status-critical)]/30 p-4 flex gap-3" role="alert">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[color:var(--status-critical)]" aria-hidden />
                <p className="text-sm text-muted-foreground">{detail.authorization.note}</p>
              </div>
            ) : null}

            {detail.activeIssues.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Aktive Themen</h3>
                <ul className="space-y-2">
                  {detail.activeIssues.map((issue) => (
                    <li key={issue.code} className="rounded-xl border border-border p-3">
                      <StatusChip tone={issue.severity === 'critical' ? 'critical' : issue.severity === 'warning' ? 'warning' : 'info'} dot>
                        {issue.reason}
                      </StatusChip>
                      <p className="text-xs text-muted-foreground mt-1">Quelle: {issue.source}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Frische</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">Letztes Signal (beobachtet)</dt>
                  <dd className="mt-1 font-medium">{formatDateTimeDe(detail.telemetryObservedAtIso)}</dd>
                  <dd className="text-xs text-muted-foreground">{detail.lastSignalRelative ?? '—'}</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">Letzte Verarbeitung</dt>
                  <dd className="mt-1 font-medium">{formatDateTimeDe(detail.pipeline.lastProcessingAt)}</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">Letzte erfolgreiche Ingestion</dt>
                  <dd className="mt-1 font-medium">{formatDateTimeDe(detail.pipeline.lastSuccessfulIngestAt)}</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">Pipeline</dt>
                  <dd className="mt-1 font-medium">
                    {detail.pipeline.stale ? 'Veraltet' : 'Aktuell'}
                    {detail.pipeline.lastPollStatus ? ` · ${detail.pipeline.lastPollStatus}` : ''}
                  </dd>
                  <dd className="text-xs text-muted-foreground">
                    Letzter Poll: {formatDateTimeDe(detail.pipeline.lastPollAt)}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">DIMO-Mapping</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">Mapping-Status</dt>
                  <dd className="mt-1 font-medium capitalize">{detail.dimoLinkStatus}</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">DIMO-Referenz</dt>
                  <dd className="mt-1 font-medium">{detail.mapping.dimoExternalId ?? '—'}</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">Token (maskiert)</dt>
                  <dd className="mt-1 font-mono text-xs">{detail.mapping.tokenIdMasked ?? '—'}</dd>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <dt className="text-xs text-muted-foreground">Autorisierung</dt>
                  <dd className="mt-1">
                    <CvIntegrationChip
                      label={detail.integrationConnectivityLabel}
                      state={detail.integrationConnectivity}
                    />
                  </dd>
                </div>
              </dl>
            </section>

            {detail.auditEvents.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audit</h3>
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                  {detail.auditEvents.map((ev) => (
                    <li key={ev.id} className="text-xs border-b border-border/60 pb-2">
                      <span className="font-medium">{ev.label}</span>
                      <span className="text-muted-foreground"> · {formatDateTimeDe(ev.occurredAt)}</span>
                      {ev.actorName ? <span className="text-muted-foreground"> · {ev.actorName}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Technische Diagnostik
                </h3>
                {vehicleId && detail.organizationId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowDiagnostics(true);
                      void loadDiagnostics();
                    }}
                  >
                    {showDiagnostics ? 'Aktualisieren' : 'Laden'}
                  </Button>
                ) : null}
              </div>
              {showDiagnostics ? (
                diagnosticsLoading ? (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Diagnostik wird geladen…
                  </p>
                ) : diagnosticsError ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    {diagnosticsError}
                  </p>
                ) : diagnostics ? (
                  <div className="space-y-3">
                    {diagnostics.connectivityDiagnostic ? (
                      <ConnectivityDiagnosticPanel
                        diagnostic={diagnostics.connectivityDiagnostic}
                      />
                    ) : null}
                    <details>
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        Rohdaten anzeigen
                      </summary>
                      <pre className="mt-2 text-xs bg-muted/40 rounded-xl p-3 overflow-x-auto max-h-64">
                        {JSON.stringify(diagnostics, null, 2)}
                      </pre>
                    </details>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Keine Diagnostikdaten.</p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  Technische Rohdaten werden nur auf Anfrage geladen.
                </p>
              )}
            </section>

            {vehicleId && offboardAllowed ? (
              <div className="border-t border-border pt-4">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowOffboard(true)}
                  className="w-full sm:w-auto"
                  disabled={offboardSubmitting}
                >
                  <ShieldOff className="h-4 w-4 mr-2" aria-hidden />
                  {t('master.cv.offboard.action')}
                </Button>
              </div>
            ) : null}
            {vehicleId && detail && !offboardAllowed && detail.registrationState === 'registered' ? (
              <p className="text-xs text-muted-foreground border-t border-border pt-4">
                {detail.registryLifecycle == null
                  ? t('master.cv.offboard.lifecycleUnknown')
                  : null}
              </p>
            ) : null}
          </div>
        ) : null}
      </DetailDrawer>

      <VehicleOffboardDialog
        open={showOffboard}
        onOpenChange={setShowOffboard}
        loading={offboardSubmitting}
        displayTitle={detail?.displayTitle ?? ''}
        organizationName={detail?.organizationName ?? null}
        onConfirm={(input) => void handleOffboardConfirm(input)}
      />
    </>
  );
}
