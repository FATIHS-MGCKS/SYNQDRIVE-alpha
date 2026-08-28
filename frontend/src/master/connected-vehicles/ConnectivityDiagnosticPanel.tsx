/**
 * Master-Admin connectivity diagnostic panel.
 *
 * Makes the "provider responds, vehicle does not" gap readable at a glance by
 * showing the last provider fetch and the last real vehicle observation side by
 * side — the two timestamps that must never be conflated.
 */
import { StatusChip } from '../../components/patterns';
import type { ConnectivityDiagnosticAdmin } from '../../lib/api';
import { buildConnectivityDiagnosticView } from './connectivity-diagnostic.presentation';
import { formatDateTimeDe } from './cv.utils';

export function ConnectivityDiagnosticPanel({
  diagnostic,
}: {
  diagnostic: ConnectivityDiagnosticAdmin;
}) {
  const view = buildConnectivityDiagnosticView(diagnostic);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      {/* items-start keeps the layout clean when the incident headline wraps to
          two lines in a narrow drawer. */}
      <div className="flex flex-wrap items-start gap-2">
        <StatusChip tone={view.tone} dot className="max-w-full text-xs">
          {view.headline}
        </StatusChip>
        <span className="text-xs text-muted-foreground">{view.providerLabel}</span>
      </div>

      {view.hint ? (
        <p className="text-xs text-muted-foreground">{view.hint}</p>
      ) : null}

      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
        <DiagnosticRow
          label="Letzte Provider-Abfrage"
          value={view.lastProviderFetchLabel}
          title={formatTimestampTitle(diagnostic.lastProviderFetchAt)}
        />
        <DiagnosticRow
          label="Letzte Fahrzeugbeobachtung"
          value={view.lastObservationLabel}
          title={formatTimestampTitle(diagnostic.lastVehicleObservationAt)}
        />
        <DiagnosticRow label="Provider-API" value={view.providerApiLabel} />
        <DiagnosticRow label="Beobachtungsstatus" value={view.observationStateLabel} />
        {/* Distinct from "Letzte Provider-Abfrage" above: this is whether the
            scheduler polls this vehicle at all, not when it last did. */}
        <DiagnosticRow label="Abfrage-Planung" value={view.providerPollScheduledLabel} />
        <DiagnosticRow label="Bindung" value={view.bindingLabel} />
        <DiagnosticRow label="Consent" value={view.consentLabel} />
        <DiagnosticRow label="Verbindungsstatus" value={view.connectionStatusLabel} />
        {view.providerErrorCategory ? (
          <DiagnosticRow label="Fehlerkategorie" value={view.providerErrorCategory} />
        ) : null}
        {view.deviceBindingRef ? (
          <DiagnosticRow label="Bindungs-Referenz" value={view.deviceBindingRef} />
        ) : null}
      </dl>
    </div>
  );
}

function DiagnosticRow({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      {/* Values truncate, so every row needs a hover title — binding refs and
          provider error codes are long enough to be cut off otherwise. */}
      <dd className="truncate text-sm" title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}

function formatTimestampTitle(iso: string | null): string | undefined {
  return iso ? formatDateTimeDe(iso) : undefined;
}
