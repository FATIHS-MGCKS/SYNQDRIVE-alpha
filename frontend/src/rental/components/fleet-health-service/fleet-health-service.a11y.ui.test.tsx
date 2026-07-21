import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FleetHealthServiceTabBar } from './FleetHealthServiceTabBar';
import { FleetHealthServiceWorkPanel } from './FleetHealthServiceWorkPanel';
import { FleetHealthServiceKpiStrip } from './FleetHealthServiceKpiStrip';
import { FleetHealthServicePriorityOverview } from './FleetHealthServicePriorityOverview';
import { buildFleetHealthServiceKpiGroups } from './FleetHealthServiceKpiStrip';
import type { FleetHealthServicePrioritySection } from './fleet-health-service.view-model';
import type { FleetHealthKpis } from '../../lib/fleet-health-control-center';
import type { FleetHealthServiceExecutionGroups } from './fleet-health-service.view-model';
import { Ban } from 'lucide-react';

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: string, vars?: Record<string, string | number>) => {
      if (vars) {
        return `${key}:${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')}`;
      }
      return key;
    },
  }),
}));

vi.mock('./FleetHealthServiceTasksPanel', () => ({
  FleetHealthServiceTasksPanel: () => <div data-testid="tasks-panel">tasks</div>,
}));
vi.mock('./FleetHealthServiceSchedulePanel', () => ({
  FleetHealthServiceSchedulePanel: () => <div data-testid="schedule-panel">schedule</div>,
}));
vi.mock('./FleetHealthServiceVendorsPanel', () => ({
  FleetHealthServiceVendorsPanel: () => <div data-testid="vendors-panel">vendors</div>,
}));

const baseHealthKpis: FleetHealthKpis = {
  total: 4,
  blocked: 1,
  critical: 1,
  warning: 1,
  limited: 1,
  good: 1,
  naModuleVehicles: 0,
  actionRequired: 2,
  needsReview: 1,
  healthy: 1,
  unevaluable: 0,
};

const execution: FleetHealthServiceExecutionGroups = {
  openServiceTasks: [],
  overdueServiceTasks: [{ id: 't1', vehicleId: 'v1' } as never],
  dueTodayServiceTasks: [],
  inProgressServiceTasks: [],
  vendorWaitingTasks: [],
  upcomingServiceItems: [],
  completedServiceItems: [],
  activeVendors: [],
};

const sampleSections: FleetHealthServicePrioritySection[] = [
  {
    key: 'technically_blocked',
    rows: [
      {
        id: 'row-v1',
        vehicleId: 'v1',
        plate: 'B-AB 1234',
        makeModelYear: 'VW Golf 2022',
        section: 'technically_blocked',
        primaryStatusLabel: 'Technisch blockiert',
        primaryStatusTone: 'critical',
        primaryBlockage: 'Mietblockade aktiv',
        additionalFindingsCount: 1,
        openTaskCount: 1,
        openCaseCount: 1,
        moreCount: 0,
        recommendedAction: 'open_task',
        primaryLinkedTaskId: 'task-1',
        sortRank: 1,
        findings: [
          {
            id: 'f1',
            moduleKey: 'battery',
            label: 'Batterie',
            detail: 'Schwach',
            reason: 'Low voltage',
            state: 'critical',
            tone: 'critical',
            linkedTaskId: 'task-1',
            sourceLabel: 'Telemetrie',
          },
        ],
        cases: [
          {
            id: 'case-1',
            title: 'Werkstattfall',
            status: 'OPEN',
            statusLabel: 'Offen',
            sourceLabel: 'Manuell',
            linkedTaskIds: ['task-1'],
          },
        ],
        matchedTasks: [
          {
            id: 'task-1',
            title: 'Batterie prüfen',
            status: 'OPEN',
            statusLabel: 'Offen',
            tone: 'warning',
            sourceLabel: 'Service',
            dueLabel: 'Heute',
            serviceCaseId: 'case-1',
          },
        ],
        unmatchedTasks: [],
        dataQualityNote: null,
      },
    ],
  },
  {
    key: 'handle_today',
    rows: [],
  },
  {
    key: 'technical_review',
    rows: [],
  },
  {
    key: 'incomplete_data',
    rows: [],
  },
  {
    key: 'due_soon',
    rows: [],
  },
];

describe('fleet health service a11y UI', () => {
  it('renders main tablist with tab/tabpanel wiring ids', () => {
    const html = renderToStaticMarkup(
      <FleetHealthServiceTabBar activeTab="overview" onTabChange={() => undefined} />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="fleetHealthService.a11y.mainTabs"');
    expect(html).toContain('id="fhs-tab-overview"');
    expect(html).toContain('aria-controls="fhs-panel-overview"');
    expect(html).toContain('min-h-11');
  });

  it('renders unified work subnavigation tablist including vendors', () => {
    const html = renderToStaticMarkup(
      <FleetHealthServiceWorkPanel
        activeSection="tasks"
        onSectionChange={() => undefined}
        tasks={[]}
        vendors={[]}
      />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="fleetHealthService.a11y.workTabs"');
    expect(html).toContain('id="fhs-work-tab-vendors"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('id="fhs-work-panel-tasks"');
    expect(html).toContain('min-h-11');
  });

  it('renders KPI buttons with aria-label and touch-friendly min height', () => {
    const groups = buildFleetHealthServiceKpiGroups({ healthKpis: baseHealthKpis, execution }).map(
      (group) => ({
        ...group,
        items: group.items.map((item) =>
          item.key === 'blocked'
            ? { ...item, icon: Ban }
            : item,
        ),
      }),
    );
    const html = renderToStaticMarkup(
      <FleetHealthServiceKpiStrip groups={groups} onItemClick={() => undefined} />,
    );
    expect(html).toContain('aria-label="fleetHealthService.a11y.kpiNavigate:');
    expect(html).toContain('min-h-11');
  });

  it('renders priority overview with expandable regions and service case affordance', () => {
    const html = renderToStaticMarkup(
      <FleetHealthServicePriorityOverview sections={sampleSections} />,
    );
    expect(html).toContain('aria-expanded');
    expect(html).toContain('aria-controls="fhs-vehicle-details-row-v1"');
    expect(html).toContain('role="region"');
    expect(html).toContain('fleetHealthService.a11y.expandVehicle:plate=B-AB 1234');
    expect(html).toContain('motion-reduce:transition-none');
  });

  it('renders error state with alert role', () => {
    const html = renderToStaticMarkup(
      <FleetHealthServicePriorityOverview
        sections={sampleSections}
        healthError="Health fetch failed"
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('fleetHealthService.overview.errorTitle');
  });
});
