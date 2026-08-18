import { ExternalLink } from 'lucide-react';
import {
  DataCard,
  DetailDrawer,
  SectionHeader,
  StatusChip,
} from '../../../components/patterns';
import { MasterLoadingState } from '../../shell/MasterPageStates';
import { usePlatformOpsIncidentDetail } from '../usePlatformOps';
import {
  formatRelativeDe,
  platformOpsStateLabel,
  platformOpsStateTone,
} from '../platform-ops.utils';

export function PlatformOpsIncidentDetailDrawer({
  incidentId,
  onClose,
  onOpenOrganization,
}: {
  incidentId: string;
  onClose: () => void;
  onOpenOrganization?: (orgId: string) => void;
}) {
  const { incident, loading } = usePlatformOpsIncidentDetail(incidentId);

  return (
    <DetailDrawer
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={incident?.summary ?? 'Vorfall'}
      description={incident?.affectedComponent}
      widthClassName="sm:max-w-xl"
    >
      {loading ? (
        <MasterLoadingState variant="rows" count={4} />
      ) : !incident ? (
        <p className="text-sm text-muted-foreground">Vorfall nicht gefunden.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <StatusChip tone={incident.severity === 'critical' ? 'critical' : 'warning'}>
              {incident.severity}
            </StatusChip>
            <StatusChip tone="neutral">{incident.state}</StatusChip>
            <span className="text-xs text-muted-foreground self-center">
              Seit {formatRelativeDe(incident.firstSeen)} · Zuletzt {formatRelativeDe(incident.lastSeen)}
            </span>
          </div>

          <DataCard bodyClassName="p-4 space-y-2">
            <h3 className="text-sm font-semibold">Impact</h3>
            <p className="text-sm">{incident.impact}</p>
            {incident.affectedResourceCount != null && (
              <p className="text-xs text-muted-foreground">
                Betroffene Ressourcen: {incident.affectedResourceCount}
              </p>
            )}
          </DataCard>

          {incident.organizationNames.length > 0 && (
            <div>
              <SectionHeader title="Betroffene Organisationen" />
              <ul className="space-y-1">
                {incident.organizationIds.map((orgId, i) => (
                  <li key={orgId}>
                    {onOpenOrganization ? (
                      <button
                        type="button"
                        className="text-sm text-[color:var(--brand)] hover:underline"
                        onClick={() => onOpenOrganization(orgId)}
                      >
                        {incident.organizationNames[i] ?? orgId}
                      </button>
                    ) : (
                      <span className="text-sm">{incident.organizationNames[i] ?? orgId}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {incident.timeline.length > 0 && (
            <div>
              <SectionHeader title="Timeline" />
              <ol className="space-y-2 border-l border-border pl-4">
                {incident.timeline.map((ev, i) => (
                  <li key={`${ev.at}-${i}`} className="text-sm">
                    <span className="text-xs text-muted-foreground">{formatRelativeDe(ev.at)}</span>
                    <p>{ev.summary}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {incident.relatedAlerts.length > 0 && (
            <div>
              <SectionHeader title="Verwandte Alarme" />
              <ul className="space-y-2">
                {incident.relatedAlerts.map((a) => (
                  <li key={a.id} className="p-3 rounded-xl border border-border text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-medium">{a.alertname}</span>
                      <StatusChip tone={a.severity === 'critical' ? 'critical' : 'warning'}>
                        {a.count}×
                      </StatusChip>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{a.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {incident.diagnostics && (
            <div>
              <SectionHeader title="Diagnostik" />
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                {incident.diagnostics.correlationId && (
                  <>
                    <dt className="text-muted-foreground">Correlation ID</dt>
                    <dd className="font-mono text-xs break-all">{incident.diagnostics.correlationId}</dd>
                  </>
                )}
                {incident.diagnostics.requestId && (
                  <>
                    <dt className="text-muted-foreground">Request ID</dt>
                    <dd className="font-mono text-xs break-all">{incident.diagnostics.requestId}</dd>
                  </>
                )}
                {incident.diagnostics.lastError && (
                  <>
                    <dt className="text-muted-foreground">Letzter Fehler</dt>
                    <dd className="text-xs break-all">{incident.diagnostics.lastError}</dd>
                  </>
                )}
              </dl>
            </div>
          )}

          {incident.runbookUrl && (
            <a
              href={incident.runbookUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[color:var(--brand)] hover:underline"
            >
              Runbook öffnen <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}
