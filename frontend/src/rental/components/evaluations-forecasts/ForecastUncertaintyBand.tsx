import type { EvaluationsForecastCardModel } from '../../lib/evaluations-forecast-view-model';

export function ForecastUncertaintyBand({
  card,
  formattedRange,
}: {
  card: EvaluationsForecastCardModel;
  formattedRange: string | null;
}) {
  const low = card.intervalLow ?? card.costP50Minor;
  const high = card.intervalHigh ?? card.costP90Minor;
  const mid = card.pointEstimate ?? card.costP50Minor;

  if (low == null || high == null || mid == null) {
    return formattedRange ? (
      <p className="text-[10px] text-muted-foreground tabular-nums" aria-label="Unsicherheitsbereich">
        Band: {formattedRange}
      </p>
    ) : null;
  }

  const span = Math.max(high - low, 1);
  const pos = Math.min(100, Math.max(0, ((mid - low) / span) * 100));

  return (
    <div className="space-y-1" aria-label="Unsicherheitsbereich">
      <div className="relative h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--brand)]/25"
          style={{ width: '100%' }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[color:var(--brand)] bg-background"
          style={{ left: `calc(${pos}% - 6px)` }}
          aria-hidden
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>Untergrenze</span>
        <span className="font-medium text-foreground">Zentralprognose</span>
        <span>Obergrenze</span>
      </div>
      {formattedRange ? (
        <p className="text-[10px] text-muted-foreground tabular-nums text-center">{formattedRange}</p>
      ) : null}
    </div>
  );
}
