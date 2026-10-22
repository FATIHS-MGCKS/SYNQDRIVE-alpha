import { useMemo } from 'react';
import { MasterPageSection } from '../shell';
import { resolveBatteryV2ShadowCopy } from './battery-v2-shadow-inspection.copy';
import { LvMeasuredLatestEvidencePanel } from './LvMeasuredLatestEvidencePanel';
import { LvMeasuredMobileEpisodeCard } from './LvMeasuredMobileEpisodeCard';
import { LvMeasuredVoltageChart } from './LvMeasuredVoltageChart';
import {
  countMeasurementGaps,
  formatChartTimestamp,
  mapMeasuredPointsToChartPoints,
} from './lv-measured-voltage-chart.util';
import type {
  LvMeasuredIntelligenceV1,
  LvMeasuredRestSessionEpisodeV1,
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
  const vehicleTimeline = useMemo(
    () => mapMeasuredPointsToChartPoints(data.historicalMeasured),
    [data.historicalMeasured],
  );
  const vehicleGapCount = useMemo(() => countMeasurementGaps(vehicleTimeline), [vehicleTimeline]);

  const selectedEpisode = useMemo(
    () => data.restSessionEpisodes.find((e) => e.restSessionId === selectedRestSessionId) ?? null,
    [data.restSessionEpisodes, selectedRestSessionId],
  );

  const sessionTimeline = useMemo(
    () => (selectedEpisode ? mapMeasuredPointsToChartPoints(selectedEpisode.measuredPoints) : []),
    [selectedEpisode],
  );
  const sessionGapCount = useMemo(() => countMeasurementGaps(sessionTimeline), [sessionTimeline]);

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
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyRecentLimit')}
            </button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {data.provenance.historicalQueryMode === 'DATE_RANGE_ASC'
            ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyModeRange')
            : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyModeRecent')}
        </p>
        {vehicleTimeline.length > 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.historyWindowLabel', {
              from: formatChartTimestamp(vehicleTimeline[0].t),
              to: formatChartTimestamp(vehicleTimeline[vehicleTimeline.length - 1].t),
              count: vehicleTimeline.length,
            })}
          </p>
        ) : null}
      </MasterPageSection>

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.latestTitle')}>
        <LvMeasuredLatestEvidencePanel data={data} />
      </MasterPageSection>

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.vehicleTimelineTitle')}>
        <LvMeasuredVoltageChart
          points={vehicleTimeline}
          xAxisMode="time"
          stroke="hsl(var(--primary))"
          gapCount={vehicleGapCount}
        />
        {data.provenance.historicalObservationsTruncated ? (
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
            {data.provenance.historicalQueryMode === 'DATE_RANGE_ASC'
              ? resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.truncatedHistoryRange')
              : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.truncatedHistory')}
          </p>
        ) : null}
      </MasterPageSection>

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.episodeCompareTitle')}>
        <div className="space-y-2 md:hidden">
          {data.restSessionEpisodes.map((ep) => (
            <LvMeasuredMobileEpisodeCard
              key={ep.restSessionId}
              episode={ep}
              selected={ep.restSessionId === selectedRestSessionId}
              onSelect={() => onSelectRestSessionId(ep.restSessionId)}
            />
          ))}
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
                        <span className="block text-amber-800 dark:text-amber-200 text-[10px]">
                          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.slope.contextLimitedBadge')}
                        </span>
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
                <p className="font-medium tabular-nums text-xs">
                  {selectedEpisode.derivedFeatures.numberOfValidRestPoints != null
                    ? selectedEpisode.derivedFeatures.numberOfValidRestPoints
                    : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.missing.validRestPoints')}
                </p>
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
                <p className="font-medium text-xs">
                  {selectedEpisode.endReason ??
                    resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.missing.endReason')}
                </p>
              </div>
            </div>
          )}
          <LvMeasuredVoltageChart
            points={sessionTimeline}
            xAxisMode="restHours"
            stroke="#10b981"
            heightClassName="h-52 sm:h-56 md:h-64"
            emptyMessageKey="master.batteryV2Shadow.lvMeasured.noSessionPoints"
            gapCount={sessionGapCount}
          />
        </MasterPageSection>
      )}

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.d4Title')}>
        <p className="text-xs text-muted-foreground mb-2">
          {data.longitudinalD4.latestRevisionId
            ? `${data.longitudinalD4.epistemicBand}: ${data.longitudinalD4.note}`
            : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.missing.d4Revision')}
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
