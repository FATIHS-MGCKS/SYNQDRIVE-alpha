import { AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import {
  DataCard,
  DataTable,
  EmptyState,
  ErrorState,
  SectionHeader,
  StatusChip,
  type DataTableColumn,
} from '../../../components/patterns';
import { MasterPageSection, MasterStaleDataHint } from '../../shell';
import type { PlatformOpsOverviewDto, PlatformOpsIncidentDto } from '../types';
import {
  formatRelativeDe,
  platformOpsStateLabel,
  platformOpsStateTone,
} from '../platform-ops.utils';

const DOMAIN_LABELS: Record<string, string> = {
  core: 'Kern',
  processing: 'Verarbeitung',
  edge: 'Edge',
  external: 'Extern',
  resilience: 'Resilienz',
};

export function PlatformOpsOverviewTab({
  data,
  isStale,
  onRefresh,
  onNavigateSection,
  onOpenIncident,
}: {
  data: PlatformOpsOverviewDto;
  isStale: boolean;
  onRefresh: () => void;
  onNavigateSection: (section: string, tab?: string) => void;
  onOpenIncident: (id: string) => void;
}) {
  const healthy = data.globalPlatformState === 'healthy' && data.activeIncidents.length === 0;

  return (
    <div className="space-y-5">
      <DataCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <StatusChip tone={platformOpsStateTone(data.globalPlatformState)} dot>
                {platformOpsStateLabel(data.globalPlatformState)}
              </StatusChip>
              <span className="text-sm text-muted-foreground">
                Stand: {formatRelativeDe(data.generatedAt)}
              </span>
              {isStale && (
                <MasterStaleDataHint label="Daten möglicherweise veraltet." onRefresh={onRefresh} />
              )}
            </div>
            {healthy ? (
              <p className="text-sm text-muted-foreground">Plattform betriebsbereit — keine aktiven Vorfälle.</p>
            ) : (
              <p className="text-sm font-medium">
                {data.incidentSummary.count} aktive Problem(e)
                {data.incidentSummary.affectedOrganizationCount > 0 &&
                  ` · ${data.incidentSummary.affectedOrganizationCount} Organisation(en) betroffen`}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              {Object.entries(data.domains).map(([key, state]) => (
                <button
                  key={key}
                  type="button"
                  className="sq-chip-interactive text-[11px] font-semibold px-2.5 py-1 rounded-lg border border-border"
                  onClick={() => onNavigateSection(key === 'resilience' ? 'resilience' : key === 'processing' ? 'processing' : 'services')}
                >
                  <StatusChip tone={platformOpsStateTone(state)}>
                    {DOMAIN_LABELS[key] ?? key}
                  </StatusChip>
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="sq-btn-secondary flex items-center gap-2 px-3 py-2 rounded-xl text-sm" onClick={onRefresh} aria-label="Daten neu laden">
            <RefreshCw className="w-4 h-4" />
            Aktualisieren
          </button>
        </div>
      </DataCard>

      <MasterPageSection>
        <SectionHeader title="Aktive Vorfälle" />
        {data.activeIncidents.length === 0 ? (
          <EmptyState compact title="Keine aktiven Vorfälle" description="Der Plattformbetrieb ist stabil." />
        ) : (
          <IncidentTable rows={data.activeIncidents} onOpen={onOpenIncident} />
        )}
        {data.activeIncidents.length > 0 && (
          <button type="button" className="text-sm text-[color:var(--brand)] hover:underline mt-2" onClick={() => onNavigateSection('incidents')}>
            Alle Vorfälle anzeigen →
          </button>
        )}
      </MasterPageSection>

      {data.degradedServices.length > 0 && (
        <MasterPageSection>
          <SectionHeader title="Degradierte Dienste" />
          <DataTable
            columns={serviceColumns((id) => onNavigateSection('services', id))}
            rows={data.degradedServices}
            getRowKey={(r) => r.id}
            empty="Keine degradierten Dienste"
          />
        </MasterPageSection>
      )}

      {data.criticalSignals.length > 0 && (
        <MasterPageSection>
          <SectionHeader title="Kritische Signale" />
          <ul className="space-y-2">
            {data.criticalSignals.map((s) => (
              <li key={s.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-muted/30">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.summary}</p>
                  <p className="text-xs text-muted-foreground">{s.component}</p>
                </div>
                <StatusChip tone={s.severity === 'critical' ? 'critical' : 'warning'}>{s.severity}</StatusChip>
              </li>
            ))}
          </ul>
        </MasterPageSection>
      )}

      {Object.keys(data.moduleErrors).length > 0 && (
        <ErrorState
          title="Teilweise Daten nicht verfügbar"
          error={Object.entries(data.moduleErrors).map(([k, v]) => `${k}: ${v}`).join('; ')}
          onRetry={onRefresh}
        />
      )}
    </div>
  );
}

function IncidentTable({
  rows,
  onOpen,
}: {
  rows: PlatformOpsIncidentDto[];
  onOpen: (id: string) => void;
}) {
  const columns: DataTableColumn<PlatformOpsIncidentDto>[] = [
    {
      key: 'severity',
      header: 'Schwere',
      cell: (r) => <StatusChip tone={r.severity === 'critical' ? 'critical' : 'warning'}>{r.severity}</StatusChip>,
    },
    { key: 'summary', header: 'Titel', cell: (r) => <span className="font-medium text-sm">{r.summary}</span> },
    { key: 'component', header: 'Komponente', cell: (r) => r.affectedComponent },
    { key: 'started', header: 'Seit', cell: (r) => formatRelativeDe(r.firstSeen) },
    {
      key: 'action',
      header: '',
      cell: (r) => (
        <button type="button" className="text-[color:var(--brand)] text-xs hover:underline flex items-center gap-1" onClick={() => onOpen(r.id)}>
          Detail <ArrowRight className="w-3 h-3" />
        </button>
      ),
    },
  ];
  return <DataCard><DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} card={false} /></DataCard>;
}

function serviceColumns(onOpen: (id: string) => void): DataTableColumn<{ id: string; name: string; state: string; keySignal: string; stateSummary: string }>[] {
  return [
    { key: 'name', header: 'Dienst', cell: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'state', header: 'Zustand', cell: (r) => <StatusChip tone={platformOpsStateTone(r.state as any)}>{platformOpsStateLabel(r.state as any)}</StatusChip> },
    { key: 'signal', header: 'Signal', cell: (r) => r.keySignal },
    { key: 'summary', header: 'Zusammenfassung', cell: (r) => <span className="text-muted-foreground text-sm">{r.stateSummary}</span> },
    {
      key: 'open',
      header: '',
      cell: (r) => (
        <button type="button" className="text-xs text-[color:var(--brand)] hover:underline" onClick={() => onOpen(r.id)}>
          Öffnen
        </button>
      ),
    },
  ];
}
