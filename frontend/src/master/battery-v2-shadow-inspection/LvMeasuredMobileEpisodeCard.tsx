import { resolveBatteryV2ShadowCopy } from './battery-v2-shadow-inspection.copy';
import {
  buildEpisodeEvaluabilityView,
  type EvidenceUsabilityTone,
} from './lv-measured-evidence-display.util';
import type { LvMeasuredRestSessionEpisodeV1 } from './lv-measured-intelligence.types';
import { formatDurationMs, formatSlope } from './types';

type Props = {
  episode: LvMeasuredRestSessionEpisodeV1;
  selected: boolean;
  onSelect: () => void;
};

function evalToneClass(tone: EvidenceUsabilityTone): string {
  switch (tone) {
    case 'usable':
      return 'text-emerald-800 dark:text-emerald-200';
    case 'limited':
      return 'text-amber-800 dark:text-amber-200';
    default:
      return 'text-muted-foreground';
  }
}

export function LvMeasuredMobileEpisodeCard({ episode, selected, onSelect }: Props) {
  const evalView = buildEpisodeEvaluabilityView(episode);
  const df = episode.derivedFeatures;
  const slopeValue =
    df?.robustRestSlopeMvPerHour != null
      ? formatSlope(df.robustRestSlopeMvPerHour)
      : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.missing.slopeNotComputed');

  return (
    <div
      className={`rounded-xl border p-3 text-xs space-y-2 transition-colors ${
        selected ? 'border-primary bg-muted/50' : 'border-border/70'
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left space-y-2">
        <p className="font-medium text-sm">{new Date(evalView.openedAtIso).toLocaleString()}</p>
        <p className="text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.episode.mobile.measurementCount', {
            count: evalView.measurementCount,
          })}
        </p>
        <p className={`font-medium ${evalToneClass(evalView.evaluabilityTone)}`}>
          {resolveBatteryV2ShadowCopy(evalView.evaluabilityLabelKey)}
        </p>
        <p className="text-muted-foreground leading-relaxed">
          {resolveBatteryV2ShadowCopy(evalView.evaluabilityExplanationKey)}
        </p>
        <span className="text-[11px] text-primary inline-block">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.selectEpisode')}
        </span>
      </button>

      <details className="rounded-lg border border-border/60 bg-background/50 px-2 py-1.5">
        <summary className="cursor-pointer text-[11px] text-muted-foreground select-none">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.episode.mobile.technicalDetails')}
        </summary>
        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground break-words">
          <p>
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.table.status')}: {episode.sessionStatus}
          </p>
          <p>
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.mobileC3Span')}:{' '}
            {df?.observationSpanMs != null
              ? formatDurationMs(df.observationSpanMs)
              : resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.missing.observationSpan')}
          </p>
          <p>
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.mobileDerivedSlope')}{' '}
            <span className="text-foreground tabular-nums">{slopeValue}</span>
          </p>
          {df?.slopeInterpretability === 'CONTEXT_LIMITED' ? (
            <p className="text-amber-800 dark:text-amber-200">
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.slope.contextLimited')}
            </p>
          ) : null}
          {df?.slopeLimitationCodes?.length ? (
            <p className="font-mono text-[10px]">{df.slopeLimitationCodes.join(' · ')}</p>
          ) : null}
          {episode.contextLimitedReason ? (
            <p>
              {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.contextLimitedPrefix')}{' '}
              {episode.contextLimitedReason}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
