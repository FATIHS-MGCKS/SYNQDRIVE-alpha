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
import type { LvMeasuredIntelligenceV1, LvMeasuredVoltagePointV1 } from './lv-measured-intelligence.types';
import { formatMillivolts, formatSlope } from './types';

type Props = {
  data: LvMeasuredIntelligenceV1;
  selectedRestSessionId: string;
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

export function LvMeasuredIntelligenceSection({ data, selectedRestSessionId }: Props) {
  const vehicleTimeline = useMemo(() => chartPoints(data.historicalMeasured), [data.historicalMeasured]);

  const selectedEpisode = useMemo(
    () => data.restSessionEpisodes.find((e) => e.restSessionId === selectedRestSessionId) ?? null,
    [data.restSessionEpisodes, selectedRestSessionId],
  );

  const sessionTimeline = useMemo(
    () => (selectedEpisode ? chartPoints(selectedEpisode.measuredPoints) : []),
    [selectedEpisode],
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3 text-xs space-y-1">
        <p className="font-semibold text-sm">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.boundaryTitle')}
        </p>
        <p>{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.boundaryBody')}</p>
        <p className="text-muted-foreground">
          NOT_ASSESSED · publication OFF · E3 inactive · F6 OFF · dedup: {data.provenance.deduplicationPolicy}
        </p>
      </div>

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.latestTitle')}>
        {data.latestMeasured ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">MEASURED V</p>
              <p className="font-medium tabular-nums">{data.latestMeasured.voltageV.toFixed(3)} V</p>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">Provider time</p>
              <p className="font-medium text-xs">
                {data.latestMeasured.providerObservationAt
                  ? new Date(data.latestMeasured.providerObservationAt).toLocaleString()
                  : '—'}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">Context</p>
              <span className={`inline-block rounded px-2 py-0.5 text-xs ${contextBadgeClass(data.latestMeasured.operationalContext)}`}>
                {data.latestMeasured.operationalContext}
              </span>
            </div>
            <div className="rounded-lg border border-border/60 p-2.5">
              <p className="text-[11px] text-muted-foreground">Open provider gaps</p>
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
          <div className="h-56 w-full">
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
                  formatter={(value: number) => [`${value.toFixed(3)} V`, 'MEASURED']}
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

      {selectedEpisode && (
        <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.sessionTitle')}>
          {selectedEpisode.contextLimitedReason && (
            <p className="text-xs text-amber-800 dark:text-amber-200 mb-2">
              CONTEXT_LIMITED: {selectedEpisode.contextLimitedReason}
            </p>
          )}
          {selectedEpisode.derivedFeatures && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-sm">
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-[11px] text-muted-foreground">DERIVED median</p>
                <p className="font-medium">{formatMillivolts(selectedEpisode.derivedFeatures.medianRestVoltageMv)}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-[11px] text-muted-foreground">DERIVED slope</p>
                <p className="font-medium">{formatSlope(selectedEpisode.derivedFeatures.robustRestSlopeMvPerHour)}</p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-[11px] text-muted-foreground">Min / max</p>
                <p className="font-medium text-xs">
                  {formatMillivolts(selectedEpisode.derivedFeatures.minimumRestVoltageMv)} ·{' '}
                  {formatMillivolts(selectedEpisode.derivedFeatures.maximumRestVoltageMv)}
                </p>
              </div>
              <div className="rounded-lg border border-border/60 p-2.5">
                <p className="text-[11px] text-muted-foreground">C3 retention pts</p>
                <p className="font-medium tabular-nums">{selectedEpisode.derivedFeatures.retentionPointCount}</p>
              </div>
            </div>
          )}
          {sessionTimeline.length > 0 ? (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sessionTimeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                  <XAxis
                    dataKey="restHours"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Rest hours', position: 'insideBottom', offset: -2, fontSize: 10 }}
                  />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(3)} V`, 'MEASURED']}
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

      <MasterPageSection title={resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.episodeCompareTitle')}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-2">Opened</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">MEASURED pts</th>
                <th className="py-2 pr-2">DERIVED median</th>
                <th className="py-2 pr-2">DERIVED slope</th>
              </tr>
            </thead>
            <tbody>
              {data.restSessionEpisodes.map((ep) => (
                <tr
                  key={ep.restSessionId}
                  className={`border-b border-border/50 ${ep.restSessionId === selectedRestSessionId ? 'bg-muted/40' : ''}`}
                >
                  <td className="py-1.5 pr-2">{new Date(ep.openedAt).toLocaleString()}</td>
                  <td className="py-1.5 pr-2">{ep.sessionStatus}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{ep.measuredPoints.length}</td>
                  <td className="py-1.5 pr-2">{formatMillivolts(ep.derivedFeatures?.medianRestVoltageMv)}</td>
                  <td className="py-1.5 pr-2">{formatSlope(ep.derivedFeatures?.robustRestSlopeMvPerHour)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MasterPageSection>
    </div>
  );
}
