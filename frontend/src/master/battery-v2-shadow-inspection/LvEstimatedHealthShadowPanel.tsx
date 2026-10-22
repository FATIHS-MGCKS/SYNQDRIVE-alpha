import { resolveBatteryV2ShadowCopy } from './battery-v2-shadow-inspection.copy';
import type { LvEstimatedBatteryHealthShadowAdminV1 } from './lv-estimated-health-shadow.types';

type Props = {
  data: LvEstimatedBatteryHealthShadowAdminV1 | null;
  loading: boolean;
};

export function LvEstimatedHealthShadowPanel({ data, loading }: Props) {
  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">
        {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.loading')}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="text-sm text-muted-foreground">
        {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.unavailable')}
      </p>
    );
  }

  const a = data.assessment;
  const sel = data.dataSelection;

  return (
    <div className="space-y-3 text-sm rounded-xl border border-violet-500/30 bg-violet-500/5 p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.title')}
      </p>
      <p className="text-xs text-muted-foreground">
        {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.boundaryNote')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div>
          <p className="text-[11px] text-muted-foreground">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.status')}
          </p>
          <p className="text-lg font-semibold">{a.estimatedHealthStatus}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.confidence')}
          </p>
          <p className="font-medium">{a.estimateConfidence}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.eligibility')}
          </p>
          <p className="font-mono text-[11px]">{a.assessmentEligibility}</p>
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">
            {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.episodes')}
          </p>
          <p className="font-medium tabular-nums">{a.decisionTrace.qualifiedEpisodeCount}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.dataSelection', {
          raw: sel.rawVoltageRowCount,
          eligible: sel.eligibleRestObservationCount,
          truncated: sel.historicalObservationsTruncated ? 'yes' : 'no',
        })}
      </p>
      <p className="text-xs">
        <span className="text-muted-foreground">
          {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.lvMeasured.n16Shadow.rule')}:{' '}
        </span>
        <span className="font-mono text-[11px]">{a.decisionTrace.finalRuleId ?? '—'}</span>
      </p>
      <p className="text-xs text-muted-foreground">
        SOH: {a.measuredSOH} · load: {a.decisionTrace.loadSignal} · trend:{' '}
        {a.decisionTrace.longitudinalTrend}
      </p>
      {a.reasonCodes.length > 0 ? (
        <ul className="text-[11px] font-mono text-muted-foreground list-disc pl-4 max-h-24 overflow-y-auto">
          {a.reasonCodes.slice(0, 8).map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
