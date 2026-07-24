import { BarChart3, ChevronRight, TrendingUp } from 'lucide-react';
import { cn } from '../../../components/ui/utils';
import {
  formatForecastValue,
  inferenceTierLabel,
  targetLabel,
  type EvaluationsForecastCardModel,
} from '../../lib/evaluations-forecast-view-model';
import { ForecastTermTooltip } from './ForecastTermTooltip';
import { ForecastUncertaintyBand } from './ForecastUncertaintyBand';

const CONFIDENCE_STYLES = {
  high: 'sq-tone-success',
  medium: 'sq-tone-watch',
  low: 'sq-tone-warning',
} as const;

export function ForecastCard({
  card,
  locale,
  onOpen,
  compact = false,
}: {
  card: EvaluationsForecastCardModel;
  locale: string;
  onOpen: (card: EvaluationsForecastCardModel) => void;
  compact?: boolean;
}) {
  const { primary, range } = formatForecastValue(card, locale);
  const showWarning =
    card.visibility === 'low_confidence' || card.visibility === 'partial_data';

  return (
    <article
      className={cn(
        'relative flex flex-col rounded-xl border border-border/60 surface-premium/55 p-3 sm:p-4',
        'transition-[box-shadow,transform] duration-150 hover:shadow-sm active:scale-[0.99]',
        compact && 'p-2.5',
      )}
      aria-labelledby={`forecast-${card.id}-title`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <ForecastTermTooltip term="forecast" label="Prognose" />
          </p>
          <h3
            id={`forecast-${card.id}-title`}
            className="text-[13px] font-semibold text-foreground leading-snug text-balance"
          >
            {targetLabel(card.targetKey, card.kind)}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Horizont: {card.horizonDays} Tage · {card.horizonStartDate} – {card.horizonEndDate}
          </p>
        </div>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {card.kind === 'risk' ? (
            <BarChart3 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          )}
        </div>
      </div>

      <div className="mb-2">
        <p className="text-[10px] text-muted-foreground mb-0.5">Zentrale Prognose</p>
        <p className="text-[22px] sm:text-[24px] font-semibold tabular-nums tracking-tight text-foreground">
          {primary}
        </p>
        {card.currency && card.unit.includes('EUR') ? (
          <p className="text-[10px] text-muted-foreground">{card.currency}</p>
        ) : null}
      </div>

      <ForecastUncertaintyBand card={card} formattedRange={range} />

      <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[10px]">
        <div>
          <dt className="text-muted-foreground">Modelltyp</dt>
          <dd className="font-medium text-foreground">{inferenceTierLabel(card.inferenceTier)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Version</dt>
          <dd className="font-mono text-[9px] text-foreground truncate">{card.modelVersion}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Datenabdeckung</dt>
          <dd className="font-medium tabular-nums">{Math.round(card.dataCoveragePercent)} %</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Berechnet</dt>
          <dd className="font-medium tabular-nums">
            {new Date(card.generatedAt).toLocaleString(locale, {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </dd>
        </div>
      </dl>

      {card.historicalSmape != null ? (
        <p className="mt-2 text-[10px] text-muted-foreground">
          Historische Güte (sMAPE Backtest):{' '}
          <span className="font-medium tabular-nums text-foreground">{card.historicalSmape} %</span>
        </p>
      ) : null}

      {card.topFactors.length > 0 && !compact ? (
        <ul className="mt-2 space-y-0.5 text-[10px] text-muted-foreground">
          {card.topFactors.slice(0, 2).map((f) => (
            <li key={f.factor} className="truncate">
              · {f.factor}: {f.impact}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide',
            CONFIDENCE_STYLES[card.confidenceLevel],
          )}
        >
          Confidence: {card.confidenceLevel}
        </span>
        <span className="rounded-full px-2 py-0.5 text-[9px] font-semibold sq-tone-neutral">
          {card.dataBasis}
        </span>
      </div>

      {showWarning ? (
        <p
          className="mt-2 rounded-md border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-2 py-1.5 text-[10px] text-[color:var(--status-watch)]"
          role="status"
        >
          {card.visibilityMessage}
        </p>
      ) : (
        <p className="mt-2 text-[10px] text-muted-foreground italic">
          Keine absolute Sicherheit — Prognose dient der Planung, nicht automatischen Entscheidungen.
        </p>
      )}

      <button
        type="button"
        onClick={() => onOpen(card)}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-[color:var(--brand)] hover:underline"
      >
        Details & Einflussfaktoren
        <ChevronRight className="h-3 w-3" aria-hidden />
      </button>
    </article>
  );
}
