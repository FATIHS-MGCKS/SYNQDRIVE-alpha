import { Icon } from '../ui/Icon';
import { BatteryDataQualityBadge } from '../BatteryDataQualityBadge';
import { useLanguage } from '../../i18n/LanguageContext';
import type { BatteryHvDetailVm } from '../../lib/battery-hv-view-model';
import {
  BatteryCollapsibleSection,
  BatteryMetricTile,
  BatterySliceQualityRow,
} from './BatteryCollapsibleSection';
import {
  formatConfidenceLabel,
  formatKwh,
  formatMethodLabel,
  formatPercent,
  publicationStateI18nKey,
} from '../../lib/battery-ui-formatters';

export interface BatteryHvDetailContentProps {
  vm: BatteryHvDetailVm;
  trendChartSlot?: React.ReactNode;
}

export function BatteryHvDetailContent({ vm, trendChartSlot }: BatteryHvDetailContentProps) {
  const { t } = useLanguage();
  const { soh, live, capacity, providerSoh } = vm;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider sq-chip-neutral border border-border">
          {t(publicationStateI18nKey(vm.publicationState))}
        </span>
        {soh.dataQualityStatus && <BatteryDataQualityBadge status={soh.dataQualityStatus} short={false} />}
      </div>

      <div className={`rounded-lg p-5 bg-muted`}>
        <h3 className="text-sm font-semibold text-foreground mb-3">{t('health.battery.hv.healthTitle')}</h3>
        {vm.isCalibrating ? (
          <p className="text-sm text-[color:var(--status-info)]">{t('health.battery.hv.calibratingHint')}</p>
        ) : soh.showPrimarySoh ? (
          <div className="text-center">
            <p className="text-3xl font-black text-foreground tabular-nums">
              {soh.prefixApproximate ? '~' : ''}
              {soh.primaryValue}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t(soh.primaryLabelKey)}</p>
            {soh.interpretationDescription && (
              <p className="text-xs text-muted-foreground mt-2">{soh.interpretationDescription}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('health.battery.hv.sohUnavailableHint')}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
          {soh.method && (
            <span>
              {t('health.battery.hv.method')}: <strong className="text-foreground">{formatMethodLabel(soh.method)}</strong>
            </span>
          )}
          {soh.confidence && (
            <span>
              {t('health.battery.lv.confidence')}: <strong className="text-foreground">{formatConfidenceLabel(soh.confidence)}</strong>
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BatteryMetricTile label={t('health.battery.hv.soc')} value={formatPercent(live.socPercent)} />
        <BatteryMetricTile label={t('health.battery.hv.energy')} value={formatKwh(live.currentEnergyKwh)} />
        <BatteryMetricTile
          label={t('health.battery.hv.chargingState')}
          value={t(live.chargingStateKey)}
          hint={live.chargingPowerKw != null ? `${live.chargingPowerKw.toFixed(1)} kW` : live.observedAtLabel}
        />
        <BatteryMetricTile
          label={t('health.battery.hv.range')}
          value={live.rangeKm != null ? `${Math.round(live.rangeKm)} km` : '—'}
        />
      </div>

      {providerSoh.show && (
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
            {t('health.battery.hv.providerSoh')}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg font-bold tabular-nums text-foreground">{providerSoh.value}</span>
            {providerSoh.dataQualityStatus && (
              <BatteryDataQualityBadge status={providerSoh.dataQualityStatus} />
            )}
            {providerSoh.observedAtLabel && (
              <span className="text-[10px] text-muted-foreground">{providerSoh.observedAtLabel}</span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg p-5 bg-muted">
        <h3 className="text-sm font-semibold mb-3 text-foreground">{t('health.battery.hv.capacityTitle')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground">
              {t('health.battery.hv.referenceCapacity')}
            </p>
            <p className="text-lg font-bold text-foreground tabular-nums">{capacity.referenceCapacityText}</p>
            {capacity.referenceVerificationKey && (
              <p className="text-[10px] text-muted-foreground mt-1">{t(capacity.referenceVerificationKey)}</p>
            )}
            {capacity.referenceSource && (
              <p className="text-[10px] text-muted-foreground">{capacity.referenceSource}</p>
            )}
          </div>
          {capacity.showUsableCapacity ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground">
                {t('health.battery.hv.usableCapacity')}
              </p>
              <p className="text-lg font-bold text-foreground tabular-nums">{capacity.usableCapacityText}</p>
              {capacity.usableCapacityHintKey && (
                <p className="text-[10px] text-muted-foreground mt-1">{t(capacity.usableCapacityHintKey)}</p>
              )}
            </div>
          ) : capacity.legacyUnverified ? (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground">
                {t('health.battery.hv.usableCapacity')}
              </p>
              <p className="text-xs text-muted-foreground">{t('health.battery.hv.usableCapacityGated')}</p>
              <BatteryDataQualityBadge status="LEGACY_UNVERIFIED" className="mt-1" />
            </div>
          ) : null}
        </div>
      </div>

      <BatterySliceQualityRow
        items={[
          { label: t('health.battery.slices.hvSoh'), status: vm.sliceQualities.hvSoh },
          { label: t('health.battery.slices.hvCapacity'), status: vm.sliceQualities.hvLegacyCapacity },
        ]}
      />

      <div className="rounded-lg p-5 bg-muted">
        <h3 className="text-sm font-semibold mb-3 text-foreground">{t('health.battery.hv.sessionsTitle')}</h3>
        {vm.sessions.length > 0 ? (
          <div className="space-y-3">
            {vm.sessions.map((session) => (
              <div key={session.id} className="rounded-xl p-3 bg-background border border-border">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon name="battery-charging" className="w-3.5 h-3.5 text-[color:var(--status-positive)] shrink-0" />
                    <span className="text-xs font-semibold text-foreground truncate">{session.timeRange}</span>
                    {session.isOngoing && (
                      <span className="text-[9px] font-bold uppercase sq-chip-success">{t('health.battery.hv.sessionOngoing')}</span>
                    )}
                  </div>
                  {session.socRange && (
                    <span className="text-xs font-bold text-[color:var(--status-positive)] tabular-nums shrink-0">
                      {session.socRange}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] text-muted-foreground">
                  {session.energyKwh && <div><p>{t('health.battery.hv.sessionEnergy')}</p><p className="font-semibold text-foreground">{session.energyKwh}</p></div>}
                  {session.powerKw && <div><p>{t('health.battery.hv.sessionPower')}</p><p className="font-semibold text-foreground">{session.powerKw}</p></div>}
                  {session.durationMin && <div><p>{t('health.battery.hv.sessionDuration')}</p><p className="font-semibold text-foreground">{session.durationMin}</p></div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('health.battery.hv.noSessions')}</p>
        )}
      </div>

      {trendChartSlot}

      <BatteryCollapsibleSection title={t('health.battery.technicalDetails')} defaultOpen={false}>
        <div className="text-[11px] text-muted-foreground space-y-1">
          <p>
            <span className="font-semibold text-foreground">{t('health.battery.hv.snapshots')}: </span>
            {vm.snapshotCount}
          </p>
          {soh.sohSource && (
            <p>
              <span className="font-semibold text-foreground">{t('health.battery.hv.sohSource')}: </span>
              {soh.sohSource}
            </p>
          )}
        </div>
      </BatteryCollapsibleSection>
    </div>
  );
}
