import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DataProcessingPermissions } from '../../../lib/data-processing-permissions';
import type { PaginatedListResult } from '../../../lib/useDataProcessingSectionList';
import type { ProcessingActivityRegisterListItem } from '../../../../lib/api';
import { DataProcessingHub } from './DataProcessingHub';
import { DataProcessingKpiStrip } from './DataProcessingKpiStrip';
import { DataProcessingSubNav } from './DataProcessingSubNav';
import { ProcessingActivitiesSection } from './sections/ProcessingActivitiesSection';
import { EnforcementPoliciesSection } from './sections/EnforcementPoliciesSection';
import { ProviderAccessSection } from './sections/ProviderAccessSection';
import { ConsentsSection } from './sections/ConsentsSection';
import { PartnersProcessorsSection } from './sections/PartnersProcessorsSection';
import { AuditDecisionsSection } from './sections/AuditDecisionsSection';

const hubState = vi.hoisted(() => ({
  metrics: {
    activeProcessingActivities: 0,
    blockingControlGaps: 0,
    reviewsDue: 0,
    revocationsInProgress: 0,
    enforcementErrors: 0,
    dpiaOverdue: 0,
    legacy: {
      total: 0,
      active: 0,
      pending: 0,
      revoked: 0,
      expired: 0,
      highRisk: 0,
      expiringSoon: 0,
    },
  },
  coverage: null as ReturnType<typeof import('./useDataProcessingHub').useDataProcessingHub>['coverage'],
  partners: [] as ReturnType<typeof import('./useDataProcessingHub').useDataProcessingHub>['partners'],
  loading: false,
  error: null as string | null,
  sectionErrors: {} as Record<string, string>,
  reload: vi.fn(),
}));

const listMock = vi.hoisted(() => ({
  items: [] as ProcessingActivityRegisterListItem[],
  nextCursor: null as string | null,
  loading: false,
  error: null as string | null,
  reload: vi.fn(),
  loadMore: vi.fn(),
  filters: {
    q: '',
    status: '',
    kpi: null,
    riskLevel: '',
    dataCategory: '',
    sort: 'updatedAt',
    dir: 'desc' as const,
    cursor: null,
    limit: 25,
  },
  setFilters: vi.fn(),
  resetFilters: vi.fn(),
}));

const auditListMock = vi.hoisted(() => ({
  items: [],
  nextCursor: null,
  loading: false,
  error: null,
  reload: vi.fn(),
  loadMore: vi.fn(),
}));

const permissionsState = vi.hoisted(() => ({
  canViewHub: true,
  canViewActivities: true,
  canViewEnforcement: true,
  canViewProviders: true,
  canViewConsents: true,
  canViewPartners: true,
  canViewAudit: true,
  canCreateAny: true,
  canCreateInternal: true,
  canCreateProvider: true,
  canCreatePartnerSharing: true,
  canCreateConsent: true,
  canCreateProcessor: true,
  canRequestReview: true,
  visibleSections: [
    'activities',
    'enforcement',
    'providers',
    'consents',
    'partners',
    'audit',
  ] as DataProcessingPermissions['visibleSections'],
}));

vi.mock('../../../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-test', hasPermission: () => true }),
}));

vi.mock('../../../hooks/useDataProcessingPermissions', () => ({
  useDataProcessingPermissions: () => permissionsState,
}));

vi.mock('../../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      if (params) return `${key}:${Object.values(params).join(',')}`;
      return key;
    },
  }),
}));

vi.mock('./useDataProcessingHub', () => ({
  useDataProcessingHub: () => hubState,
}));

vi.mock('../../../lib/useDataProcessingSectionList', () => ({
  useDataProcessingSectionList: () => listMock,
  buildRegisterFetcher: () => vi.fn(),
  buildLegacyFetcher: () => vi.fn(),
}));

vi.mock('../../../lib/useAuditDecisionsList', () => ({
  useAuditDecisionsList: () => auditListMock,
}));

function makeList<T>(items: T[]): PaginatedListResult<T> {
  return {
    items,
    nextCursor: null,
    loading: false,
    error: null,
    reload: vi.fn(),
    loadMore: vi.fn(),
    filters: listMock.filters,
    setFilters: vi.fn(),
    resetFilters: vi.fn(),
  };
}

