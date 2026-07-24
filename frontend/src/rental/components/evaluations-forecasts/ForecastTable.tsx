import {
  formatForecastValue,
  inferenceTierLabel,
  targetLabel,
  type EvaluationsForecastCardModel,
} from '../../lib/evaluations-forecast-view-model';

export function ForecastTable({
  cards,
  locale,
  onOpen,
}: {
  cards: EvaluationsForecastCardModel[];
  locale: string;
  onOpen: (card: EvaluationsForecastCardModel) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/60">
      <table className="w-full min-w-[640px] text-left text-[11px]">
        <caption className="sr-only">Prognoseübersicht als Tabelle</caption>
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th scope="col" className="px-3 py-2 font-semibold">
              Ziel
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Horizont
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Prognose
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Unsicherheit
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Modell
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              Abdeckung
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              sMAPE
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              <span className="sr-only">Aktion</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => {
            const { primary, range } = formatForecastValue(card, locale);
            return (
              <tr key={card.id} className="border-t border-border/50 hover:bg-muted/20">
                <td className="px-3 py-2.5 font-medium text-foreground">
                  {targetLabel(card.targetKey, card.kind)}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{card.horizonDays}d</td>
                <td className="px-3 py-2.5 font-semibold tabular-nums">{primary}</td>
                <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                  {range ?? '—'}
                </td>
                <td className="px-3 py-2.5">
                  <span className="block">{inferenceTierLabel(card.inferenceTier)}</span>
                  <span className="font-mono text-[9px] text-muted-foreground">{card.modelVersion}</span>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{Math.round(card.dataCoveragePercent)}%</td>
                <td className="px-3 py-2.5 tabular-nums">
                  {card.historicalSmape != null ? `${card.historicalSmape}%` : '—'}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onOpen(card)}
                    className="text-[color:var(--brand)] font-medium hover:underline"
                  >
                    Details
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
