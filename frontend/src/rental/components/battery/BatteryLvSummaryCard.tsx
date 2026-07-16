import { Icon } from '../ui/Icon';
import { BatteryConditionBars, RestingVoltageBadge } from '../BatteryConditionBars';
import { BatteryDataQualityBadge } from '../BatteryDataQualityBadge';
import { useLanguage } from '../../i18n/LanguageContext';
import type { BatteryLvSummaryVm } from '../../lib/battery-lv-view-model';
import { formatVolts } from '../../lib/battery-ui-formatters';
import { publicationStateI18nKey } from '../../lib/battery-ui-formatters';

export interface BatteryLvSummaryCardProps {
  vm: BatteryLvSummaryVm;
  onOpenDetail?: () => void;
  quickCardClass: string;
  quickCardHeaderClass: string;
  quickCardTitleClass: string;
  quickCardBodyClass: string;
  quickCardFooterClass: string;
  accentBackdrop?: string;
  accentIconBox?: string;
  telltaleSlot?: React.ReactNode;
}

export function BatteryLvSummaryCard({
  vm,
  onOpenDetail,
  quickCardClass,
  quickCardHeaderClass,
  quickCardTitleClass,
  quickCardBodyClass,
  quickCardFooterClass,
  accentBackdrop = '',
  accentIconBox = '',
  telltaleSlot,
}: BatteryLvSummaryCardProps) {
  const { t } = useLanguage();

  return (
    <div onClick={onOpenDetail} className={`${quickCardClass} order-4`}>
      <style>{`@keyframes calibDots { 0%,20%{opacity:.2} 50%{opacity:1} 100%{opacity:.2} }`}</style>
      <div className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl pointer-events-none ${accentBackdrop}`} />
      <div className={`${quickCardHeaderClass} gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg shrink-0 ${accentIconBox}`}>
            <Icon name="battery" className="w-3.5 h-3.5" />
          </div>
          <h3 className={quickCardTitleClass}>{t('health.battery.lv.title')}</h3>
          {vm.aggregateDataQuality && (
            <BatteryDataQualityBadge status={vm.aggregateDataQuality} />
          )}
          {telltaleSlot}
        </div>
        {onOpenDetail && (
          <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
        )}
      </div>

      <div className={quickCardBodyClass}>
        {vm.unsupported ? (
          <>
            <p className="text-sm font-bold text-foreground">{t('health.battery.lv.unsupportedTitle')}</p>
            <p className="text-[10px] text-muted-foreground mt-1">{t('health.battery.lv.unsupported')}</p>
          </>
        ) : vm.estimatedHealth.isCalibrating ? (
          <>
            <div className="mb-1.5 flex items-center gap-1.5">
              <span className="text-xs font-medium text-[color:var(--status-info)]">
                {t(publicationStateI18nKey('INITIAL_CALIBRATION'))}
              </span>
              <span className="inline-flex">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="inline-block w-1 h-1 rounded-full mx-0.5 bg-[color:var(--status-info)]"
                    style={{ animation: `calibDots 1.4s infinite ${i * 0.2}s` }}
                  />
                ))}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">{t('health.battery.lv.calibratingHint')}</p>
          </>
        ) : (
          <>
            <div className="mb-2" title={t(vm.estimatedHealth.tooltipKey)}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-1 text-muted-foreground">
                {vm.estimatedHealth.label}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <BatteryConditionBars
                  status={vm.estimatedHealth.status}
                  bars={vm.estimatedHealth.bars}
                  size="md"
                />
                {vm.estimatedHealth.dataQualityStatus && (
                  <BatteryDataQualityBadge status={vm.estimatedHealth.dataQualityStatus} />
                )}
                {vm.estimatedHealth.isStabilizing && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest border sq-chip-watch border-border">
                    {t('health.battery.publication.stabilizing')}
                  </span>
                )}
              </div>
            </div>

            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground">
                  {t('health.battery.lv.currentVoltage')}
                </p>
                <p className="text-xs font-bold text-foreground tabular-nums">
                  {formatVolts(vm.voltage.currentV)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {t(vm.voltage.contextKey)}
                  {vm.voltage.ageLabel ? ` · ${vm.voltage.ageLabel}` : ''}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold mb-0.5 text-muted-foreground">
                  {t('health.battery.lv.restingVoltage')}
                  {vm.resting.batteryTypeLabel ? ` · ${vm.resting.batteryTypeLabel}` : ''}
                </p>
                {vm.resting.valueV != null ? (
                  <RestingVoltageBadge valueV={vm.resting.valueV} status={vm.resting.status} />
                ) : (
                  <p className="text-[10px] text-muted-foreground">{t('health.battery.lv.restingUnavailable')}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {!vm.unsupported && vm.lastCheckedLabel && (
        <div className={quickCardFooterClass}>
          <p className="text-[10px] text-muted-foreground/70">{vm.lastCheckedLabel}</p>
        </div>
      )}
    </div>
  );
}
