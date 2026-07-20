import { Users } from 'lucide-react';
import type { ApiTask, Vendor } from '../../../lib/api';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import {
  FLEET_HEALTH_SERVICE_WORK_SECTION_ORDER,
  type FleetHealthServiceWorkSection,
} from './fleet-health-service.types';
import { FleetHealthServiceSchedulePanel } from './FleetHealthServiceSchedulePanel';
import { FleetHealthServiceTasksPanel } from './FleetHealthServiceTasksPanel';
import { FleetHealthServiceVendorsPanel } from './FleetHealthServiceVendorsPanel';

const WORK_SECTION_LABEL_KEYS: Record<
  Exclude<FleetHealthServiceWorkSection, 'vendors'>,
  TranslationKey
> = {
  tasks: 'fleetHealthService.work.tasks',
  schedule: 'fleetHealthService.work.schedule',
};

interface FleetHealthServiceWorkPanelProps {
  activeSection: FleetHealthServiceWorkSection;
  onSectionChange: (section: FleetHealthServiceWorkSection) => void;
  tasks: ApiTask[];
  vendors: Vendor[];
  loading?: boolean;
  error?: string | null;
  onReload?: () => void;
  onOpenGlobalTasks?: (taskId: string) => void;
  onOpenVendorDetail?: (vendor: Vendor) => void;
  focusTaskId?: string | null;
}

export function FleetHealthServiceWorkPanel({
  activeSection,
  onSectionChange,
  tasks,
  vendors,
  loading,
  error,
  onReload,
  onOpenGlobalTasks,
  onOpenVendorDetail,
  focusTaskId,
}: FleetHealthServiceWorkPanelProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div
          className="grid grid-cols-2 gap-0.5 rounded-xl surface-frosted p-1 w-full sm:w-auto sm:inline-grid"
          role="tablist"
          aria-label={t('fleetHealthService.tab.work')}
        >
          {FLEET_HEALTH_SERVICE_WORK_SECTION_ORDER.map((section) => {
            const selected = activeSection === section;
            return (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onSectionChange(section)}
                className={cn(
                  'rounded-[calc(var(--radius-md)-2px)] border border-transparent px-3 py-1.5 text-[11px] font-semibold transition-colors',
                  selected
                    ? 'surface-premium text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/40',
                )}
              >
                {t(WORK_SECTION_LABEL_KEYS[section])}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => onSectionChange('vendors')}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-semibold transition-colors',
            activeSection === 'vendors'
              ? 'border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand)]'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/40',
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {t('fleetHealthService.work.vendorsAction')}
        </button>
      </div>

      {activeSection === 'tasks' && (
        <FleetHealthServiceTasksPanel
          tasks={tasks}
          vendors={vendors}
          loading={loading}
          error={error}
          onReload={onReload}
          onOpenGlobalTasks={onOpenGlobalTasks}
          focusTaskId={focusTaskId}
        />
      )}

      {activeSection === 'schedule' && (
        <FleetHealthServiceSchedulePanel
          tasks={tasks}
          vendors={vendors}
          loading={loading}
          onSelectTask={onOpenGlobalTasks}
        />
      )}

      {activeSection === 'vendors' && (
        <FleetHealthServiceVendorsPanel onOpenVendorDetail={onOpenVendorDetail} />
      )}
    </div>
  );
}
