import { Users } from 'lucide-react';
import type { ApiTask, Vendor } from '../../../lib/api';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';
import type { ServiceTaskAdvancedFilters } from '../../lib/service-task-filters';
import type { ServiceTaskFilter } from '../service-center/service-center.types';
import { FHS_WORK_PANEL_ID, FHS_WORK_TAB_ID } from './fleet-health-service-a11y';
import { fhs } from './fleet-health-service-shell';
import {
  type FleetHealthServiceWorkSection,
} from './fleet-health-service.types';
import { FleetHealthServiceSchedulePanel } from './FleetHealthServiceSchedulePanel';
import { FleetHealthServiceTasksPanel } from './FleetHealthServiceTasksPanel';
import { FleetHealthServiceVendorsPanel } from './FleetHealthServiceVendorsPanel';

const WORK_SECTIONS: FleetHealthServiceWorkSection[] = ['tasks', 'schedule', 'vendors'];

const WORK_SECTION_LABEL_KEYS: Record<FleetHealthServiceWorkSection, TranslationKey> = {
  tasks: 'fleetHealthService.work.tasks',
  schedule: 'fleetHealthService.work.schedule',
  vendors: 'fleetHealthService.tab.vendors',
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
  initialTaskFilter?: ServiceTaskFilter;
  initialAdvancedFilters?: Partial<ServiceTaskAdvancedFilters>;
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
  initialTaskFilter,
  initialAdvancedFilters,
}: FleetHealthServiceWorkPanelProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <div
        className="grid grid-cols-3 gap-0.5 rounded-xl surface-frosted p-1"
        role="tablist"
        aria-label={t('fleetHealthService.a11y.workTabs')}
      >
        {WORK_SECTIONS.map((section) => {
          const selected = activeSection === section;
          return (
            <button
              key={section}
              id={FHS_WORK_TAB_ID[section]}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={FHS_WORK_PANEL_ID[section]}
              onClick={() => onSectionChange(section)}
              className={cn(
                fhs.workTab,
                'inline-flex w-full items-center justify-center gap-1.5',
                selected
                  ? 'surface-premium text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-background/40',
              )}
            >
              {section === 'vendors' ? (
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : null}
              <span className="truncate">
                {section === 'vendors'
                  ? t('fleetHealthService.work.vendorsAction')
                  : t(WORK_SECTION_LABEL_KEYS[section])}
              </span>
            </button>
          );
        })}
      </div>

      {error && !loading ? (
        <div role="alert" aria-live="assertive" className="sr-only">
          {error}
        </div>
      ) : null}

      <div
        id={FHS_WORK_PANEL_ID.tasks}
        role="tabpanel"
        aria-labelledby={FHS_WORK_TAB_ID.tasks}
        hidden={activeSection !== 'tasks'}
        className={activeSection !== 'tasks' ? 'hidden' : undefined}
      >
        <FleetHealthServiceTasksPanel
          tasks={tasks}
          vendors={vendors}
          loading={loading}
          error={error}
          onReload={onReload}
          onOpenGlobalTasks={onOpenGlobalTasks}
          focusTaskId={focusTaskId}
          initialTaskFilter={initialTaskFilter}
          initialAdvancedFilters={initialAdvancedFilters}
        />
      </div>

      <div
        id={FHS_WORK_PANEL_ID.schedule}
        role="tabpanel"
        aria-labelledby={FHS_WORK_TAB_ID.schedule}
        hidden={activeSection !== 'schedule'}
        className={activeSection !== 'schedule' ? 'hidden' : undefined}
      >
        <FleetHealthServiceSchedulePanel
          tasks={tasks}
          vendors={vendors}
          loading={loading}
          onSelectTask={onOpenGlobalTasks}
        />
      </div>

      <div
        id={FHS_WORK_PANEL_ID.vendors}
        role="tabpanel"
        aria-labelledby={FHS_WORK_TAB_ID.vendors}
        hidden={activeSection !== 'vendors'}
        className={activeSection !== 'vendors' ? 'hidden' : undefined}
      >
        <FleetHealthServiceVendorsPanel onOpenVendorDetail={onOpenVendorDetail} />
      </div>
    </div>
  );
}
