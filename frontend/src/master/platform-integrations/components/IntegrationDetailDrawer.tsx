import { ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { usePlatformIntegrationDetail } from '../usePlatformIntegrations';
import {
  IntegrationEnvironmentChip,
  IntegrationScopeChip,
  IntegrationStatusRow,
} from './IntegrationStatusChips';
import { attentionLabel, formatRelativeDe } from '../platform-integrations.utils';

interface IntegrationDetailDrawerProps {
  integrationId: string | null;
  onClose: () => void;
  onOpenDrilldown?: (view: string, params?: Record<string, string>) => void;
}

export function IntegrationDetailDrawer({
  integrationId,
  onClose,
  onOpenDrilldown,
}: IntegrationDetailDrawerProps) {
  const { data, loading, error, refresh } = usePlatformIntegrationDetail(integrationId);

  if (!integrationId) return null;

  return (
    <div
      className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-border bg-background shadow-2xl flex flex-col"
      data-testid="integration-detail-drawer"
      role="dialog"
      aria-label="Integration Detail"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg font-semibold">{data?.name ?? integrationId}</h2>
          <p className="text-sm text-muted-foreground">{data?.purpose}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Schließen
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-5">
        {loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Lädt…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            {error}
            <Button type="button" variant="link" size="sm" className="ml-2" onClick={() => void refresh()}>
              Erneut versuchen
            </Button>
          </div>
        ) : null}
        {data ? (
          <>
            <div className="flex flex-wrap gap-2">
              <IntegrationScopeChip scope={data.scope} />
              {data.environment !== 'not_applicable' && (
                <IntegrationEnvironmentChip environment={data.environment} />
              )}
            </div>
            <IntegrationStatusRow
              configuration={data.configuration}
              authentication={data.authentication}
              runtimeHealth={data.runtimeHealth}
              environment={data.environment}
            />

            <section className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Aktueller Zustand
              </h3>
              <div className="text-sm space-y-1">
                <div>Letzte Prüfung: {formatRelativeDe(data.lastHealthCheckAt)}</div>
                <div>Letzte Aktivität: {formatRelativeDe(data.lastActivityAt)}</div>
                {data.lastSuccessAt && <div>Letzter Erfolg: {formatRelativeDe(data.lastSuccessAt)}</div>}
                {data.lastErrorSummary && (
                  <div className="text-destructive">Letzter Fehler: {data.lastErrorSummary}</div>
                )}
              </div>
            </section>

            {data.configurationFields.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Konfiguration
                </h3>
                <dl className="space-y-2">
                  {data.configurationFields.map((field) => (
                    <div key={field.key} className="flex justify-between gap-3 text-sm border-b border-border/50 pb-2">
                      <dt className="text-muted-foreground">{field.label}</dt>
                      <dd className="font-medium text-right">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {data.tenantImpact && (
              <section className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
                <div className="font-medium">{data.tenantImpact.label}</div>
                <div className="text-2xl font-semibold tabular-nums mt-1">{data.tenantImpact.count}</div>
              </section>
            )}

            {data.issues.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Aktuelle Probleme
                </h3>
                <ul className="space-y-2">
                  {data.issues.map((issue, idx) => (
                    <li
                      key={`${issue.code}-${idx}`}
                      className={`rounded-xl px-3 py-2 text-sm ${
                        issue.severity === 'critical'
                          ? 'bg-destructive/10 text-destructive'
                          : 'bg-amber-500/10 text-amber-900 dark:text-amber-100'
                      }`}
                    >
                      {issue.message || attentionLabel(issue.code)}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {data.drilldownView && data.drilldownView !== 'platform-integrations' && (
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => onOpenDrilldown?.(data.drilldownView, data.drilldownParams)}
              >
                <ExternalLink className="w-4 h-4" />
                In Fach-Hub öffnen
              </Button>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
