import { expect, type Locator, type Page, type Route } from '@playwright/test';

export const DP_FLOW_ORG_ID = 'org-dp-flow-e2e';
export const DP_FLOW_FOREIGN_ORG_ID = 'org-dp-foreign-e2e';
export const DP_FLOW_VEHICLE_ALLOWED = 'veh-flow-allowed';
export const DP_FLOW_VEHICLE_DENIED = 'veh-flow-denied';
export const DP_FLOW_CUSTOMER_1 = 'cust-flow-1';
export const DP_FLOW_BOOKING_1 = 'bk-flow-1';
export const DP_FLOW_STATION_1 = 'sta-flow-1';

export const DP_FLOW_MOCK_USER = {
  id: 'user-dp-flow-e2e',
  email: 'dp-flow@example.test',
  name: 'DP Flow E2E',
  platformRole: 'ORG_USER',
  membershipRole: 'ORG_ADMIN',
  organizationId: DP_FLOW_ORG_ID,
  organizationName: 'DP Flow Test GmbH',
  organizationLogoUrl: null,
  permissions: {
    'data-authorization': { read: true, write: true, manage: true },
  },
};

const ROUTE_PATTERN = '**/api/v1/**';
let flowRouteHandler: ((route: Route) => Promise<void>) | null = null;

type ActivityRow = {
  id: string;
  organizationId: string;
  activityCode: string;
  title: string;
  description?: string | null;
  status: string;
  versionNumber: number;
  isCurrentVersion: boolean;
  policyFamilyId: string;
  dpiaStatus: string;
  hasBlockingGaps: boolean;
  activeReviewCycleId?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  activatedAt?: string | null;
  dataCategories: string[];
  purposes: string[];
  dataSubjectTypes: string[];
  vehicleIds: string[];
  customerIds: string[];
  bookingIds: string[];
  stationIds: string[];
  scopeKey: string;
  purposeSummary?: string;
  completeness: { status: string; blockingGaps: string[] };
  updatedAt: string;
};

type ReviewCycleRow = {
  id: string;
  status: string;
  entityVersionNumber: number;
  fourEyesRequired: boolean;
  decisions: Array<{
    id: string;
    stepType: string;
    outcome: string;
    actorUserId?: string;
    reason?: string | null;
    decidedAt: string;
  }>;
};

type ProviderGrantRow = {
  id: string;
  organizationId: string;
  provider: string;
  providerStatus: string;
  processingActivityId?: string;
  vehicleId?: string;
  grantedScopes: string[];
};

type ConsentRow = {
  id: string;
  organizationId: string;
  processingActivityId: string;
  consentStatus: string;
  dataSubjectReference: string;
};

type DpaRow = {
  id: string;
  organizationId: string;
  processorName: string;
  status: string;
  processingActivityId?: string;
};

type AuditRow = {
  id: string;
  organizationId: string;
  eventType: string;
  vehicleId?: string;
  correlationId: string;
  evaluatedAt: string;
  processingPurpose?: string;
  dataCategory?: string;
};

type LifecycleEventRow = {
  id: string;
  organizationId: string;
  processingActivityId: string;
  eventType: string;
  previousStatus?: string | null;
  newStatus: string;
  createdAt: string;
};

type RevocationWorkflowRow = {
  id: string;
  organizationId: string;
  processingActivityId: string;
  status: string;
  completedAt?: string | null;
};

const state = {
  locale: 'de' as 'de' | 'en',
  activities: new Map<string, ActivityRow>(),
  legalBases: new Map<string, Record<string, unknown>>(),
  reviewCycles: new Map<string, ReviewCycleRow>(),
  providerGrants: new Map<string, ProviderGrantRow>(),
  consents: new Map<string, ConsentRow>(),
  dpas: new Map<string, DpaRow>(),
  legacyAuths: [] as Array<Record<string, unknown>>,
  auditDecisions: [] as AuditRow[],
  lifecycleEvents: [] as LifecycleEventRow[],
  revocationWorkflows: new Map<string, RevocationWorkflowRow>(),
  denySwitchActive: false,
  queueBlocked: false,
  providerConflict: false,
  dpiaBlocksActivation: false,
  dpaMissingExternal: false,
  policyExpired: false,
  sessionInvalidated: false,
  idCounter: 1,
};

