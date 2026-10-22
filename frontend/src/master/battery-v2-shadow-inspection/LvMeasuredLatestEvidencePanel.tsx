import { resolveBatteryV2ShadowCopy } from './battery-v2-shadow-inspection.copy';
import {
  buildLatestMeasuredEvidenceView,
  type EvidenceUsabilityTone,
} from './lv-measured-evidence-display.util';
import type { LvMeasuredIntelligenceV1 } from './lv-measured-intelligence.types';

type Props = {
  data: LvMeasuredIntelligenceV1;
};

function toneClass(tone: EvidenceUsabilityTone): string {
  switch (tone) {
    case 'usable':
      return 'border-emerald-500/40 bg-emerald-500/5';
    case 'limited':
      return 'border-amber-500/40 bg-amber-500/5';
    default:
      return 'border-muted bg-muted/30';
  }
}

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

export function LvMeasuredLatestEvidencePanel({ data }: Props) {
  const view = buildLatestMeasuredEvidenceView(data);
  if (!view || !data.latestMeasured) {
    return (
      <p className="text-sm text-muted-foreground">
        {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.noMeasurements')}
      </p>
    );
  }

  const point = data.latestMeasured;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded-xl border border-border/80 p-3 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.section.measurement')}
        </p>
        <p className="text-2xl font-semibold tabular-nums">{point.voltageV.toFixed(3)} V</p>
        <p className="text-xs text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.measuredAt')}:{' '}
          <span className="text-foreground">{view.measuredAtLabel}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.metric.providerTime')}:{' '}
          {view.providerTimeMissingExplanationKey ? (
            <span className="text-amber-800 dark:text-amber-200">
              {resolveBatteryV2ShadowCopy(view.providerTimeMissingExplanationKey)}
            </span>
          ) : (
            <span className="text-foreground">{view.providerTimeLabel}</span>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-border/80 p-3 space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.section.operational')}
        </p>
        <span className={`inline-block rounded px-2 py-0.5 text-xs ${contextBadgeClass(view.operationalContext)}`}>
          {view.operationalContext}
        </span>
        <p className="text-xs">
          <span className="text-muted-foreground">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.evidenceClass')}:{' '}
          </span>
          <span className="font-mono text-[11px]">{view.evidenceClass}</span>
        </p>
      </div>

      <div className={`rounded-xl border p-3 space-y-2 ${toneClass(view.usabilityTone)}`}>
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.section.quality')}
        </p>
        <p className="font-medium text-sm">{resolveBatteryV2ShadowCopy(view.usabilityLabelKey)}</p>
        <p className="text-xs">{resolveBatteryV2ShadowCopy(view.usabilityExplanationKey)}</p>
        {view.openProviderGaps > 0 ? (
          <p className="text-xs text-amber-800 dark:text-amber-200">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.openGapsDetail', {
              count: view.openProviderGaps,
            })}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl border border-border/80 p-3 space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.section.interpretation')}
        </p>
        <p className="text-xs">{resolveBatteryV2ShadowCopy(view.evidenceClassInterpretationKey)}</p>
        {view.internalInterpretationKey !== 'master.batteryV2Shadow.lvMeasured.interpretation.noExtraFlags' ? (
          <p className="text-xs text-muted-foreground">
            {resolveBatteryV2ShadowCopy(view.internalInterpretationKey, {
              count: view.openProviderGaps,
            })}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-dashed border-border/80 p-3">
          <p className="text-[11px] text-muted-foreground">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.batteryHealth')}
          </p>
          <p className="text-sm font-medium">
            {resolveBatteryV2ShadowCopy(view.batteryHealthAssessmentKey)}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.notHealthAssessment')}
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border/80 p-3">
          <p className="text-[11px] text-muted-foreground">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.evidence.cranking')}
          </p>
          <p className="text-sm font-medium">{resolveBatteryV2ShadowCopy(view.crankingStatusKey)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            {resolveBatteryV2ShadowCopy(view.crankingExplanationKey)}
          </p>
        </div>
      </div>
    </div>
  );
}
