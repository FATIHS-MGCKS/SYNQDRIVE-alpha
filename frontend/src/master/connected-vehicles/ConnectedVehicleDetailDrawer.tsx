import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, Loader2, RefreshCw, Unlink } from 'lucide-react';
import { DetailDrawer, ConfirmDialog, StatusChip } from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { useConnectedVehicleDetail } from './useConnectedVehiclesOperational';
import {
  CvAttentionChip,
  CvIntegrationChip,
  CvIntegrityChip,
  CvTelemetryChip,
} from './ConnectedVehicleStatusChips';
import { formatDateTimeDe } from './cv.utils';

interface ConnectedVehicleDetailDrawerProps {
  open: boolean;
  vehicleId: string | null;
  dimoVehicleId: string | null;
  onClose: () => void;
  onDeregister?: (vehicleId: string, reason: string) => Promise<void>;
  onOpenOrganization?: (organizationId: string) => void;
}

export function ConnectedVehicleDetailDrawer({
  open,
  vehicleId,
  dimoVehicleId,
  onClose,
  onDeregister,
  onOpenOrganization,
}: ConnectedVehicleDetailDrawerProps) {
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
  const [showDeregister, setShowDeregister] = useState(false);
  const [deregisterReason, setDeregisterReason] = useState('');
  const [deregistering, setDeregistering] = useState(false);

  useEffect(() => {
    if (!open) {
      setShowDiagnostics(false);
      setShowDeregister(false);
      setDeregisterReason('');
    }
  }, [open]);

  const handleDeregister = async () => {
    if (!vehicleId || !onDeregister || deregisterReason.trim().length < 5 || deregistering) return;
    setDeregistering(true);
    try {
      await onDeregister(vehicleId, deregisterReason.trim());
      setShowDeregister(false);
      onClose();
    } finally {
      setDeregistering(false);
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
                  <pre className="text-xs bg-muted/40 rounded-xl p-3 overflow-x-auto max-h-64">
                    {JSON.stringify(diagnostics, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground">Keine Diagnostikdaten.</p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  Technische Rohdaten werden nur auf Anfrage geladen.
                </p>
              )}
            </section>

            {vehicleId && onDeregister ? (
              <div className="border-t border-border pt-4">
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowDeregister(true)}
                  className="w-full sm:w-auto"
                >
                  <Unlink className="h-4 w-4 mr-2" aria-hidden />
                  Registrierung aufheben
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </DetailDrawer>

      <ConfirmDialog
        open={showDeregister}
        onOpenChange={setShowDeregister}
        title="Registrierung aufheben"
        description="Das SynqDrive-Fahrzeug wird aus der Organisation entfernt. Die DIMO-Spiegel-Identität bleibt erhalten. Telemetrie-Historie wird nicht gelöscht."
        confirmLabel={deregistering ? 'Wird aufgehoben…' : 'Aufheben bestätigen'}
        tone="critical"
        loading={deregistering}
        onConfirm={handleDeregister}
      >
        <div className="space-y-2 mt-3">
          {detail?.organizationName ? (
            <p className="text-sm">
              Organisation: <strong>{detail.organizationName}</strong>
            </p>
          ) : null}
          <label className="block text-sm font-medium" htmlFor="deregister-reason">
            Begründung (min. 5 Zeichen)
          </label>
          <textarea
            id="deregister-reason"
            className="w-full rounded-xl border border-border bg-background p-3 text-sm min-h-[80px]"
            value={deregisterReason}
            onChange={(e) => setDeregisterReason(e.target.value)}
          />
        </div>
      </ConfirmDialog>
    </>
  );
}
