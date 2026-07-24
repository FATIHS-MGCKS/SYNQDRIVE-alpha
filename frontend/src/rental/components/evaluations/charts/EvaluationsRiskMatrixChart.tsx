import type { RiskMatrixResult } from '@synq/evaluations-insights/evaluations-risk-cost-visualizations.contract';
import { fmtEurMinor } from '../../../lib/evaluations-format';
import { EvaluationsChartCard } from './EvaluationsChartCard';
import { EvaluationsChartDataTable } from './EvaluationsChartDataTable';
import { cn } from '../../../../components/ui/utils';

interface EvaluationsRiskMatrixChartProps {
  data: RiskMatrixResult;
  intlLocale: string;
  isDarkMode: boolean;
  labels: {
    title: string;
    question: string;
    period: string;
    unit: string;
    emptyTitle: string;
    emptyDescription: string;
    tableCaption: string;
    colProbability: string;
    colImpact: string;
    colExposure: string;
    colGroups: string;
    colConfidence: string;
    axisImpact: string;
    axisProbability: string;
    estimate: string;
  };
}

const MATRIX_SIZE = 5;

function cellTone(probability: number, impact: number): string {
  const score = probability + impact;
  if (score >= 8) return 'bg-[color:var(--status-danger)]/25 border-[color:var(--status-danger)]/40';
  if (score >= 6) return 'bg-[color:var(--status-watch)]/20 border-[color:var(--status-watch)]/35';
  if (score >= 4) return 'bg-muted/40 border-border/40';
  return 'bg-[color:var(--status-success)]/10 border-border/30';
}

export function EvaluationsRiskMatrixChart({
  data,
  intlLocale,
  labels,
}: EvaluationsRiskMatrixChartProps) {
  const gridCells = Array.from({ length: MATRIX_SIZE * MATRIX_SIZE }, (_, i) => {
    const impact = MATRIX_SIZE - Math.floor(i / MATRIX_SIZE);
    const probability = (i % MATRIX_SIZE) + 1;
    return { impact, probability, points: [] as RiskMatrixResult['points'] };
  });

  for (const point of data.points) {
    const idx = (MATRIX_SIZE - point.impact) * MATRIX_SIZE + (point.probability - 1);
    if (idx >= 0 && idx < gridCells.length) gridCells[idx].points.push(point);
  }

  return (
    <EvaluationsChartCard
      chartId="eval-risk-matrix"
      title={labels.title}
      subtitle={labels.period}
      periodLabel={data.periodLabel}
      unitLabel={labels.unit}
      question={labels.question}
      isEstimate={data.points.some((p) => p.isEstimate)}
      estimateLabel={labels.estimate}
      hasData={data.hasData}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      tableCaption={labels.tableCaption}
      tableAlternative={
        <EvaluationsChartDataTable
          caption={labels.tableCaption}
          columns={[
            { key: 'label', label: labels.colProbability },
            { key: 'probability', label: 'P' },
            { key: 'impact', label: labels.colImpact },
            { key: 'groups', label: labels.colGroups },
            { key: 'exposure', label: labels.colExposure, align: 'right' },
            { key: 'confidence', label: labels.colConfidence },
          ]}
          rows={data.points.map((p) => ({
            label: p.label,
            probability: p.probability,
            impact: p.impact,
            groups: p.groupCount,
            exposure: p.exposureMinor != null ? fmtEurMinor(p.exposureMinor, intlLocale) : '—',
            confidence: p.confidence,
          }))}
        />
      }
    >
      <div className="flex gap-3">
        <div className="flex flex-col justify-between py-6 text-[9px] font-medium text-muted-foreground">
          <span>{labels.axisImpact}</span>
          <span className="rotate-180 [writing-mode:vertical-rl]">5 → 1</span>
        </div>
        <div className="flex-1">
          <div
            className="grid grid-cols-5 gap-1"
            role="grid"
            aria-label={labels.title}
          >
            {gridCells.map((cell, idx) => (
              <div
                key={idx}
                role="gridcell"
                className={cn(
                  'relative flex min-h-[52px] flex-col items-center justify-center rounded-md border p-1',
                  cellTone(cell.probability, cell.impact),
                )}
                aria-label={`P${cell.probability} I${cell.impact}`}
              >
                {cell.points.map((p) => (
                  <a
                    key={p.id}
                    href={`#auswertungen-risiken`}
                    className="mb-0.5 w-full truncate rounded px-1 py-0.5 text-center text-[8.5px] font-semibold bg-background/80 hover:underline"
                    title={`${p.label}: ${p.groupCount} groups`}
                  >
                    {p.label}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
            <span>1</span>
            <span>{labels.axisProbability}</span>
            <span>5</span>
          </div>
        </div>
      </div>
    </EvaluationsChartCard>
  );
}