function json(data: unknown) {
  return JSON.stringify(data);
}

function nowIso() {
  return new Date().toISOString();
}

function nextId(prefix: string) {
  state.idCounter += 1;
  return `${prefix}-${state.idCounter}`;
}

function hubMetrics() {
  const activities = [...state.activities.values()].filter((a) => a.organizationId === DP_FLOW_ORG_ID);
  return {
    activeProcessingActivities: activities.filter((a) => a.status === 'ACTIVE' && a.isCurrentVersion).length,
    blockingControlGaps: activities.filter((a) => a.hasBlockingGaps).length,
    reviewsDue: activities.filter((a) => a.status === 'IN_REVIEW').length,
    revocationsInProgress: [...state.revocationWorkflows.values()].filter((w) => w.status !== 'REVOCATION_COMPLETE').length,
    enforcementErrors: state.denySwitchActive ? 1 : 0,
    dpiaOverdue: activities.filter((a) => a.dpiaStatus === 'DPIA_REVIEW_DUE').length,
    legacy: {
      total: state.legacyAuths.length,
      active: 0,
      pending: 0,
      revoked: 0,
      expired: 0,
      highRisk: 0,
      expiringSoon: 0,
    },
  };
}

function activityListItem(a: ActivityRow) {
  return {
    id: a.id,
    activityCode: a.activityCode,
    title: a.title,
    status: a.status,
    versionNumber: a.versionNumber,
    isCurrentVersion: a.isCurrentVersion,
    dpiaStatus: a.dpiaStatus,
    hasBlockingGaps: a.hasBlockingGaps,
    dataCategories: a.dataCategories,
    completeness: a.completeness,
    runtimeCoverage: null,
    updatedAt: a.updatedAt,
  };
}

function activityDetail(a: ActivityRow) {
  return {
    ...activityListItem(a),
    description: a.description ?? null,
    purposeSummary: a.purposeSummary ?? null,
    activeReviewCycleId: a.activeReviewCycleId ?? null,
    dataSubjectTypes: a.dataSubjectTypes,
    processingPurposes: a.purposes,
    legalBasisAssessments: [...state.legalBases.values()]
      .filter((lb) => lb.processingActivityId === a.id)
      .map((lb) => ({
        id: String(lb.id),
        status: String(lb.status ?? 'DRAFT'),
        legalBasisType: String(lb.legalBasisType ?? 'CONTRACT'),
        versionNumber: 1,
      })),
    enforcementPolicies: [],
    completeness: a.completeness,
    lifecycleBlockers: state.dpiaBlocksActivation
      ? [{ code: 'DPIA_NOT_APPROVED', message: 'DPIA required' }]
      : [],
    statusSemantics: {
      status: a.status,
      label: a.status,
      description: '',
      wasEverOperational: a.status === 'ACTIVE' || a.status === 'SUSPENDED' || a.status === 'REVOKED',
      isTerminal: ['REVOKED', 'REJECTED', 'EXPIRED'].includes(a.status),
      isReversible: a.status === 'SUSPENDED',
      displayCategory: 'processing-activity',
    },
  };
}

function coverageSummary() {
  const flows = [
    {
      flowId: 'live-gps',
      label: 'Live GPS',
      status: state.denySwitchActive ? 'ENFORCEMENT_ERROR' : 'ENFORCED',
      missingEnforcementPoints: state.denySwitchActive ? ['deny-switch'] : [],
      runtimeHealth: state.queueBlocked ? 'DEGRADED' : 'HEALTHY',
    },
  ];
  return {
    coverageVersion: '2026.07.24-e2e',
    totalFlows: flows.length,
    enforcedCount: flows.filter((f) => f.status === 'ENFORCED').length,
    notImplementedCount: 0,
    enforcementErrorCount: flows.filter((f) => f.status === 'ENFORCEMENT_ERROR').length,
    partiallyEnforcedCount: 0,
    fullyProtected: !state.denySwitchActive,
    flows,
  };
}

