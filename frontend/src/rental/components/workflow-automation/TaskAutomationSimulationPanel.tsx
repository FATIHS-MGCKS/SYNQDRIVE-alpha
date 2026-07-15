import type { TaskAutomationSimulationResult } from './task-automation.types';

const OUTCOME_LABELS: Record<TaskAutomationSimulationResult['examples'][number]['outcomeDe'], string> = {
  created: 'Würde entstehen',
  deduplicated: 'Dedup-Zusammenführung',
  active: 'Wäre offen',
  auto_resolved: 'Auto-Auflösung',
  skipped: 'Übersprungen',
  trigger_only: 'Nur Auslöser',
};

export function TaskAutomationSimulationPanel({
  simulation,
  loading,
  error,
}: {
  simulation: TaskAutomationSimulationResult | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <section
        className="rounded-lg border border-border/60 bg-muted/10 px-3 py-3 text-sm text-muted-foreground"
        data-testid="task-automation-simulation-panel"
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
          Auswirkungsschätzung wird berechnet…
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-status-attention/40 bg-status-attention-soft/30 px-3 py-3 text-sm text-foreground">
        <p className="font-medium">Simulation nicht verfügbar</p>
        <p className="mt-1 text-xs text-muted-foreground">{error}</p>
      </section>
    );
  }

  if (!simulation) return null;

  return (
    <section
      className="space-y-3 rounded-lg border border-border/60 bg-muted/10 px-3 py-3"
      data-testid="task-automation-simulation-panel"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Auswirkungsschätzung ({simulation.period.days} Tage)
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">{simulation.summaryDe}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{simulation.disclaimerDe}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: 'Auslöser', value: simulation.estimates.triggerEvents },
          { label: 'Aufgaben', value: simulation.estimates.tasksWouldBeCreated },
          { label: 'Dedup', value: simulation.estimates.deduplicatedMerges },
          { label: 'Offen', value: simulation.estimates.currentlyActive },
          { label: 'Auto-Auflösung', value: simulation.estimates.autoResolved },
        ].map((item) => (
          <div key={item.label} className="rounded-md border border-border/50 bg-background/60 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">~{item.value}</p>
          </div>
        ))}
      </div>

      {simulation.dataQuality.warningsDe.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {simulation.dataQuality.warningsDe.map((warning) => (
            <p key={warning}>• {warning}</p>
          ))}
        </div>
      )}

      {simulation.examples.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Beispiele
          </p>
          {simulation.examples.map((example, index) => (
            <div key={`${example.labelDe}-${index}`} className="rounded-md border border-border/40 px-2.5 py-2 text-xs">
              <p className="font-medium text-foreground">{example.labelDe}</p>
              {example.contextDe && (
                <p className="mt-0.5 text-muted-foreground">{example.contextDe}</p>
              )}
              <p className="mt-1 text-[10px] text-muted-foreground">
                {OUTCOME_LABELS[example.outcomeDe]}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
