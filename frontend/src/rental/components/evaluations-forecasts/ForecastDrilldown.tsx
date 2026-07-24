import { X } from 'lucide-react';
import {
  formatForecastValue,
  inferenceTierLabel,
  targetLabel,
  type EvaluationsForecastCardModel,
} from '../../lib/evaluations-forecast-view-model';
import { ForecastTermTooltip } from './ForecastTermTooltip';
import { ForecastUncertaintyBand } from './ForecastUncertaintyBand';

export function ForecastDrilldown({
  card,
  locale,
  onClose,
}: {
  card: EvaluationsForecastCardModel;
  locale: string;
  onClose: () => void;
}) {
  const { primary, range } = formatForecastValue(card, locale);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forecast-drilldown-title"
      onClick={onClose}
    >
      <div className="absolute inset-0 overlay-scrim" />
      <div
        className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-border surface-premium p-4 sm:p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Prognose-Details
        </p>
        <h2 id="forecast-drilldown-title" className="text-base font-bold text-foreground pr-8">
          {targetLabel(card.targetKey, card.kind)}
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          {card.horizonDays}-Tage-Horizont · Stichtag {card.asOfDate}
        </p>

        <div className="mt-4 rounded-xl border border-border/60 p-3">
          <p className="text-[10px] text-muted-foreground">Zentrale Prognose</p>
          <p className="text-2xl font-semibold tabular-nums">{primary}</p>
          <ForecastUncertaintyBand card={card} formattedRange={range} />
        </div>

        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          <div>
            <dt className="text-muted-foreground">
              <ForecastTermTooltip term="coverage" label="Datenabdeckung" />
            </dt>
            <dd className="font-medium tabular-nums">{Math.round(card.dataCoveragePercent)} %</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Datenbasis</dt>
            <dd className="font-medium">{card.dataBasis}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Modelltyp</dt>
            <dd className="font-medium">{inferenceTierLabel(card.inferenceTier)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Modellversion</dt>
            <dd className="font-mono text-[10px]">{card.modelVersion}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Feature-Set</dt>
            <dd className="font-mono text-[10px]">{card.featureSetVersion}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Scope</dt>
            <dd className="font-medium">{card.scopeKey}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">
              <ForecastTermTooltip term="smape" label="Historische Güte" />
            </dt>
            <dd className="font-medium tabular-nums">
              {card.historicalSmape != null ? `${card.historicalSmape} % sMAPE` : 'Noch kein Backtest'}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Release Gate</dt>
            <dd className="font-medium">
              {card.gatesPassed ? 'Bestanden' : card.registryStatus ?? 'Unbekannt'}
            </dd>
          </div>
        </dl>

        {card.isRiskForecast && card.probabilityEstimate != null ? (
          <div className="mt-4 rounded-lg border border-border/50 p-3 text-[11px]">
            <p className="font-semibold text-foreground mb-1">Risiko-Aufschlüsselung</p>
            <p>
              Eintrittswahrscheinlichkeit:{' '}
              <span className="font-medium tabular-nums">
                {(card.probabilityEstimate * 100).toFixed(1)} %
              </span>
            </p>
            {card.impactEstimate != null ? (
              <p>
                Auswirkung (Impact):{' '}
                <span className="font-medium tabular-nums">{card.impactEstimate}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {card.topFactors.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-foreground mb-2">Wichtigste Einflussfaktoren</h3>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {card.topFactors.map((f) => (
                <li key={f.factor}>
                  <span className="font-medium text-foreground">{f.factor}</span>: {f.impact}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {card.limitations.length > 0 ? (
          <div className="mt-4">
            <h3 className="text-xs font-semibold text-foreground mb-2">Modellgrenzen</h3>
            <ul className="list-disc pl-4 space-y-1 text-[10px] text-muted-foreground">
              {card.limitations.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-4 text-[10px] text-muted-foreground italic border-t border-border/50 pt-3">
          Diese Prognose unterstützt operative Planung. Sie ersetzt keine Inspektion, keine
          Sicherheitsfreigabe und keine individuelle Fachbeurteilung.
        </p>
      </div>
    </div>
  );
}