export function resetDataProcessingFlowState(options?: {
  locale?: 'de' | 'en';
  denySwitch?: boolean;
  dpiaBlocks?: boolean;
  policyExpired?: boolean;
}) {
  state.locale = options?.locale ?? 'de';
  state.denySwitchActive = options?.denySwitch ?? false;
  state.dpiaBlocksActivation = options?.dpiaBlocks ?? false;
  state.policyExpired = options?.policyExpired ?? false;
  state.queueBlocked = false;
  state.providerConflict = false;
  state.dpaMissingExternal = false;
  state.sessionInvalidated = false;
  state.idCounter = 1;
  state.activities.clear();
  state.legalBases.clear();
  state.reviewCycles.clear();
  state.providerGrants.clear();
  state.consents.clear();
  state.dpas.clear();
  state.legacyAuths = [];
  state.auditDecisions = [];
  state.lifecycleEvents = [];
  state.revocationWorkflows.clear();
}

export function getFlowActivities() {
  return [...state.activities.values()];
}

export function getFlowAuditDecisions() {
  return [...state.auditDecisions];
}

export function simulateAuthorizationCheck(input: {
  vehicleId: string;
  purpose?: string;
  dataCategory?: string;
  externalSharing?: boolean;
}): { allowed: boolean; eventType: string; reason?: string } {
  if (state.denySwitchActive) {
    pushAudit('DENY', input.vehicleId, 'deny-switch');
    return { allowed: false, eventType: 'DENY', reason: 'GLOBAL_DENY_SWITCH' };
  }
  if (state.dpaMissingExternal && input.externalSharing) {
    pushAudit('DENY', input.vehicleId, 'dpa-missing');
    return { allowed: false, eventType: 'DENY', reason: 'DPA_MISSING' };
  }
  const active = [...state.activities.values()].find(
    (a) => a.status === 'ACTIVE' && a.isCurrentVersion && a.organizationId === DP_FLOW_ORG_ID,
  );
  if (!active) {
    pushAudit('DENY', input.vehicleId, 'no-policy');
    return { allowed: false, eventType: 'DENY', reason: 'NO_MATCHING_POLICY' };
  }
  if (state.policyExpired || (active.validUntil && new Date(active.validUntil) < new Date())) {
    pushAudit('DENY', input.vehicleId, 'expired');
    return { allowed: false, eventType: 'DENY', reason: 'POLICY_EXPIRED' };
  }
  if (!active.vehicleIds.includes(input.vehicleId)) {
    pushAudit('DENY', input.vehicleId, 'scope');
    return { allowed: false, eventType: 'DENY', reason: 'SCOPE_MISMATCH' };
  }
  if (input.purpose && !active.purposes.includes(input.purpose)) {
    pushAudit('DENY', input.vehicleId, 'purpose');
    return { allowed: false, eventType: 'DENY', reason: 'PURPOSE_MISMATCH' };
  }
  if (input.dataCategory && !active.dataCategories.includes(input.dataCategory)) {
    pushAudit('DENY', input.vehicleId, 'category');
    return { allowed: false, eventType: 'DENY', reason: 'DATA_CATEGORY_MISMATCH' };
  }
  if (state.providerConflict) {
    pushAudit('DENY', input.vehicleId, 'provider');
    return { allowed: false, eventType: 'DENY', reason: 'PROVIDER_CONFLICT' };
  }
  pushAudit('ALLOW', input.vehicleId, 'ok');
  return { allowed: true, eventType: 'ALLOW' };
}

export function isFlowSessionInvalidated() {
  return state.sessionInvalidated;
}

function pushAudit(eventType: string, vehicleId: string, correlationId: string) {
  state.auditDecisions.unshift({
    id: nextId('audit'),
    organizationId: DP_FLOW_ORG_ID,
    eventType,
    vehicleId,
    correlationId: `corr-${correlationId}`,
    evaluatedAt: nowIso(),
    dataCategory: 'GPS_LOCATION',
    processingPurpose: 'LIVE_MAP',
  });
}

function pushLifecycleEvent(activityId: string, eventType: string, previousStatus: string | null, newStatus: string) {
  state.lifecycleEvents.unshift({
    id: nextId('evt'),
    organizationId: DP_FLOW_ORG_ID,
    processingActivityId: activityId,
    eventType,
    previousStatus,
    newStatus,
    createdAt: nowIso(),
  });
}

