import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  CostDowntimeSeriesResult,
  CostParetoResult,
  CostWaterfallResult,
  DimensionComparisonResult,
  FleetFailureTrendResult,
  ReceivablesAgingResult,
} from '@synq/evaluations-insights/evaluations-risk-cost-visualizations.contract';
import { fmtEurMinor } from '../../../lib/evaluations-format';
import { cn } from '../../../../components/ui/utils';
import { EVALUATIONS_TOUCH_TARGET_CLASS } from '../evaluations-responsive.constants';
import { EVAL_DIM_TAB_STATION_ID, EVAL_DIM_TAB_VEHICLE_CLASS_ID } from '../evaluations-a11y';
import { EvaluationsChartCard } from './EvaluationsChartCard';
import { EvaluationsChartDataTable } from './EvaluationsChartDataTable';

const GRID_STROKE = { light: 'rgba(229,231,235,0.6)', dark: 'rgba(55,65,81,0.4)' };
const AXIS_STROKE = { light: '#9ca3af', dark: '#6b7280' };

function chartColors(isDarkMode: boolean) {
  return {
    grid: isDarkMode ? GRID_STROKE.dark : GRID_STROKE.light,
    axis: isDarkMode ? AXIS_STROKE.dark : AXIS_STROKE.light,
    tooltipBg: isDarkMode ? 'rgba(23,23,23,0.95)' : 'rgba(255,255,255,0.95)',
  };
}

interface ChartLabels {
  estimate: string;
  emptyTitle: string;
  emptyDescription: string;
  tableCaption: string;
  table: {
    step: string;
    status: string;
    driver: string;
    sharePercent: string;
    cumulativePercent: string;
    cumulativeLegend: string;
    period: string;
    bucket: string;
    count: string;
    percent: string;
    dimension: string;
    vehicles: string;
    deltaVsOrg: string;
    downtimePercent: string;
    dimensionFilter: string;
  };
}

interface EvaluationsCostWaterfallChartProps {
  data: CostWaterfallResult;
  intlLocale: string;
  isDarkMode: boolean;
  labels: ChartLabels & { title: string; question: string; unit: string };
}

