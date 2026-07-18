import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Station, StationVehicleWorkflowType } from '../../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { useStationsV2Permissions } from '../../hooks/useStationsV2Permissions';
import { availableStationVehicleWorkflows } from '../../lib/station-vehicle-workflow.utils';
import { StationVehicleWorkflowModal } from './StationVehicleWorkflowModal';

interface StationVehicleWorkflowMenuProps {
  station: Station;
  onSaved?: () => void;
  buttonClassName?: string;
}

export function StationVehicleWorkflowMenu({
  station,
  onSaved,
  buttonClassName,
}: StationVehicleWorkflowMenuProps) {
  const { t } = useLanguage();
  const { forStation } = useStationsV2Permissions();
  const caps = forStation(station);
  const [open, setOpen] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState<StationVehicleWorkflowType | null>(null);

  const workflows = useMemo(
    () => availableStationVehicleWorkflows(caps),
    [caps],
  );

  if (workflows.length === 0) return null;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={
            buttonClassName ??
            'sq-press px-3 py-2 rounded-xl text-[10px] font-semibold border border-border surface-premium inline-flex items-center gap-1.5'
          }
        >
          {t('stations.workflow.menu')}
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        {open && (
          <>
            <button type="button" className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} aria-label={t('common.close')} />
            <div role="menu" className="absolute right-0 mt-1 z-[75] min-w-[220px] rounded-xl border border-border surface-premium shadow-lg py-1">
              {workflows.map((workflow) => (
                <button
                  key={workflow}
                  type="button"
                  className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50"
                  onClick={() => {
                    setOpen(false);
                    setActiveWorkflow(workflow);
                  }}
                >
                  {t(`stations.workflow.${workflow}.title`)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {activeWorkflow && (
        <StationVehicleWorkflowModal
          station={station}
          workflow={activeWorkflow}
          onClose={() => setActiveWorkflow(null)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