function createActivityFromPayload(body: Record<string, unknown>): ActivityRow {
  const id = nextId('pa');
  const familyId = nextId('fam');
  const row: ActivityRow = {
    id,
    organizationId: DP_FLOW_ORG_ID,
    activityCode: String(body.activityCode ?? 'PA-E2E'),
    title: String(body.title ?? 'E2E Activity'),
    description: (body.description as string) ?? null,
    status: 'DRAFT',
    versionNumber: 1,
    isCurrentVersion: true,
    policyFamilyId: familyId,
    dpiaStatus: String(body.dpiaStatus ?? 'DPIA_NOT_REQUIRED'),
    hasBlockingGaps: false,
    dataCategories: (body.dataCategories as string[]) ?? ['GPS_LOCATION'],
    purposes: (body.purposes as string[]) ?? ['LIVE_MAP'],
    dataSubjectTypes: (body.dataSubjectTypes as string[]) ?? ['CUSTOMER'],
    vehicleIds: [DP_FLOW_VEHICLE_ALLOWED],
    customerIds: [DP_FLOW_CUSTOMER_1],
    bookingIds: [DP_FLOW_BOOKING_1],
    stationIds: [DP_FLOW_STATION_1],
    scopeKey: 'VEHICLE',
    purposeSummary: (body.purposeSummary as string) ?? null,
    completeness: { status: 'COMPLETE', blockingGaps: [] },
    updatedAt: nowIso(),
  };
  state.activities.set(id, row);
  pushLifecycleEvent(id, 'CREATED', null, 'DRAFT');
  return row;
}

