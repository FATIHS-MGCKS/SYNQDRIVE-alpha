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
import { MasterPageSection } from '../shell';
import { resolveBatteryV2ShadowCopy } from './battery-v2-shadow-inspection.copy';
import type {
  LvMeasuredIntelligenceV1,
  LvMeasuredRestSessionEpisodeV1,
  LvMeasuredVoltagePointV1,
} from './lv-measured-intelligence.types';
import { formatDurationMs, formatMillivolts, formatSlope } from './types';

type HistoryRangeProps = {
  measuredFrom: string;
  measuredTo: string;
  useDateRange: boolean;
  onMeasuredFromChange: (value: string) => void;
  onMeasuredToChange: (value: string) => void;
  onApplyDateRange: () => void;
  onUseRecentMode: () => void;
};

type Props = {
  data: LvMeasuredIntelligenceV1;
  selectedRestSessionId: string;
  onSelectRestSessionId: (restSessionId: string) => void;
  historyRange: HistoryRangeProps;
};

function contextBadgeClass(ctx: string): string {
  switch (ctx) {
    case 'REST':
      return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200';
    case 'CHARGING':
      return 'bg-sky-500/15 text-sky-900 dark:text-sky-200';
    case 'DRIVING':
      return 'bg-amber-500/15 text-amber-900 dark:text-amber-200';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

function chartPoints(points: LvMeasuredVoltagePointV1[]) {
  return [...points]
    .sort((a, b) => new Date(a.voltageObservedAt).getTime() - new Date(b.voltageObservedAt).getTime())
    .map((p) => ({
      t: new Date(p.voltageObservedAt).getTime(),
      label: new Date(p.voltageObservedAt).toLocaleString(),
      v: p.voltageV,
      context: p.operationalContext,
      ladder: p.nominalLadderLabel,
      restHours: p.actualRestAgeHours,
    }));
}

function slopePresentation(ep: LvMeasuredRestSessionEpisodeV1) {
  const df = ep.derivedFeatures;
  if (!df) return { value: '—', limited: false, codes: [] as string[] };
  return {
    value: formatSlope(df.robustRestSlopeMvPerHour),
    limited: df.slopeInterpretability === 'CONTEXT_LIMITED',
    codes: df.slopeLimitationCodes,
  };
}

export function LvMeasuredIntelligenceSection({
  data,
  selectedRestSessionId,
  onSelectRestSessionId,
  historyRange,
}: Props) {
  const vehicleTimeline = useMemo(() => chartPoints(data.historicalMeasured), [data.historicalMeasured]);

  const selectedEpisode = useMemo(
    () => data.restSessionEpisodes.find((e) => e.restSessionId === selectedRestSessionId) ?? null,
    [data.restSessionEpisodes, selectedRestSessionId],
  );

  const sessionTimeline = useMemo(
    () => (selectedEpisode ? chartPoints(selectedEpisode.measuredPoints) : []),
    [selectedEpisode],
  );

  const selectedSlope = selectedEpisode ? slopePresentation(selectedEpisode) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-xs space-y-1">
        <p className="font-semibold text-sm">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.boundaryTitle')}
        </p>
        <p>{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.boundaryBody')}</p>
        <p className="text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.provenanceFooter', {
            deduplicationPolicy: data.provenance.deduplicationPolicy,
          })}
        </p>
      </div>

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyRangeTitle')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="text-xs space-y-1 flex-1 min-w-[10rem]">
            <span className="text-muted-foreground">
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyFrom')}
            </span>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              value={historyRange.measuredFrom}
              onChange={(e) => historyRange.onMeasuredFromChange(e.target.value)}
              disabled={!historyRange.useDateRange}
            />
          </label>
          <label className="text-xs space-y-1 flex-1 min-w-[10rem]">
            <span className="text-muted-foreground">
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyTo')}
            </span>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
              value={historyRange.measuredTo}
              onChange={(e) => historyRange.onMeasuredToChange(e.target.value)}
              disabled={!historyRange.useDateRange}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/60"
              onClick={historyRange.onApplyDateRange}
            >
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyApply')}
            </button>
            <button
              type="button"
              className="rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40"
              onClick={historyRange.onUseRecentMode}
            >
              Recent limit
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {data.provenance.historicalQueryMode === 'DATE_RANGE_ASC'
            ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyModeRange')
            : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyModeRecent')}
        </p>
      </MasterPageSection>

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.latestTitle')}>
        {data.latestMeasured ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">
                {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.measuredV')}
              </p>
              <p className="font-medium tabular-nums">{data.latestMeasured.voltageV.toFixed(3)} V</p>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">
                {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.providerTime')}
              </p>
              <p className="font-medium text-xs">
                {data.latestMeasured.providerObservationAt
                  ? new Date(data.latestMeasured.providerObservationAt).toLocaleString()
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">
                {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.context')}
              </p>
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs ${contextBadgeClass(data.latestMeasured.operationalContext)}`}
              >
                {data.latestMeasured.operationalContext}
              </span>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">
                {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.openProviderGaps')}
              </p>
              <p className="font-medium tabular-nums">{data.provenance.openProviderObservabilityGapCount}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.noMeasurements')}
          </p>
        )}
      </MasterPageSection>

      {vehicleTimeline.length > 0 && (
        <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.vehicleTimelineTitle')}>
          <div className="h-56 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={vehicleTimeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => new Date(v).toLocaleDateString()}
                  tick={{ fontSize: 10 }}
                />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} unit=" V" />
                <Tooltip
                  labelFormatter={(_, payload) =>
                    payload?.[0]?.payload?.label ? String(payload[0].payload.label) : ''
                  }
                  formatter={(value) => [
                    `${Number(value ?? 0).toFixed(3)} V`,
                    resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.tooltip.measuredSeries'),
                  ]}
                />
                <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          {data.provenance.historicalObservationsTruncated && (
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.truncatedHistory')}
            </p>
          )}
        </MasterPageSection>
      )}

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.episodeCompareTitle')}>
        <div className="space-y-2 md:hidden">
          {data.restSessionEpisodes.map((ep) => {
            const slope = slopePresentation(ep);
            const selected = ep.restSessionId === selectedRestSessionId;
            return (
              <button
                key={ep.restSessionId}
                type="button"
                onClick={() => onSelectRestSessionId(ep.restSessionId)}
                className={`w-full text-left rounded-xl border p-3 text-xs space-y-1.5 transition-colors ${
                  selected ? 'border-primary bg-muted/50' : 'border-border/70 hover:bg-muted/30'
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">{new Date(ep.openedAt).toLocaleString()}</span>
                  <span className="text-muted-foreground">{ep.sessionStatus}</span>
                </div>
                <div className="text-muted-foreground">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.table.measuredPts')}:{' '}
                  {ep.measuredPoints.length} · C3 span:{' '}
                  {formatDurationMs(ep.derivedFeatures?.observationSpanMs)}
                </div>
                <div>
                  DERIVED slope: <span className="font-medium tabular-nums">{slope.value}</span>
                  {slope.limited ? (
                    <span className="block text-amber-800 dark:text-amber-200 mt-0.5">
                      {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.slope.contextLimited')}
                    </span>
                  ) : null}
                </div>
                <span className="text-[11px] text-primary">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.selectEpisode')}</span>
              </button>
            );
          })}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.table.opened')}
                </th>
                <th className="py-2 pr-2">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.table.status')}
                </th>
                <th className="py-2 pr-2">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.table.measuredPts')}
                </th>
                <th className="py-2 pr-2">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.observationSpan')}
                </th>
                <th className="py-2 pr-2">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.derivedSlope')}
                </th>
                <th className="py-2 pr-2" />
              </tr>
            </thead>
            <tbody>
              {data.restSessionEpisodes.map((ep) => {
                const slope = slopePresentation(ep);
                return (
                  <tr
                    key={ep.restSessionId}
                    className={`border-b border-border/50 ${ep.restSessionId === selectedRestSessionId ? 'bg-muted/40' : ''}`}
                  >
                    <td className="py-1.5 pr-2">{new Date(ep.openedAt).toLocaleString()}</td>
                    <td className="py-1.5 pr-2">{ep.sessionStatus}</td>
                    <td className="py-1.5 pr-2 tabular-nums">{ep.measuredPoints.length}</td>
                    <td className="py-1.5 pr-2">{formatDurationMs(ep.derivedFeatures?.observationSpanMs)}</td>
                    <td className="py-1.5 pr-2">
                      <span className="tabular-nums">{slope.value}</span>
                      {slope.limited ? (
                        <span className="block text-amber-800 dark:text-amber-200 text-[10px]">CONTEXT_LIMITED</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-2">
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => onSelectRestSessionId(ep.restSessionId)}
                      >
                        {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.selectEpisode')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </MasterPageSection>

      {selectedEpisode && (
        <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.sessionTitle')}>
          {selectedEpisode.contextLimitedReason && (
            <p className="text-xs text-amber-800 dark:text-amber-200 mb-2">
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.contextLimitedPrefix')}{' '}
              {selectedEpisode.contextLimitedReason}
            </p>
          )}
          {selectedEpisode.derivedFeatures && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-sm">
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-[11px] text-muted-foreground">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.derivedMedian')}
                </p>
                <p className="font-medium">{formatMillivolts(selectedEpisode.derivedFeatures.medianRestVoltageMv)}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5 col-span-2 md:col-span-1">
                <p className="text-[11px] text-muted-foreground">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.derivedSlope')}
                </p>
                <p className="font-medium tabular-nums">{selectedSlope?.value}</p>
                <p className="text-[10px] mt-1 text-muted-foreground">
                  {selectedSlope?.limited
                    ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.slope.contextLimited')
                    : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.slope.interpretable')}
                </p>
                {selectedSlope?.codes.length ? (
                  <p className="text-[10px] text-amber-800 dark:text-amber-200 mt-0.5 break-all">
                    {selectedSlope.codes.join(' · ')}
                  </p>
                ) : null}
              </div>
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-[11px] text-muted-foreground">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.observationSpan')}
                </p>
                <p className="font-medium">{formatDurationMs(selectedEpisode.derivedFeatures.observationSpanMs)}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-[11px] text-muted-foreground">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.validRestPoints')}
                </p>
                <p className="font-medium tabular-nums">{selectedEpisode.derivedFeatures.numberOfValidRestPoints ?? '—'}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-[11px] text-muted-foreground">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.minMax')}
                </p>
                <p className="font-medium text-xs">
                  {formatMillivolts(selectedEpisode.derivedFeatures.minimumRestVoltageMv)} ·{' '}
                  {formatMillivolts(selectedEpisode.derivedFeatures.maximumRestVoltageMv)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-[11px] text-muted-foreground">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.c3RetentionPts')}
                </p>
                <p className="font-medium tabular-nums">{selectedEpisode.derivedFeatures.retentionPointCount}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5 col-span-2">
                <p className="text-[11px] text-muted-foreground">
                  {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.endReason')}
                </p>
                <p className="font-medium text-xs">{selectedEpisode.endReason ?? '—'}</p>
              </div>
            </div>
          )}
          {sessionTimeline.length > 0 ? (
            <div className="h-48 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sessionTimeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="restHours"
                    tick={{ fontSize: 10 }}
                    label={{
                      value: resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.chart.restHoursAxis'),
                      position: 'insideBottom',
                      offset: -2,
                      fontSize: 10,
                    }}
                  />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value) => [
                      `${Number(value ?? 0).toFixed(3)} V`,
                      resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.tooltip.measuredSeries'),
                    ]}
                    labelFormatter={(_, items) => {
                      const row = items?.[0]?.payload;
                      if (!row) return '';
                      return `Rest ${row.restHours?.toFixed?.(2) ?? '?'} h · ${row.ladder ?? '—'} · ${row.context}`;
                    }}
                  />
                  <Line type="monotone" dataKey="v" stroke="#10b981" dot={{ r: 3 }} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.noSessionPoints')}
            </p>
          )}
        </MasterPageSection>
      )}

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.d4Title')}>
        <p className="text-xs text-muted-foreground mb-2">
          {data.longitudinalD4.epistemicBand}: {data.longitudinalD4.note}
          {data.longitudinalD4.sourceEvidenceAckCountOnLatest != null
            ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.d4AckCount', {
                count: data.longitudinalD4.sourceEvidenceAckCountOnLatest,
              })
            : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.d4AckUnavailable')}
        </p>
      </MasterPageSection>
    </div>
  );
}
