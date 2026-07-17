import { Icon } from '../ui/Icon';
import { mapTripDecisionSummaryLabels } from './trip-decision.mapper';
import type { TripDecisionSummary } from './trip-decision.types';

function DimensionChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'amber' | 'orange' | 'red' | 'green';
}) {
  const toneClass =
    tone === 'amber'
      ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
      : tone === 'orange'
        ? 'border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-300'
        : tone === 'red'
          ? 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-300'
          : tone === 'green'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
            : 'border-border/60 bg-muted/30 text-foreground';

  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`} aria-labelledby={`dim-${label}`}>
      <p id={`dim-${label}`} className="text-[10px] font-medium uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-0.5 text-[12px] font-semibold">{value}</p>
    </div>
  );
}

function recommendationTone(level: TripDecisionSummary['recommendation']['level']) {
  if (level === 'FAHRZEUGPRUEFUNG') return 'red';
  if (level === 'BEOBACHTEN' || level === 'KUNDENGESPRAECH') return 'orange';
  if (level === 'TECHNISCHE_DATENPRUEFUNG') return 'amber';
  if (level === 'KEINE_MASSNAHME') return 'green';
  return 'neutral';
}

function dataBasisTone(dataBasis: TripDecisionSummary['dataBasis']) {
  if (dataBasis === 'BELASTBAR') return 'green';
  if (dataBasis === 'EINGESCHRAENKT') return 'amber';
  return 'neutral';
}

export interface TripDecisionSummaryProps {
  summary: TripDecisionSummary;
  compact?: boolean;
}

export function TripDecisionSummaryPanel({ summary, compact = false }: TripDecisionSummaryProps) {
  const labels = mapTripDecisionSummaryLabels(summary);

  return (
    <section className="space-y-3" aria-label="Fahrt-Entscheidung">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Fahrt-Entscheidung
          </p>
          <p className="mt-1 text-[13px] font-semibold text-foreground">{labels.recommendation}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {summary.recommendation.primaryReason}
          </p>
        </div>
        {summary.partial && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] text-muted-foreground">
            <Icon name="info" className="h-3 w-3" />
            Teilweise
          </span>
        )}
      </div>

      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
        <DimensionChip label="Datenbasis" value={labels.dataBasis} tone={dataBasisTone(summary.dataBasis)} />
        {labels.vehicleLoad && (
          <DimensionChip label="Fahrzeugbelastung" value={labels.vehicleLoad} tone="orange" />
        )}
        {labels.driverConduct && (
          <DimensionChip label="Fahrverhalten" value={labels.driverConduct} tone="neutral" />
        )}
        <DimensionChip
          label="Missbrauchsevidenz"
          value={
            summary.misuseEvidence.caseCount > 0
              ? `${summary.misuseEvidence.caseCount} Hinweis(e)`
              : 'Keine'
          }
          tone={summary.misuseEvidence.caseCount > 0 ? 'amber' : 'neutral'}
        />
        <DimensionChip label="Attribution" value={summary.attribution.level.replace(/_/g, ' ')} />
        <DimensionChip
          label="Empfehlung"
          value={labels.recommendation}
          tone={recommendationTone(summary.recommendation.level)}
        />
      </div>
    </section>
  );
}