export async function installDataProcessingFlowMocks(
  page: Page,
  options?: Parameters<typeof resetDataProcessingFlowState>[0],
) {
  resetDataProcessingFlowState(options);

  await page.addInitScript(
    ({ user, locale }) => {
      localStorage.setItem('synqdrive_token', 'dp-flow-test-token');
      localStorage.setItem('synqdrive_user', JSON.stringify(user));
      localStorage.setItem('synqdrive.locale', locale);
      sessionStorage.setItem('synqdrive_rental_on_settings', '1');
      sessionStorage.setItem('synqdrive_rental_settings_tab', 'data-authorization');
    },
    { user: DP_FLOW_MOCK_USER, locale: state.locale },
  );

  const context = page.context();
  if (flowRouteHandler) {
    await context.unroute(ROUTE_PATTERN, flowRouteHandler);
  }

  flowRouteHandler = async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (!url.includes('/api/v1/')) {
      return route.continue();
    }

    if (url.includes(DP_FLOW_FOREIGN_ORG_ID)) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: json({ message: 'Forbidden' }) });
    }

    if (url.includes('/auth/me') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(DP_FLOW_MOCK_USER) });
    }

    if (url.includes(`/organizations/${DP_FLOW_ORG_ID}/profile`) && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ id: DP_FLOW_ORG_ID, name: DP_FLOW_MOCK_USER.organizationName, businessType: 'RENTAL' }),
      });
    }

    if (url.includes('/hub-metrics') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(hubMetrics()) });
    }

    if (url.includes('/coverage') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(coverageSummary()) });
    }

    if (url.includes('/vehicles') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          data: [
            { id: DP_FLOW_VEHICLE_ALLOWED, licensePlate: 'E2E-OK', make: 'Test', model: 'EV', status: 'AVAILABLE' },
            { id: DP_FLOW_VEHICLE_DENIED, licensePlate: 'E2E-NO', make: 'Test', model: 'EV', status: 'AVAILABLE' },
          ],
        }),
      });
    }

    if (url.includes('/customers') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          data: [{ id: DP_FLOW_CUSTOMER_1, firstName: 'E2E', lastName: 'Customer' }],
          meta: { limit: 50 },
        }),
      });
    }

    if (url.includes('/bookings') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({
          data: [{ id: DP_FLOW_BOOKING_1, status: 'CONFIRMED', customerId: DP_FLOW_CUSTOMER_1 }],
          meta: { limit: 50 },
        }),
      });
    }

    if (url.includes('/stations') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json([{ id: DP_FLOW_STATION_1, name: 'E2E Station', code: 'E2E' }]),
      });
    }

    if (url.includes('/processing-activity-register') && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const row = createActivityFromPayload(body);
      return route.fulfill({ status: 201, contentType: 'application/json', body: json(activityDetail(row)) });
    }

    const registerGet = url.match(/processing-activity-register\/([^/?]+)(?:\/versions)?/);
    if (registerGet && method === 'GET') {
      const activityId = decodeURIComponent(registerGet[1]);
      const activity = state.activities.get(activityId);
      if (!activity) {
        return route.fulfill({ status: 404, contentType: 'application/json', body: json({ message: 'Not found' }) });
      }
      if (url.includes('/versions')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: json([
            {
              id: activity.id,
              versionNumber: activity.versionNumber,
              status: activity.status,
              isCurrentVersion: activity.isCurrentVersion,
              title: activity.title,
              updatedAt: activity.updatedAt,
            },
          ]),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(activityDetail(activity)) });
    }

    if (url.includes('/processing-activity-register') && method === 'GET') {
      const items = [...state.activities.values()]
        .filter((a) => a.organizationId === DP_FLOW_ORG_ID)
        .map(activityListItem);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ data: items, meta: { limit: 25, nextCursor: null } }),
      });
    }

    if (url.includes('/legal-basis-assessments') && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = nextId('lba');
      const activityId = url.match(/processing-activities\/([^/]+)/)?.[1] ?? '';
      state.legalBases.set(id, { id, processingActivityId: activityId, ...body, status: 'DRAFT' });
      return route.fulfill({ status: 201, contentType: 'application/json', body: json({ id, ...body }) });
    }

    if (url.includes('/retention-deletion/policies') && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = nextId('ret');
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: json({ id, ...body, status: 'DRAFT' }),
      });
    }

    if (url.includes('/review-workflow/processing-activities/') && url.endsWith('/submit') && method === 'POST') {
      const activityId = url.match(/processing-activities\/([^/]+)\/submit/)?.[1] ?? '';
      const activity = state.activities.get(activityId);
      if (!activity) return route.fulfill({ status: 404, body: json({ message: 'Not found' }) });
      activity.status = 'IN_REVIEW';
      const cycleId = nextId('rc');
      activity.activeReviewCycleId = cycleId;
      state.reviewCycles.set(cycleId, {
        id: cycleId,
        status: 'IN_REVIEW',
        entityVersionNumber: activity.versionNumber,
        fourEyesRequired: true,
        decisions: [],
      });
      pushLifecycleEvent(activityId, 'SUBMITTED_FOR_REVIEW', 'DRAFT', 'IN_REVIEW');
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(activityDetail(activity)) });
    }

    if (url.includes('/review-workflow/cycles/') && url.includes('/decisions') && method === 'POST') {
      const cycleId = url.match(/cycles\/([^/]+)\/decisions/)?.[1] ?? '';
      const body = route.request().postDataJSON() as { stepType: string; outcome: string; reason?: string };
      const cycle = state.reviewCycles.get(cycleId);
      if (!cycle) return route.fulfill({ status: 404, body: json({ message: 'Not found' }) });
      cycle.decisions.push({
        id: nextId('dec'),
        stepType: body.stepType,
        outcome: body.outcome,
        actorUserId: DP_FLOW_MOCK_USER.id,
        reason: body.reason ?? null,
        decidedAt: nowIso(),
      });
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(cycle) });
    }

    if (url.includes('/review-workflow/cycles/') && method === 'GET') {
      const cycleId = url.match(/cycles\/([^/?]+)/)?.[1] ?? '';
      const cycle = state.reviewCycles.get(cycleId);
      if (!cycle) return route.fulfill({ status: 404, body: json({ message: 'Not found' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(cycle) });
    }

    if (url.includes('/policy-lifecycle/processing-activities/') && method === 'POST') {
      const activityId = url.match(/processing-activities\/([^/]+)/)?.[1] ?? '';
      const activity = state.activities.get(activityId);
      if (!activity) return route.fulfill({ status: 404, body: json({ message: 'Not found' }) });

      if (url.endsWith('/approve')) {
        const cycle = activity.activeReviewCycleId ? state.reviewCycles.get(activity.activeReviewCycleId) : null;
        if (cycle) {
          for (const step of ['PRIVACY_REVIEW', 'SECURITY_REVIEW', 'FINAL_APPROVAL']) {
            if (!cycle.decisions.some((d) => d.stepType === step)) {
              cycle.decisions.push({
                id: nextId('dec'),
                stepType: step,
                outcome: 'APPROVED',
                actorUserId: DP_FLOW_MOCK_USER.id,
                decidedAt: nowIso(),
              });
            }
          }
        }
        activity.status = 'APPROVED';
        pushLifecycleEvent(activityId, 'APPROVED', 'IN_REVIEW', 'APPROVED');
        return route.fulfill({ status: 200, contentType: 'application/json', body: json(activityDetail(activity)) });
      }

      if (url.endsWith('/schedule')) {
        const body = route.request().postDataJSON() as { validFrom: string };
        activity.status = 'SCHEDULED';
        activity.validFrom = body.validFrom;
        pushLifecycleEvent(activityId, 'SCHEDULED', 'APPROVED', 'SCHEDULED');
        return route.fulfill({ status: 200, contentType: 'application/json', body: json(activityDetail(activity)) });
      }

      if (url.endsWith('/activate')) {
        if (state.dpiaBlocksActivation) {
          return route.fulfill({
            status: 422,
            contentType: 'application/json',
            body: json({ code: 'DPIA_NOT_APPROVED', message: 'DPIA not approved' }),
          });
        }
        const previousStatus = activity.status;
        activity.status = 'ACTIVE';
        activity.activatedAt = nowIso();
        activity.validFrom = activity.validFrom ?? nowIso();
        if (state.policyExpired) {
          activity.validUntil = new Date(Date.now() - 86_400_000).toISOString();
        }
        pushLifecycleEvent(activityId, 'ACTIVATED', previousStatus, 'ACTIVE');
        return route.fulfill({ status: 200, contentType: 'application/json', body: json(activityDetail(activity)) });
      }

      if (url.endsWith('/revoke')) {
        const prev = activity.status;
        activity.status = 'REVOKED';
        const wfId = nextId('rw');
        state.revocationWorkflows.set(wfId, {
          id: wfId,
          organizationId: DP_FLOW_ORG_ID,
          processingActivityId: activityId,
          status: 'REVOCATION_COMPLETE',
          completedAt: nowIso(),
        });
        state.sessionInvalidated = true;
        pushLifecycleEvent(activityId, 'REVOKED', prev, 'REVOKED');
        return route.fulfill({ status: 200, contentType: 'application/json', body: json(activityDetail(activity)) });
      }
    }

    if (url.includes('/provider-access-grants') && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = nextId('pg');
      state.providerGrants.set(id, {
        id,
        organizationId: DP_FLOW_ORG_ID,
        provider: String(body.provider ?? 'DIMO'),
        providerStatus: 'PENDING',
        processingActivityId: body.processingActivityId as string,
        vehicleId: body.vehicleId as string,
        grantedScopes: (body.grantedScopes as string[]) ?? ['telemetry'],
      });
      return route.fulfill({ status: 201, contentType: 'application/json', body: json({ id, ...body, providerStatus: 'PENDING' }) });
    }

    if (url.includes('/provider-access-grants/') && url.endsWith('/activate') && method === 'POST') {
      const id = url.match(/provider-access-grants\/([^/]+)\/activate/)?.[1] ?? '';
      const grant = state.providerGrants.get(id);
      if (!grant) return route.fulfill({ status: 404, body: json({ message: 'Not found' }) });
      if (state.providerConflict) {
        return route.fulfill({ status: 409, body: json({ code: 'PROVIDER_CONFLICT' }) });
      }
      grant.providerStatus = 'ACTIVE';
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(grant) });
    }

    if (url.includes('/data-subject-consents/') && url.endsWith('/grant') && method === 'POST') {
      const id = url.match(/data-subject-consents\/([^/]+)\/grant/)?.[1] ?? '';
      const consent = state.consents.get(id);
      if (!consent) return route.fulfill({ status: 404, body: json({ message: 'Not found' }) });
      consent.consentStatus = 'GRANTED';
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(consent) });
    }

    if (url.includes('/data-subject-consents/') && url.endsWith('/withdraw') && method === 'POST') {
      const id = url.match(/data-subject-consents\/([^/]+)\/withdraw/)?.[1] ?? '';
      const consent = state.consents.get(id);
      if (!consent) return route.fulfill({ status: 404, body: json({ message: 'Not found' }) });
      consent.consentStatus = 'WITHDRAWN';
      pushAudit('DENY', DP_FLOW_VEHICLE_ALLOWED, 'consent-withdrawn');
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(consent) });
    }

    if (url.includes('/data-subject-consents') && method === 'POST') {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      const id = nextId('consent');
      const activityId = url.match(/processing-activities\/([^/]+)/)?.[1] ?? '';
      state.consents.set(id, {
        id,
        organizationId: DP_FLOW_ORG_ID,
        processingActivityId: activityId,
        consentStatus: 'PENDING',
        dataSubjectReference: String(body.dataSubjectReference ?? 'subject-e2e'),
      });
      return route.fulfill({ status: 201, contentType: 'application/json', body: json({ id, consentStatus: 'PENDING', ...body }) });
    }

    if (url.includes('/data-processing-agreements') && method === 'GET') {
      const items = [...state.dpas.values()].map((d) => ({ id: d.id, processorName: d.processorName, status: d.status }));
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(items) });
    }

    if (url.includes('/data-processing-agreements') && method === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const id = nextId('dpa');
      state.dpas.set(id, {
        id,
        organizationId: DP_FLOW_ORG_ID,
        processorName: String(body.processorName ?? 'Partner'),
        status: 'DRAFT',
        processingActivityId: body.processingActivityId as string,
      });
      return route.fulfill({ status: 201, contentType: 'application/json', body: json({ id, status: 'DRAFT', ...body }) });
    }

    if (url.includes('/authorization-decisions') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ items: state.auditDecisions, meta: { limit: 25, nextCursor: null } }),
      });
    }

    if (url.includes('/revocation-workflows/') && method === 'GET') {
      const wfId = url.match(/revocation-workflows\/([^/?]+)/)?.[1] ?? '';
      const wf = state.revocationWorkflows.get(wfId);
      if (!wf) return route.fulfill({ status: 404, body: json({ message: 'Not found' }) });
      return route.fulfill({ status: 200, contentType: 'application/json', body: json(wf) });
    }

    if (url.includes('/data-authorizations') && method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: json({ data: state.legacyAuths, meta: { limit: 25, nextCursor: null } }),
      });
    }

    if (url.includes('/permissions') || url.includes('/notifications') || url.includes('/support') || url.includes('/dashboard-insights') || url.includes('/users')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: json({ count: 0, permissions: [{ module: 'data-authorization', level: 'manage' }] }) });
    }

    return route.continue();
  };

  await context.route(ROUTE_PATTERN, flowRouteHandler);
}

