import {
  chromeTabBarClass,
  chromeTabTriggerClass,
  CHROME_TAB_BAR_SCROLL_CLASS,
} from '../../../components/patterns/chrome-tab-bar';
import {
  FLEET_HEALTH_SERVICE_WORK_VIEW_ORDER,
  type FleetHealthServiceWorkView,
} from './fleet-health-service-work-area';

const WORK_VIEW_LABELS: Record<FleetHealthServiceWorkView, string> = {
  tasks: 'Aufgaben',
  'service-cases': 'Servicefälle',
  'due-dates': 'Fälligkeiten',
};

interface FleetHealthServiceWorkSubTabBarProps {
  activeView: FleetHealthServiceWorkView;
  onViewChange: (view: FleetHealthServiceWorkView) => void;
}

export function FleetHealthServiceWorkSubTabBar({
  activeView,
  onViewChange,
}: FleetHealthServiceWorkSubTabBarProps) {
  return (
    <div
      className={chromeTabBarClass('p-1')}
      role="tablist"
      aria-label="Arbeiten"
    >
      <div className={CHROME_TAB_BAR_SCROLL_CLASS}>
        {FLEET_HEALTH_SERVICE_WORK_VIEW_ORDER.map((view) => {
          const isActive = activeView === view;
          return (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onViewChange(view)}
              className={chromeTabTriggerClass(isActive, 'min-w-[6.5rem]')}
            >
              <span className="truncate">{WORK_VIEW_LABELS[view]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
