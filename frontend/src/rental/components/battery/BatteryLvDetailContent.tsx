import { Icon } from '../ui/Icon';
import { BatteryConditionBars, RestingVoltageBadge } from '../BatteryConditionBars';
import { BatteryDataQualityBadge } from '../BatteryDataQualityBadge';
import { useLanguage } from '../../i18n/LanguageContext';
import type { BatteryLvDetailVm } from '../../lib/battery-lv-view-model';
import type { BatteryMeasurementRow } from '../../lib/battery-health-detail-ui';
import {
  BatteryCollapsibleSection,
  BatteryMetricTile,
  BatterySliceQualityRow,
} from './BatteryCollapsibleSection';
import { formatConfidenceLabel, formatMethodLabel, formatVolts, publicationStateI18nKey } from '../../lib/battery-ui-formatters';

export interface BatteryLvDetailContentProps {
  vm: BatteryLvDetailVm;
  measurementRows?: BatteryMeasurementRow[];
  chartSlot?: React.ReactNode;
}

export function BatteryLvDetailContent({ vm, measurementRows = [], chartSlot }: BatteryLvDetailContentProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {vm.aggregateDataQuality && <BatteryDataQualityBadge status={vm.aggregateDataQuality} short={false} />}
        {!vm.unsupported && (
          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider sq-chip-neutral border border-border">
            {t(publicationStateI18nKey(
              vm.estimatedHealth.isCalibrating
                ? 'INITIAL_CALIBRATION'
                : vm.estimatedHealth.isStabilizing
                  ? 'STABILIZING'
                  : 'STABLE',
            ))}
          </span>
        )}
      </div>

      {vm.voltage.isStale && (
        <div className="rounded-lg border sq-tone-watch border-border px-3 py-2 text-[11px] text-[color:var(--status-watch)]">
          {t('health.battery.lv.liveStale')}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <BatteryMetricTile
          label={t('health.battery.lv.currentVoltage')}
          value={formatVolts(vm.voltage.currentV)}
          hint={`${t(vm.voltage.contextKey)}${vm.voltage.ageLabel ? ` · ${vm.voltage.ageLabel}` : ''}`}
          tone="brand"
        />
        <BatteryMetricTile
          label={t('health.battery.lv.restingVoltage')}
          value={vm.resting.valueV != null ? formatVolts(vm.resting.valueV) : '—'}
          hint={
            vm.resting.ageLabel
              ? `${vm.resting.measurementContext ?? t('health.battery.lv.qualifiedRest')} · ${vm.resting.ageLabel}`
              : t('health.battery.lv.restingUnavailable')
          }
        />
        <BatteryMetricTile
          label={t('health.battery.lv.exteriorTemp')}
          value={vm.exteriorAmbient.value}
          hint={vm.exteriorAmbient.hint}
        />
      </div>

      {!vm.unsupported && (
        <div className="rounded-lg px-5 py-4 sq-tone-success border border-border">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
                {vm.estimatedHealth.label}
              </p>
              <BatteryConditionBars status={vm.estimatedHealth.status} bars={vm.estimatedHealth.bars} size="lg" />
            </div>
            <div className="flex flex-col items-end gap-1">
              {vm.estimatedHealth.dataQualityStatus && (
                <BatteryDataQualityBadge status={vm.estimatedHealth.dataQualityStatus} short={false} />
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">{t(vm.estimatedHealth.tooltipKey)}</p>
          {(vm.estimatedHealth.confidence || vm.sliceQualities.estimatedHealth) && (
            <p className="text-[10px] mt-2 text-muted-foreground">
              {t('health.battery.lv.confidence')}: {formatConfidenceLabel(vm.estimatedHealth.confidence)}
            </p>
          )}
        </div>
      )}

      {vm.resting.valueV != null && (
        <div className="rounded-lg bg-muted/50 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
            {t('health.battery.lv.qualifiedRest')}
          </p>
          <RestingVoltageBadge valueV={vm.resting.valueV} status={vm.resting.status} />
          {vm.resting.dataQualityStatus && (
            <div className="mt-2">
              <BatteryDataQualityBadge status={vm.resting.dataQualityStatus} />
            </div>
          )}
        </div>
      )}

      {vm.startBehavior && (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
            {t('health.battery.lv.startBehavior')}
          </p>
          {vm.startBehavior.unsupportedReason ? (
            <p className="text-xs text-muted-foreground">{vm.startBehavior.unsupportedReason}</p>
          ) : vm.startBehavior.available ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-foreground tabular-nums">{vm.startBehavior.valueText ?? '—'}</span>
              {vm.startBehavior.classification && (
                <BatteryDataQualityBadge status={vm.startBehavior.classification === 'PROXY' ? 'PROXY' : 'EXPERIMENTAL'} />
              )}
              {vm.startBehavior.ageLabel && (
                <span className="text-[10px] text-muted-foreground">{vm.startBehavior.ageLabel}</span>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('health.battery.lv.startBehaviorUnavailable')}</p>
          )}
        </div>
      )}

      <BatterySliceQualityRow
        items={[
          { label: t('health.battery.slices.estimatedHealth'), status: vm.sliceQualities.estimatedHealth },
          { label: t('health.battery.slices.restingVoltage'), status: vm.sliceQualities.restingVoltage },
          { label: t('health.battery.slices.crank'), status: vm.sliceQualities.crank },
        ]}
      />

      {chartSlot}

      {measurementRows.length > 0 && (
        <BatteryCollapsibleSection title={t('health.battery.lv.measurements')} defaultOpen={false}>
          <div className="space-y-2">
            {measurementRows.map((row) => (
              <div key={row.id} className="flex items-start justify-between gap-3 text-xs border-b border-border/60 pb-2 last:border-0">
                <div>
                  <p className="font-semibold text-foreground">{row.label}</p>
                  <p className="text-[10px] text-muted-foreground">{row.metaText}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold tabular-nums text-foreground">{row.valueText}</p>
                  <p className="text-[10px] text-muted-foreground">{row.dateText}</p>
                </div>
              </div>
            ))}
          </div>
        </BatteryCollapsibleSection>
      )}

      {(vm.watchpoints.length > 0 || vm.recommendations.length > 0) && (
        <BatteryCollapsibleSection title={t('health.battery.lv.watchpoints')} defaultOpen={false}>
          {vm.watchpoints.map((w) => (
            <p key={w} className="text-xs text-muted-foreground flex gap-2">
              <Icon name="alert-triangle" className="w-3.5 h-3.5 shrink-0 text-[color:var(--status-watch)]" />
              {w}
            </p>
          ))}
          {vm.recommendations.map((r) => (
            <p key={r} className="text-xs text-muted-foreground flex gap-2">
              <Icon name="info" className="w-3.5 h-3.5 shrink-0" />
              {r}
            </p>
          ))}
        </BatteryCollapsibleSection>
      )}

      <BatteryCollapsibleSection title={t('health.battery.technicalDetails')} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
          <div>
            <span className="font-semibold text-foreground">{t('health.battery.lv.runtimeStatus')}</span>
            <p>{vm.runtimeStatus ?? '—'}</p>
          </div>
        </div>
      </BatteryCollapsibleSection>
    </div>
  );
}
