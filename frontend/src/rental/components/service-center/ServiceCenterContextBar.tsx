import { X } from 'lucide-react';
import { useLanguage } from '../../../i18n/LanguageContext';
import { useFleetVehicles } from '../../FleetContext';
import type { ServiceCenterNavState } from '../../lib/service-center-navigation';
import { buildVehicleLabel } from '../../lib/service-task-semantics';
import { sc } from './service-center-ui';

interface ServiceCenterContextBarProps {
  context: Pick<ServiceCenterNavState, 'vehicleId' | 'vendorId' | 'taskType' | 'taskFilter'>;
  vendorName?: string | null;
  onClear: () => void;
}

export function ServiceCenterContextBar({
  context,
  vendorName,
  onClear,
}: ServiceCenterContextBarProps) {
  const { t } = useLanguage();
  const { fleetVehicles } = useFleetVehicles();
  const vehicle = context.vehicleId
    ? fleetVehicles.find((v) => v.id === context.vehicleId)
    : null;

  const parts: string[] = [];
  if (vehicle) parts.push(`Fahrzeug: ${buildVehicleLabel(vehicle)}`);
  if (context.vendorId && vendorName) parts.push(`Partner: ${vendorName}`);
  if (context.taskType) parts.push(`Typ: ${context.taskType.replace(/_/g, ' ')}`);
  if (context.taskFilter && context.taskFilter !== 'all') {
    parts.push(`Filter: ${context.taskFilter}`);
  }

  if (!parts.length) return null;

  return (
    <div className={`${sc.panel} flex flex-wrap items-center justify-between gap-2 py-2.5 px-3`}>
      <p className="text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground">{t('serviceCenter.context.label')} </span>
        {parts.join(' · ')}
      </p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-[10px] font-semibold hover:bg-muted/40 sq-press"
      >
        <X className="w-3 h-3" />
        {t('serviceCenter.context.resetFilter')}
      </button>
    </div>
  );
}