describe('DataProcessingHub UI', () => {
  beforeEach(() => {
    hubState.loading = false;
    hubState.error = null;
    hubState.sectionErrors = {};
    hubState.metrics = {
      activeProcessingActivities: 0,
      blockingControlGaps: 0,
      reviewsDue: 0,
      revocationsInProgress: 0,
      enforcementErrors: 0,
      dpiaOverdue: 0,
      legacy: {
        total: 0,
        active: 0,
        pending: 0,
        revoked: 0,
        expired: 0,
        highRisk: 0,
        expiringSoon: 0,
      },
    };
    hubState.coverage = null;
    hubState.partners = [];
    listMock.items = [];
    listMock.loading = false;
    permissionsState.canViewHub = true;
  });

  it('renders page header, KPI strip, disclaimer and six-section subnav', () => {
    const html = renderToStaticMarkup(<DataProcessingHub canWrite canManage />);
    expect(html).toContain('dataProcessing.title');
    expect(html).toContain('dataProcessing.wizard.createCta');
    expect(html).toContain('dataProcessing.kpi.active_activities');
    expect(html).toContain('dataProcessing.sections.audit');
    expect(html).not.toContain('DSGVO-konform');
  });

  it('renders global error with retry', () => {
    hubState.error = 'Network failed';
    const html = renderToStaticMarkup(<DataProcessingHub />);
    expect(html).toContain('dataProcessing.error.global');
    expect(html).toContain('Network failed');
  });

  it('shows blocking readiness tone from hub metrics', () => {
    hubState.metrics = {
      ...hubState.metrics,
      activeProcessingActivities: 2,
      blockingControlGaps: 1,
      enforcementErrors: 1,
    };
    hubState.coverage = {
      coverageVersion: 'v1',
      gitCommit: null,
      buildVersion: null,
      evaluatedAt: '2026-07-24T00:00:00.000Z',
      totalFlows: 2,
      enforcedCount: 1,
      notImplementedCount: 1,
      enforcementErrorCount: 1,
      partiallyEnforcedCount: 0,
      fullyProtected: false,
      flows: [],
    };
    const html = renderToStaticMarkup(<DataProcessingHub />);
    expect(html).toContain('dataProcessing.readiness.overall.blockingGaps');
  });
});

describe('DataProcessingKpiStrip UI', () => {
  it('renders activity KPI labels', () => {
    const html = renderToStaticMarkup(
      <DataProcessingKpiStrip metrics={null} section="activities" />,
    );
    expect(html).toContain('dataProcessing.kpi.blocking_gaps');
    expect(html).toContain('dataProcessing.kpi.dpia_overdue');
  });

  it('renders legacy KPI labels for provider section', () => {
    const html = renderToStaticMarkup(
      <DataProcessingKpiStrip
        metrics={{
          activeProcessingActivities: 0,
          blockingControlGaps: 0,
          reviewsDue: 0,
          revocationsInProgress: 0,
          enforcementErrors: 0,
          dpiaOverdue: 0,
          legacy: {
            total: 4,
            active: 2,
            pending: 1,
            revoked: 1,
            expired: 0,
            highRisk: 1,
            expiringSoon: 1,
          },
        }}
        section="providers"
      />,
    );
    expect(html).toContain('dataProcessing.kpi.legacy_expiring_soon');
    expect(html).toContain('dataProcessing.kpi.legacy_high_risk');
  });
});

