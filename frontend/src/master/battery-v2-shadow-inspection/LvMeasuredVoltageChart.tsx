import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { resolveBatteryV2ShadowCopy } from './battery-v2-shadow-inspection.copy';
import {
  chartPointsWithGapBreaks,
  formatChartTimestamp,
  type LvVoltageChartPoint,
} from './lv-measured-voltage-chart.util';

type XAxisMode = 'time' | 'restHours';

type Props = {
  points: LvVoltageChartPoint[];
  xAxisMode: XAxisMode;
  stroke: string;
  heightClassName?: string;
  emptyMessageKey?: string;
  singlePointMessageKey?: string;
  gapCount?: number;
};

function VoltageTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: LvVoltageChartPoint & { v: number | null } }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload.find((p) => p.payload?.v != null)?.payload;
  if (!row || row.v == null) return null;

  return (
    <div
      className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md max-w-[min(100vw-2rem,18rem)] touch-manipulation"
      role="status"
    >
      <p className="font-semibold tabular-nums text-sm">{row.v.toFixed(3)} V</p>
      <p className="text-muted-foreground mt-0.5">{row.label}</p>
      <p className="mt-1">
        <span className="text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.tooltip.context')}:{' '}
        </span>
        {row.context}
      </p>
      {row.evidenceClass ? (
        <p className="text-[11px] text-muted-foreground mt-0.5 break-all">{row.evidenceClass}</p>
      ) : null}
    </div>
  );
}

export function LvMeasuredVoltageChart({
  points,
  xAxisMode,
  stroke,
  heightClassName = 'h-60 sm:h-64 md:h-72',
  emptyMessageKey = 'master.batteryV2Shadow.lvMeasured.chart.empty',
  singlePointMessageKey = 'master.batteryV2Shadow.lvMeasured.chart.singlePoint',
  gapCount = 0,
}: Props) {
  const measuredPointCount = points.length;
  const chartData = useMemo(() => {
    const withBreaks = chartPointsWithGapBreaks(points);
    if (xAxisMode === 'restHours') {
      return withBreaks.map((p) => ({
        ...p,
        x: p.restHours ?? 0,
      }));
    }
    return withBreaks;
  }, [points, xAxisMode]);

  if (measuredPointCount === 0) {
    return (
      <p className="text-sm text-muted-foreground">{resolveBatteryV2ShadowCopy(emptyMessageKey)}</p>
    );
  }

  const numericV = points.map((p) => p.v);
  const min = Math.min(...numericV);
  const max = Math.max(...numericV);
  const pad = Math.max(0.15, (max - min) * 0.1);
  const yDomain = [min - pad, max + pad] as [number, number];
  const showLine = measuredPointCount > 1;

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden space-y-2">
      {measuredPointCount === 1 ? (
        <p className="text-xs text-muted-foreground">{resolveBatteryV2ShadowCopy(singlePointMessageKey)}</p>
      ) : null}
      {gapCount > 0 ? (
        <p className="text-xs text-amber-800 dark:text-amber-200">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.chart.gapBreaks', {
            count: gapCount,
          })}
        </p>
      ) : null}
      <div className={`w-full min-w-0 ${heightClassName}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
            {xAxisMode === 'time' ? (
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 11 }}
                minTickGap={28}
                tickFormatter={(v) => {
                  const s = formatChartTimestamp(v);
                  const comma = s.indexOf(',');
                  return comma > 0 ? s.slice(0, comma) : s;
                }}
              />
            ) : (
              <XAxis
                dataKey="x"
                type="number"
                tick={{ fontSize: 11 }}
                label={{
                  value: resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.chart.restHoursAxis'),
                  position: 'insideBottom',
                  offset: -2,
                  fontSize: 11,
                }}
              />
            )}
            <YAxis
              domain={yDomain}
              tick={{ fontSize: 11 }}
              width={44}
              tickFormatter={(v) => Number(v).toFixed(1)}
              unit=" V"
            />
            <Tooltip
              content={<VoltageTooltipContent />}
              cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="v"
              stroke={stroke}
              strokeWidth={showLine ? 2 : 0}
              dot={{
                r: measuredPointCount === 1 ? 5 : 3,
                strokeWidth: 2,
                fill: stroke,
              }}
              activeDot={{ r: 6, strokeWidth: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
