import { ExternalLink } from 'lucide-react';
import {
  DataCard,
  DetailDrawer,
  SectionHeader,
  StatusChip,
} from '../../../components/patterns';
import { MasterLoadingState } from '../../shell/MasterPageStates';
import { usePlatformOpsServiceDetail } from '../usePlatformOps';
import {
  formatRelativeDe,
  platformOpsStateLabel,
  platformOpsStateTone,
} from '../platform-ops.utils';

export function PlatformOpsServiceDetailDrawer({
  serviceId,
  onClose,
  onNavigateView,
}: {
  serviceId: string;
  onClose: () => void;
  onNavigateView?: (view: string, params?: Record<string, string>) => void;
}) {
  const { detail, loading } = usePlatformOpsServiceDetail(serviceId);

  return (
    <DetailDrawer
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={detail?.name ?? 'Dienst'}
      description={detail?.group}
      widthClassName="sm:max-w-xl"
    >
      {loading ? (
        <MasterLoadingState variant="rows" count={4} />
      ) : !detail ? (
        <p className="text-sm text-muted-foreground">Dienst nicht gefunden.</p>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={platformOpsStateTone(detail.state)} dot>
              {platformOpsStateLabel(detail.state)}
            </StatusChip>
            {detail.lastCheckAt && (
              <span className="text-xs text-muted-foreground">
                Letzter Check: {formatRelativeDe(detail.lastCheckAt)}
              </span>
            )}
          </div>

          <p className="text-sm text-muted-foreground">{detail.stateSummary}</p>

          {(detail.providerHealth || detail.integrationHealth) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {detail.providerHealth && (
                <DataCard bodyClassName="p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Provider</p>
                  <StatusChip tone={platformOpsStateTone(detail.providerHealth.state)}>
                    {platformOpsStateLabel(detail.providerHealth.state)}
                  </StatusChip>
                  <p className="text-xs mt-2">{detail.providerHealth.summary}</p>
                </DataCard>
              )}
              {detail.integrationHealth && (
                <DataCard bodyClassName="p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Integration</p>
                  <StatusChip tone={platformOpsStateTone(detail.integrationHealth.state)}>
                    {platformOpsStateLabel(detail.integrationHealth.state)}
                  </StatusChip>
                  <p className="text-xs mt-2">{detail.integrationHealth.summary}</p>
                </DataCard>
              )}
            </div>
          )}

          {detail.tenantImpact && (
            <DataCard bodyClassName="p-4">
              <p className="text-sm font-medium">Tenant-Impact</p>
              <p className="text-sm text-muted-foreground">
                {detail.tenantImpact.count} {detail.tenantImpact.label}
              </p>
            </DataCard>
          )}

          {detail.signals.length > 0 && (
            <div>
              <SectionHeader title="Signale" />
              <dl className="space-y-2">
                {detail.signals.map((s) => (
                  <div key={s.label} className="flex justify-between gap-4 text-sm border-b border-border pb-2">
                    <dt className="text-muted-foreground">{s.label}</dt>
                    <dd className="font-medium text-right">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {detail.activeAlerts.length > 0 && (
            <div>
              <SectionHeader title="Aktive Alarme" />
              <ul className="space-y-2">
                {detail.activeAlerts.map((a) => (
                  <li key={a.id} className="text-sm p-3 rounded-xl border border-border">
                    <span className="font-medium">{a.alertname}</span>
                    <p className="text-xs text-muted-foreground">{a.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {detail.hubDrilldown && onNavigateView && (
            <button
              type="button"
              className="sq-btn-secondary text-sm px-4 py-2 rounded-xl"
              onClick={() => onNavigateView(detail.hubDrilldown!.view, detail.hubDrilldown!.params)}
            >
              Fachlichen Hub öffnen
            </button>
          )}

          {detail.grafanaPanelPath && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              Grafana: {detail.grafanaPanelPath}
              <ExternalLink className="w-3 h-3" aria-hidden />
            </p>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}