describe('DataProcessingSubNav UI', () => {
  it('renders only visible sections as tabs', () => {
    const html = renderToStaticMarkup(
      <DataProcessingSubNav
        active="activities"
        onChange={() => {}}
        visibleSections={['activities', 'enforcement', 'audit']}
      />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('dataProcessing.sections.activities');
    expect(html).not.toContain('dataProcessing.sections.providers');
  });
});

describe('Data processing section states', () => {
  it('ProcessingActivitiesSection renders empty state', () => {
    const html = renderToStaticMarkup(
      <ProcessingActivitiesSection list={makeList([])} />,
    );
    expect(html).toContain('dataProcessing.activities.empty.title');
  });

  it('ProcessingActivitiesSection renders activity code not UUID as primary label', () => {
    const html = renderToStaticMarkup(
      <ProcessingActivitiesSection
        list={makeList([
          {
            id: '00000000-0000-0000-0000-000000000099',
            activityCode: 'PA-FLEET',
            title: 'Fleet processing',
            status: 'ACTIVE',
            versionNumber: 2,
            isCurrentVersion: true,
            dpiaStatus: 'NOT_REQUIRED',
            hasBlockingGaps: false,
            dataCategories: ['GPS_LOCATION'],
            completeness: { status: 'COMPLETE', blockingGaps: [] },
            runtimeCoverage: null,
            updatedAt: '2026-07-24T00:00:00.000Z',
          },
        ])}
      />,
    );
    expect(html).toContain('Fleet processing');
    expect(html).toContain('PA-FLEET');
  });

  it('EnforcementPoliciesSection filters enforcement errors only', () => {
    const html = renderToStaticMarkup(
      <EnforcementPoliciesSection
        flows={[
          {
            flowId: 'flow-1',
            flowName: 'Healthy flow',
            sourceSystem: 'DIMO',
            status: 'ENFORCED',
            runtimeHealth: 'OK',
            missingEnforcementPoints: [],
            lastVerifiedAt: '2026-07-24T00:00:00.000Z',
          },
          {
            flowId: 'flow-2',
            flowName: 'Broken flow',
            sourceSystem: 'API',
            status: 'ENFORCEMENT_ERROR',
            runtimeHealth: 'ERROR',
            missingEnforcementPoints: ['deny-switch'],
            lastVerifiedAt: '2026-07-24T00:00:00.000Z',
          },
        ]}
        enforcementErrorsOnly
        loading={false}
      />,
    );
    expect(html).toContain('Broken flow');
    expect(html).not.toContain('Healthy flow');
  });

  it('ProviderAccessSection renders provider rows from paginated list', () => {
    const html = renderToStaticMarkup(
      <ProviderAccessSection
        list={makeList([
          {
            id: 'p1',
            organizationId: 'org',
            title: 'DIMO provider',
            description: null,
            requestingEntity: 'Org',
            moduleOrigin: 'dimo',
            purpose: 'Telemetry',
            purposes: [],
            sourceType: 'SYSTEM',
            processorType: 'DIMO',
            processorName: 'DIMO',
            scope: 'Fleet',
            scopeKey: 'fleet',
            dataCategories: ['TELEMETRY_DATA'],
            destination: 'EU',
            vehicleIds: null,
            vehicleCount: 1,
            customerIds: [],
            bookingIds: [],
            accessPattern: 'API',
            accessPatternKey: 'api',
            status: 'Active',
            statusKey: 'ACTIVE',
            riskLevel: 'Low',
            riskLevelKey: 'LOW',
            systemKey: 'dimo',
            isSystemGenerated: true,
            lastAccessAt: null,
            accessCount: 0,
            revokeReason: null,
            grantedById: null,
            grantedByName: null,
            grantedAt: null,
            revokedById: null,
            revokedByName: null,
            revokedAt: null,
            expiresAt: null,
            notes: null,
            scopeNote: null,
            lastSyncedAt: '2026-07-24T00:00:00.000Z',
            createdAt: '2026-07-24T00:00:00.000Z',
            updatedAt: '2026-07-24T00:00:00.000Z',
          },
        ])}
      />,
    );
    expect(html).toContain('DIMO provider');
  });

  it('ConsentsSection renders consent rows', () => {
    const html = renderToStaticMarkup(
      <ConsentsSection
        list={makeList([
          {
            id: 'c1',
            organizationId: 'org',
            title: 'Marketing consent',
            description: null,
            requestingEntity: 'Org',
            moduleOrigin: 'rental',
            purpose: 'Marketing',
            purposes: [],
            sourceType: null,
            processorType: null,
            processorName: null,
            scope: 'Customers',
            scopeKey: 'customers',
            dataCategories: [],
            destination: 'EU',
            vehicleIds: null,
            vehicleCount: 0,
            customerIds: ['cust-1'],
            bookingIds: [],
            accessPattern: 'Manual',
            accessPatternKey: 'manual',
            status: 'Active',
            statusKey: 'ACTIVE',
            riskLevel: 'Low',
            riskLevelKey: 'LOW',
            systemKey: null,
            isSystemGenerated: false,
            lastAccessAt: null,
            accessCount: 0,
            revokeReason: null,
            grantedById: null,
            grantedByName: null,
            grantedAt: null,
            revokedById: null,
            revokedByName: null,
            revokedAt: null,
            expiresAt: null,
            notes: null,
            scopeNote: null,
            lastSyncedAt: '2026-07-24T00:00:00.000Z',
            createdAt: '2026-07-24T00:00:00.000Z',
            updatedAt: '2026-07-24T00:00:00.000Z',
          },
        ])}
        filterFn={() => true}
      />,
    );
    expect(html).toContain('Marketing consent');
  });

  it('AuditDecisionsSection renders empty state', () => {
    const html = renderToStaticMarkup(
      <AuditDecisionsSection items={[]} loading={false} error={null} />,
    );
    expect(html).toContain('dataProcessing.audit.empty.title');
  });
});
