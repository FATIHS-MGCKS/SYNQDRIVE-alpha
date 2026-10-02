import { formatMillivolts } from './types';
import type { RestSessionFeatureInputRetentionPointV1 } from './types';
import { resolveBatteryV2ShadowCopy } from './battery-v2-shadow-inspection.copy';

type Props = {
  points: RestSessionFeatureInputRetentionPointV1[];
};

export function RetentionPointsTable({ points }: Props) {
  if (points.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {resolveBatteryV2ShadowCopy('master.batteryV2Shadow.retentionEmpty')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.retentionCol.index')}</th>
            <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.retentionCol.observation')}</th>
            <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.retentionCol.restAge')}</th>
            <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.retentionCol.voltage')}</th>
            <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.retentionCol.rung')}</th>
            <th className="py-2 pr-2">{resolveBatteryV2ShadowCopy('master.batteryV2Shadow.retentionCol.evidence')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={`${point.observationId}-${index}`} className="border-b border-border/50">
              <td className="py-1.5 pr-2 tabular-nums">{index + 1}</td>
              <td className="py-1.5 pr-2 font-mono">{point.observationId.slice(0, 8)}</td>
              <td className="py-1.5 pr-2 tabular-nums">{point.actualRestAgeMs}</td>
              <td className="py-1.5 pr-2 tabular-nums">{formatMillivolts(point.voltageMv)}</td>
              <td className="py-1.5 pr-2 tabular-nums">{point.nominalRestIntervalIndex ?? '—'}</td>
              <td className="py-1.5 pr-2">{point.evidenceClass}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