export function EvaluationsCostWaterfallChart({
  data,
  intlLocale,
  isDarkMode,
  labels,
}: EvaluationsCostWaterfallChartProps) {
  const colors = chartColors(isDarkMode);
  const chartData = data.steps
    .filter((s) => s.kind !== 'total')
    .map((s) => ({
      name: s.label,
      value: s.valueMinor != null ? s.valueMinor / 100 : null,
      fill: s.isEstimate ? '#f59e0b' : s.kind === 'decrement' ? '#ef4444' : '#3b82f6',
    }));

  return (
    <EvaluationsChartCard
      chartId="eval-cost-waterfall"
      title={labels.title}
      periodLabel={data.periodLabel}
      unitLabel={labels.unit}
      question={labels.question}
      isEstimate={data.steps.some((s) => s.isEstimate)}
      estimateLabel={labels.estimate}
      hasData={data.hasData}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      tableCaption={labels.tableCaption}
      tableAlternative={
        <EvaluationsChartDataTable
          columns={[
            { key: 'step', label: labels.table.step },
            { key: 'value', label: labels.unit, align: 'right' },
            { key: 'status', label: labels.table.status },
          ]}
          rows={data.steps.map((s) => ({
            step: s.label,
            value: s.valueMinor != null ? fmtEurMinor(s.valueMinor, intlLocale) : '—',
            status: s.status,
          }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis
            dataKey="name"
            stroke={colors.axis}
            fontSize={9}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-25}
            textAnchor="end"
            height={50}
          />
          <YAxis
            stroke={colors.axis}
            fontSize={10}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `€${v >= 1000 ? `${(v / 100).toFixed(0)}k` : v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: colors.tooltipBg,
              border: 'none',
              borderRadius: '12px',
              fontSize: '11px',
            }}
            formatter={(value) => [fmtEurMinor(Number(value ?? 0) * 100, intlLocale), labels.unit]}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </EvaluationsChartCard>
  );
}

interface EvaluationsCostParetoChartProps {
  data: CostParetoResult;
  intlLocale: string;
  isDarkMode: boolean;
  labels: ChartLabels & { title: string; question: string; unit: string };
}

export function EvaluationsCostParetoChart({
  data,
  intlLocale,
  isDarkMode,
  labels,
}: EvaluationsCostParetoChartProps) {
  const colors = chartColors(isDarkMode);
  const chartData = data.items.slice(0, 10).map((item) => ({
    name: item.label,
    value: item.valueMinor / 100,
    cumulative: item.cumulativePercent,
  }));

  return (
    <EvaluationsChartCard
      chartId="eval-cost-pareto"
      title={labels.title}
      periodLabel={data.periodLabel}
      unitLabel={labels.unit}
      question={labels.question}
      isEstimate={data.isEstimate}
      estimateLabel={labels.estimate}
      hasData={data.hasData}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      tableCaption={labels.tableCaption}
      tableAlternative={
        <EvaluationsChartDataTable
          columns={[
            { key: 'label', label: labels.table.driver },
            { key: 'value', label: labels.unit, align: 'right' },
            { key: 'share', label: labels.table.sharePercent, align: 'right' },
            { key: 'cumulative', label: labels.table.cumulativePercent, align: 'right' },
          ]}
          rows={data.items.map((i) => ({
            label: i.label,
            value: fmtEurMinor(i.valueMinor, intlLocale),
            share: `${i.sharePercent}%`,
            cumulative: `${i.cumulativePercent}%`,
          }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis dataKey="name" stroke={colors.axis} fontSize={9} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={50} />
          <YAxis yAxisId="left" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
          <YAxis yAxisId="right" orientation="right" stroke={colors.axis} fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={{ backgroundColor: colors.tooltipBg, border: 'none', borderRadius: '12px', fontSize: '11px' }} />
          <Legend wrapperStyle={{ fontSize: '10px' }} />
          <Bar yAxisId="left" dataKey="value" fill="#3b82f6" name={labels.unit} radius={[3, 3, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="cumulative" stroke="#f59e0b" strokeWidth={2} dot={false} name={labels.table.cumulativeLegend} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </EvaluationsChartCard>
  );
}

interface EvaluationsCostDowntimeSeriesChartProps {
  data: CostDowntimeSeriesResult;
  intlLocale: string;
  isDarkMode: boolean;
  labels: ChartLabels & { title: string; question: string; costsLabel: string; downtimeLabel: string };
}

export function EvaluationsCostDowntimeSeriesChart({
  data,
  intlLocale,
  isDarkMode,
  labels,
}: EvaluationsCostDowntimeSeriesChartProps) {
  const colors = chartColors(isDarkMode);
  const chartData = data.points.map((p) => ({
    name: p.label,
    costs: p.costsMinor != null ? p.costsMinor / 100 : null,
    downtime: p.downtimePercent,
  }));

  return (
    <EvaluationsChartCard
      chartId="eval-cost-downtime-series"
      title={labels.title}
      periodLabel={data.periodLabel}
      question={labels.question}
      isEstimate={data.points.some((p) => p.isEstimate)}
      estimateLabel={labels.estimate}
      hasData={data.hasData}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      tableCaption={labels.tableCaption}
      tableAlternative={
        <EvaluationsChartDataTable
          columns={[
            { key: 'period', label: labels.table.period },
            { key: 'costs', label: labels.costsLabel, align: 'right' },
            { key: 'downtime', label: labels.downtimeLabel, align: 'right' },
          ]}
          rows={data.points.map((p) => ({
            period: p.label,
            costs: p.costsMinor != null ? fmtEurMinor(p.costsMinor, intlLocale) : '—',
            downtime: p.downtimePercent != null ? `${p.downtimePercent}%` : '—',
          }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis dataKey="name" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
          <YAxis yAxisId="costs" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
          <YAxis yAxisId="downtime" orientation="right" stroke={colors.axis} fontSize={10} domain={[0, 'auto']} tickFormatter={(v) => `${v}%`} />
          <Tooltip contentStyle={{ backgroundColor: colors.tooltipBg, border: 'none', borderRadius: '12px', fontSize: '11px' }} />
          <Legend wrapperStyle={{ fontSize: '10px' }} />
          <Line yAxisId="costs" type="monotone" dataKey="costs" stroke="#ef4444" strokeWidth={2} dot connectNulls={false} name={labels.costsLabel} />
          <Line yAxisId="downtime" type="monotone" dataKey="downtime" stroke="#8b5cf6" strokeWidth={2} dot connectNulls={false} name={labels.downtimeLabel} />
        </LineChart>
      </ResponsiveContainer>
    </EvaluationsChartCard>
  );
}

interface EvaluationsReceivablesAgingChartProps {
  data: ReceivablesAgingResult;
  intlLocale: string;
  isDarkMode: boolean;
  labels: ChartLabels & { title: string; question: string; unit: string };
}

export function EvaluationsReceivablesAgingChart({
  data,
  intlLocale,
  isDarkMode,
  labels,
}: EvaluationsReceivablesAgingChartProps) {
  const colors = chartColors(isDarkMode);
  const chartData = data.buckets.map((b) => ({
    name: b.label,
    amount: b.amountMinor / 100,
    count: b.count,
  }));

  return (
    <EvaluationsChartCard
      chartId="eval-receivables-aging"
      title={labels.title}
      periodLabel={data.periodLabel}
      unitLabel={labels.unit}
      question={labels.question}
      hasData={data.hasData}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      tableCaption={labels.tableCaption}
      tableAlternative={
        <EvaluationsChartDataTable
          columns={[
            { key: 'bucket', label: labels.table.bucket },
            { key: 'amount', label: labels.unit, align: 'right' },
            { key: 'count', label: labels.table.count, align: 'right' },
            { key: 'share', label: labels.table.percent, align: 'right' },
          ]}
          rows={data.buckets.map((b) => ({
            bucket: b.label,
            amount: fmtEurMinor(b.amountMinor, intlLocale),
            count: b.count,
            share: b.sharePercent != null ? `${b.sharePercent}%` : '—',
          }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
          <XAxis type="number" stroke={colors.axis} fontSize={10} tickFormatter={(v) => `€${v}`} />
          <YAxis type="category" dataKey="name" stroke={colors.axis} fontSize={9} width={120} tickLine={false} />
          <Tooltip contentStyle={{ backgroundColor: colors.tooltipBg, border: 'none', borderRadius: '12px', fontSize: '11px' }} formatter={(v) => fmtEurMinor(Number(v ?? 0) * 100, intlLocale)} />
          <Bar dataKey="amount" fill="#f59e0b" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </EvaluationsChartCard>
  );
}

interface EvaluationsFleetFailureTrendChartProps {
  data: FleetFailureTrendResult;
  isDarkMode: boolean;
  labels: ChartLabels & { title: string; question: string; maintenance: string; blocked: string; cleaning: string };
}

export function EvaluationsFleetFailureTrendChart({
  data,
  isDarkMode,
  labels,
}: EvaluationsFleetFailureTrendChartProps) {
  const colors = chartColors(isDarkMode);
  const chartData = data.points.map((p) => ({
    name: p.label,
    maintenance: p.maintenanceVehicles,
    blocked: p.blockedVehicles,
    cleaning: p.cleaningVehicles,
    downtime: p.downtimePercent,
  }));

  return (
    <EvaluationsChartCard
      chartId="eval-fleet-failure"
      title={labels.title}
      periodLabel={data.periodLabel}
      question={labels.question}
      hasData={data.hasData}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      tableCaption={labels.tableCaption}
      tableAlternative={
        <EvaluationsChartDataTable
          columns={[
            { key: 'period', label: labels.table.period },
            { key: 'maintenance', label: labels.maintenance, align: 'right' },
            { key: 'blocked', label: labels.blocked, align: 'right' },
            { key: 'cleaning', label: labels.cleaning, align: 'right' },
            { key: 'downtime', label: labels.table.downtimePercent, align: 'right' },
          ]}
          rows={data.points.map((p) => ({
            period: p.label,
            maintenance: p.maintenanceVehicles ?? '—',
            blocked: p.blockedVehicles ?? '—',
            cleaning: p.cleaningVehicles ?? '—',
            downtime: p.downtimePercent != null ? `${p.downtimePercent}%` : '—',
          }))}
        />
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} vertical={false} />
          <XAxis dataKey="name" stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke={colors.axis} fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={{ backgroundColor: colors.tooltipBg, border: 'none', borderRadius: '12px', fontSize: '11px' }} />
          <Legend wrapperStyle={{ fontSize: '10px' }} />
          <Bar dataKey="maintenance" stackId="a" fill="#ef4444" name={labels.maintenance} />
          <Bar dataKey="blocked" stackId="a" fill="#f59e0b" name={labels.blocked} />
          <Bar dataKey="cleaning" stackId="a" fill="#8b5cf6" name={labels.cleaning} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </EvaluationsChartCard>
  );
}

interface EvaluationsDimensionComparisonChartProps {
  data: DimensionComparisonResult;
  intlLocale: string;
  isDarkMode: boolean;
  mode: 'STATION' | 'VEHICLE_CLASS';
  onModeChange: (mode: 'STATION' | 'VEHICLE_CLASS') => void;
  labels: ChartLabels & {
    title: string;
    question: string;
    unit: string;
    station: string;
    vehicleClass: string;
  };
}

export function EvaluationsDimensionComparisonChart({
  data,
  intlLocale,
  isDarkMode,
  mode,
  onModeChange,
  labels,
}: EvaluationsDimensionComparisonChartProps) {
  const colors = chartColors(isDarkMode);
  const isCurrency = data.items[0]?.unit === 'currency_minor';
  const chartData = data.items.map((i) => ({
    name: i.label,
    value: i.value != null ? (isCurrency ? i.value / 100 : i.value) : null,
  }));

  return (
    <EvaluationsChartCard
      chartId="eval-dimension-comparison"
      title={labels.title}
      periodLabel={data.periodLabel}
      unitLabel={isCurrency ? labels.unit : '%'}
      question={labels.question}
      isEstimate={data.isEstimate}
      estimateLabel={labels.estimate}
      hasData={data.hasData}
      emptyTitle={labels.emptyTitle}
      emptyDescription={labels.emptyDescription}
      tableCaption={labels.tableCaption}
      tableAlternative={
        <EvaluationsChartDataTable
          columns={[
            { key: 'label', label: labels.table.dimension },
            { key: 'value', label: isCurrency ? labels.unit : labels.table.percent, align: 'right' },
            { key: 'vehicles', label: labels.table.vehicles, align: 'right' },
            { key: 'delta', label: labels.table.deltaVsOrg, align: 'right' },
          ]}
          rows={data.items.map((i) => ({
            label: i.label,
            value:
              i.value != null
                ? isCurrency
                  ? fmtEurMinor(i.value, intlLocale)
                  : `${i.value}%`
                : '—',
            vehicles: i.vehicleCount ?? '—',
            delta: i.deltaVsOrg != null ? `${i.deltaVsOrg > 0 ? '+' : ''}${i.deltaVsOrg}%` : '—',
          }))}
        />
      }
    >
      <div className="mb-2 flex gap-2" role="tablist" aria-label={labels.table.dimensionFilter}>
        {(['STATION', 'VEHICLE_CLASS'] as const).map((m) => (
          <button
            key={m}
            type="button"
            id={m === 'STATION' ? EVAL_DIM_TAB_STATION_ID : EVAL_DIM_TAB_VEHICLE_CLASS_ID}
            role="tab"
            aria-selected={mode === m}
            onClick={() => onModeChange(m)}
            className={cn(
              'rounded-full px-3 py-2 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
              EVALUATIONS_TOUCH_TARGET_CLASS,
              mode === m
                ? 'bg-foreground text-background'
                : 'bg-muted/50 text-muted-foreground',
            )}
          >
            {m === 'STATION' ? labels.station : labels.vehicleClass}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
          <XAxis
            type="number"
            stroke={colors.axis}
            fontSize={10}
            tickFormatter={(v) => (isCurrency ? `€${v}` : `${v}%`)}
          />
          <YAxis type="category" dataKey="name" stroke={colors.axis} fontSize={9} width={110} tickLine={false} />
          <Tooltip
            contentStyle={{ backgroundColor: colors.tooltipBg, border: 'none', borderRadius: '12px', fontSize: '11px' }}
            formatter={(v) =>
              isCurrency ? fmtEurMinor(Number(v ?? 0) * 100, intlLocale) : `${Number(v ?? 0)}%`
            }
          />
          <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </EvaluationsChartCard>
  );
}
