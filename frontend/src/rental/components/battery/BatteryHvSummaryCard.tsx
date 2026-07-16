import { Icon } from '../ui/Icon';
import { BatteryDataQualityBadge } from '../BatteryDataQualityBadge';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { BatteryHvSummaryVm } from '../../lib/battery-hv-view-model';
import { formatKwh, formatPercent, publicationStateI18nKey } from '../../lib/battery-ui-formatters';

export interface BatteryHvSummaryCardProps {
  vm: BatteryHvSummaryVm;
  onOpenDetail?: () => void;
  cardClass: string;
}

const HV_STATUS_BAR: Record<string, string> = {
  GOOD: 'bg-green-500',
  WATCH: 'bg-amber-500',
  WARNING: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
  UNKNOWN: 'bg-gray-400',
};

export function BatteryHvSummaryCard({ vm, onOpenDetail, cardClass }: BatteryHvSummaryCardProps) {
  const { t } = useLanguage();
  const { soh, live } = vm;
  const barColor = HV_STATUS_BAR[soh.healthStatus] ?? HV_STATUS_BAR.UNKNOWN;

  return (
    <div
      onClick={onOpenDetail}
      className={`${cardClass} order-2 cursor-pointer transition-all duration-200 hover:-translate-y-0.5`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">{t('health.battery.hv.title')}</h3>
          {soh.dataQualityStatus && <BatteryDataQualityBadge status={soh.dataQualityStatus} />}
        </div>
        <div className="flex items-center gap-1">
          <Icon name="zap" className="w-3.5 h-3.5 text-[color:var(--status-positive)]" />
          {onOpenDetail && <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      <div className="flex-1 flex flex-col justify-center py-2">
        {vm.isCalibrating ? (
          <>
            <p className="text-sm font-semibold text-[color:var(--status-info)]">
              {t(publicationStateI18nKey('INITIAL_CALIBRATION') as TranslationKey)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">{t('health.battery.hv.calibratingHint')}</p>
          </>
        ) : soh.showPrimarySoh ? (
          <>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-sm font-bold tracking-tight text-foreground tabular-nums">
                {soh.prefixApproximate ? '~' : ''}
                {soh.primaryValue}%
              </span>
              <span className="text-[10px] text-muted-foreground">{t(soh.primaryLabelKey as TranslationKey)}</span>
              {vm.isStabilizing && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold sq-chip-watch border border-border">
                  {t('health.battery.publication.stabilizing')}
                </span>
              )}
            </div>
            <div className="w-full h-1.5 rounded-full overflow-hidden mb-2 bg-muted">
              <div
                className={`h-full ${vm.isStabilizing ? 'bg-[color:var(--status-watch)]' : barColor} rounded-full transition-all`}
                style={{ width: `${Math.min(100, Math.max(0, Number(soh.primaryValue) || 0))}%` }}
              />
            </div>
            {soh.interpretationLabel && (
              <p className="text-xs text-muted-foreground">{soh.interpretationLabel}</p>
            )}
          </>
        ) : (
          <>
            <span className="text-sm font-bold text-foreground">{t('health.battery.hv.sohUnavailable')}</span>
            <p className="text-[10px] mt-1 text-muted-foreground">{t('health.battery.hv.sohUnavailableHint')}</p>
          </>
        )}

        <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
          <div>
            <span className="uppercase tracking-wider font-semibold">{t('health.battery.hv.soc')}</span>
            <p className="text-sm font-bold text-foreground tabular-nums">{formatPercent(live.socPercent)}</p>
          </div>
          <div>
            <span className="uppercase tracking-wider font-semibold">{t('health.battery.hv.energy')}</span>
            <p className="text-sm font-bold text-foreground tabular-nums">{formatKwh(live.currentEnergyKwh)}</p>
          </div>
        </div>
        <p className="text-[10px] mt-1 text-muted-foreground/70">{t(live.chargingStateKey as TranslationKey)}</p>
      </div>
    </div>
  );
}
