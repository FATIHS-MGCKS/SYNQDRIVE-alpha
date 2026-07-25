import { expect, type Page, type Route } from '@playwright/test';

export const WF_E2E_ORG_ID = 'org-workflow-e2e';
export const WF_E2E_FOREIGN_ORG_ID = 'org-foreign-wf-e2e';
export const WF_E2E_WORKFLOW_ID = 'wf-e2e-1';

export const WF_E2E_MOCK_USER = {
  id: 'user-wf-admin',
  email: 'workflow-e2e@example.test',
  name: 'Workflow E2E User',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: WF_E2E_ORG_ID,
  organizationName: 'Workflow E2E GmbH',
  organizationLogoUrl: null,
  permissions: {
    'workflow-automation': { read: true, write: true, manage: true },
    tasks: { read: true, write: true, manage: true },
  },
};

const API_PATTERN = '**/api/**';

type WorkflowRow = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  category: string;
  trigger: { type: string };
  conditions: unknown[];
  actions: Array<{ type: string; config?: Record<string, unknown> }>;
  scope: { type: string };
  status: string;
  statusLabel: string;
  enabled: boolean;
  version: number;
  triggerCount: number;
  lastTriggeredAt: string | null;
  isTemplate: boolean;
  createdAt: string;
  updatedAt: string;
};

const state = {
  workflows: [] as WorkflowRow[],
  runs: [] as Array<Record<string, unknown>>,
  dryRunPlans: [] as Array<Record<string, unknown>>,
  foreignTenantBlocked: false,
};

function seedWorkflows() {
  state.workflows = [
    {
      id: WF_E2E_WORKFLOW_ID,
      organizationId: WF_E2E_ORG_ID,
      name: '[System] Buchung vorbereiten',
      description: 'E2E system template',
      category: 'task_automation_system',
      trigger: { type: 'task.automation.materialize' },
      conditions: [],
      actions: [{ type: 'task.create', config: { title: 'Buchung vorbereiten' } }],
      scope: { type: 'organization' },
      status: 'ACTIVE',
      statusLabel: 'Active',
      enabled: true,
      version: 3,
      triggerCount: 12,
      lastTriggeredAt: '2026-07-24T10:00:00.000Z',
      isTemplate: true,
      createdAt: '2026-07-01T08:00:00.000Z',
      updatedAt: '2026-07-24T10:00:00.000Z',
    },
    {
      id: 'wf-e2e-draft',
      organizationId: WF_E2E_ORG_ID,
      name: 'Custom pickup reminder',
      description: null,
      category: 'support',
      trigger: { type: 'manual.test' },
      conditions: [],
      actions: [{ type: 'notification.prepare', config: { message: 'Pickup reminder', target: 'admin' } }],
      scope: { type: 'organization' },
      status: 'DRAFT',
      statusLabel: 'Draft',
      enabled: false,
      version: 1,
      triggerCount: 0,
      lastTriggeredAt: null,
      isTemplate: false,
      createdAt: '2026-07-20T08:00:00.000Z',
      updatedAt: '2026-07-20T08:00:00.000Z',
    },
  ];
}

export async function installWorkflowAutomationFlowMocks(page: Page) {
  seedWorkflows();
  state.runs = [];
  state.dryRunPlans = [];
  state.foreignTenantBlocked = false;

  await page.route(API_PATTERN, async (route: Route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const path = url.pathname;

    if (path.includes('/auth/me') || path.includes('/users/me')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(WF_E2E_MOCK_USER),
      });
    }

    if (path.includes(`/organizations/${WF_E2E_FOREIGN_ORG_ID}/`) && state.foreignTenantBlocked) {
      return route.fulfill({ status: 403, body: JSON.stringify({ message: 'Forbidden' }) });
    }

    if (method === 'GET' && path.match(/\/organizations\/[^/]+\/workflows\/stats$/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total: state.workflows.length,
          active: state.workflows.filter((w) => w.status === 'ACTIVE').length,
          draft: state.workflows.filter((w) => w.status === 'DRAFT').length,
          disabled: 0,
          totalRuns: 5,
          successfulRuns: 4,
          failedRuns: 1,
          waitingApprovalRuns: 0,
          runsLast24h: 2,
          lastRunAt: '2026-07-24T10:00:00.000Z',
        }),
      });
    }

    if (method === 'GET' && path.match(/\/organizations\/[^/]+\/workflows\/catalog$/)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          triggers: [{ type: 'manual.test' }],
          actions: [{ type: 'task.create' }, { type: 'notification.prepare' }],
          categories: ['maintenance', 'support'],
          scopeTypes: ['organization'],
          conditionFields: [],
          operators: ['equals'],
          statuses: ['DRAFT', 'ACTIVE'],
        }),
      });
    }

    if (method === 'GET' && path.match(/\/organizations\/[^/]+\/workflows$/) && !path.includes('/workflows/')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.workflows),
      });
    }

    if (method === 'GET' && path.match(/\/organizations\/[^/]+\/workflows\/[^/]+$/) && !path.includes('/runs')) {
      const wfId = path.split('/').pop()!;
      const wf = state.workflows.find((w) => w.id === wfId);
      if (!wf) return route.fulfill({ status: 404, body: '{}' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wf) });
    }

    if (method === 'POST' && path.includes('/dry-run')) {
      const plan = {
        executed: false,
        executionMode: 'DRY_RUN',
        policyBlockers: [],
        plannedActions: [{ actionType: 'task.create', status: 'PLANNED', preview: { wouldCreate: 'OrgTask' } }],
      };
      state.dryRunPlans.push(plan);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plan) });
    }

    if (method === 'GET' && path.includes('/task-automation/rules')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { ruleId: 'booking.lifecycle.confirmed.prep', catalogKey: 'BOOKING_PREPARATION', effectivelyEnabled: true },
        ]),
      });
    }

    return route.continue();
  });

  await page.addInitScript((user) => {
    window.localStorage.setItem('synqdrive-mock-user', JSON.stringify(user));
    window.localStorage.setItem('synqdrive-current-view', 'workflow-automation');
  }, WF_E2E_MOCK_USER);
}

export function getWorkflowState() {
  return state;
}

export async function openWorkflowAutomationView(page: Page) {
  await page.goto('/');
  await page.waitForTimeout(500);
}