export async function openDataProcessingHub(page: Page) {
  await page.goto('/rental', { waitUntil: 'domcontentloaded' });
  const main = page.locator('#data-processing-main');
  if (!(await main.isVisible().catch(() => false))) {
    await page.locator('#admin-tab-data-authorization').click({ timeout: 20_000 });
  }
  await main.waitFor({ state: 'visible', timeout: 45_000 });
}

export async function dpFlowApiRequest(
  page: Page,
  path: string,
  options?: { method?: string; data?: unknown },
) {
  return page.evaluate(
    async ({ path, method, data, token }) => {
      const res = await fetch(path, {
        method: method ?? 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body };
    },
    { path, method: options?.method, data: options?.data, token: 'dp-flow-test-token' },
  );
}

async function pickEntityFromPicker(
  dialog: Locator,
  kind: 'vehicles' | 'customers' | 'bookings',
  name: RegExp,
) {
  const picker = dialog.locator(`[data-testid="tenant-entity-picker-${kind}"]`);
  await expect(picker.getByRole('option', { name })).toBeVisible({ timeout: 15_000 });
  await picker.getByRole('option', { name }).click();
}

export async function fillInternalProcessingWizard(
  page: Page,
  code = 'PA.E2E.FLOW',
  options?: { forReview?: boolean },
) {
  await page.getByRole('button', { name: /Neuer Vorgang|New procedure/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const wizardNext = () => dialog.getByRole('button', { name: /^(Weiter|Next)$/, exact: true });

  await dialog.getByRole('button', { name: /Interne Verarbeitung|Internal processing/i }).click();
  await wizardNext().click();

  const step2 = dialog.locator('[data-testid="dp-wizard-step-2"]');
  await expect(step2).toBeVisible();
  await step2.locator('input').nth(0).fill('Fleet GPS E2E');
  await step2.locator('input').nth(1).fill(code);
  await step2.locator('textarea').first().fill('E2E purpose summary for fleet telematics processing.');
  await step2.locator('select').first().selectOption('CONTRACT');
  if (options?.forReview) {
    await step2.locator('textarea').nth(1).fill(
      'E2E necessity assessment: fleet GPS is required for live map and operational fleet visibility.',
    );
  }
  await wizardNext().click();

  const step3 = dialog.locator('[data-testid="dp-wizard-step-3"]');
  await expect(step3).toBeVisible();
  await step3.getByRole('button', { name: 'Live Map', exact: true }).click();
  await step3.getByRole('button', { name: /GPS \/ Standortdaten/i }).click();
  await step3.getByRole('button', { name: /^(Kunde|Customer)$/, exact: true }).click();
  await step3.locator('select').nth(1).selectOption('VEHICLE');
  if (options?.forReview) {
    await step3.locator('select').first().selectOption('CONTINUOUS');
  }
  await wizardNext().click();

  const step4 = dialog.locator('[data-testid="dp-wizard-step-4"]');
  await expect(step4).toBeVisible();
  await pickEntityFromPicker(dialog, 'vehicles', /E2E-OK/i);
  await pickEntityFromPicker(dialog, 'customers', /E2E Customer/i);
  await pickEntityFromPicker(dialog, 'bookings', /bk-flow-1|CONFIRMED/i);
  await wizardNext().click();

  await expect(dialog.locator('[data-testid="dp-wizard-step-5"]')).toBeVisible();
  await wizardNext().click();

  const step6 = dialog.locator('[data-testid="dp-wizard-step-6"]');
  await expect(step6).toBeVisible();
  if (options?.forReview) {
    await step6.locator('select').nth(0).selectOption('TELEMETRY');
    await step6.locator('select').nth(1).selectOption('PROCESSING_START');
    await step6.locator('select').nth(2).selectOption('HARD_DELETE');
  }
  await wizardNext().click();

  await expect(dialog.locator('[data-testid="dp-wizard-step-7"]')).toBeVisible();
}

export async function submitWizardDraft(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Als Entwurf speichern|Save as draft/i }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

export async function submitWizardForReview(page: Page) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Review anfordern|Request review/i }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}

export async function openActivityDetail(page: Page, match: string | RegExp) {
  const row = page.getByRole('row').filter({ hasText: match });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.click();
  await expect(page.getByRole('dialog').filter({ hasText: /Fleet GPS E2E|PA\./ })).toBeVisible({ timeout: 15_000 });
}

export async function runActivityLifecycleAction(
  page: Page,
  actionLabel: RegExp,
  options?: { reason?: string; scheduleDate?: string },
) {
  const drawer = page.getByRole('dialog').first();
  await drawer
    .getByRole('group', { name: /Lifecycle-Aktionen|Lifecycle actions/i })
    .getByRole('button', { name: actionLabel })
    .click();

  const confirmDialog = page.getByRole('dialog', { name: actionLabel });
  if (await confirmDialog.isVisible().catch(() => false)) {
    if (options?.reason) {
      await confirmDialog.locator('textarea').fill(options.reason);
    }
    if (options?.scheduleDate) {
      await confirmDialog.locator('input[type="datetime-local"]').fill(options.scheduleDate);
    }
    await confirmDialog.getByRole('button', { name: actionLabel }).click();
    await expect(confirmDialog).toBeHidden({ timeout: 15_000 });
  }
}

export function setFlowFlags(flags: Partial<typeof state>) {
  Object.assign(state, flags);
}

export function attachNetworkFailureLogging(page: Page) {
  page.on('requestfailed', (request) => {
    console.error(`[E2E network failed] ${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/api/v1/')) {
      console.error(`[E2E HTTP ${response.status()}] ${response.request().method()} ${response.url()}`);
    }
  });
}
