import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DataProcessingPermissions } from '../../../lib/data-processing-permissions';
import { DataProcessingHub } from './DataProcessingHub';
import { DataProcessingSubNav } from './DataProcessingSubNav';
import { ProcessingActivitiesSection } from './sections/ProcessingActivitiesSection';
import { EnforcementPoliciesSection } from './sections/EnforcementPoliciesSection';
import { ProviderAccessSection } from './sections/ProviderAccessSection';
import { ConsentsSection } from './sections/ConsentsSection';
import { PartnersProcessorsSection } from './sections/PartnersProcessorsSection';
import { AuditDecisionsSection } from './sections/AuditDecisionsSection';

const hubState = vi.hoisted(() => ({
  activities: [] as ReturnType<typeof import('./useDataProcessingHub').useDataProcessingHub>['activities'],
  coverage: null as ReturnType<typeof import('./useDataProcessingHub').useDataProcessingHub>['coverage'],
  partners: [] as ReturnType<typeof import('./useDataProcessingHub').useDataProcessingHub>['partners'],
  legacyAuthorizations: [] as ReturnType<typeof import('./useDataProcessingHub').useDataProcessingHub>['legacyAuthorizations'],
  auditDecisions: [] as ReturnType<typeof import('./useDataProcessingHub').useDataProcessingHub>['auditDecisions'],
  readiness: {
    overallTone: 'neutral',
    overallKey: 'noData',
    activitiesWithGaps: 0,
    activitiesTotal: 0,
    coverageGaps: 0,
    coverageTotal: 0,
    partnerGaps: 0,
    partnersTotal: 0,
    blockingGapLabels: [],
  } as ReturnType<
    typeof import('../../../lib/data-processing-readiness').buildDataProcessingReadinessSummary
  >,
  loading: false,
  error: null as string | null,
  sectionErrors: {} as Record<string, string>,
  reload: vi.fn(),
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

async function buildReadiness(
  input: Parameters<
    typeof import('../../../lib/data-processing-readiness').buildDataProcessingReadinessSummary
  >[0],
) {
  const { buildDataProcessingReadinessSummary } = await import(
    '../../../lib/data-processing-readiness'
  );
  return buildDataProcessingReadinessSummary(input);
}

describe('DataProcessingHub UI', () => {
  beforeEach(() => {
    hubState.loading = false;
    hubState.error = null;
    hubState.sectionErrors = {};
    hubState.activities = [];
    hubState.coverage = null;
    hubState.partners = [];
    hubState.legacyAuthorizations = [];
    hubState.auditDecisions = [];
    hubState.readiness = {
      overallTone: 'neutral',
      overallKey: 'noData',
      activitiesWithGaps: 0,
      activitiesTotal: 0,
      coverageGaps: 0,
      coverageTotal: 0,
      partnerGaps: 0,
      partnersTotal: 0,
      blockingGapLabels: [],
    };
    permissionsState.canViewHub = true;
    permissionsState.visibleSections = [
      'activities',
      'enforcement',
      'providers',
      'consents',
      'partners',
      'audit',
    ];
  });

  it('renders page header, readiness strip, disclaimer and six-section subnav', () => {
    const html = renderToStaticMarkup(<DataProcessingHub canWrite canManage />);
    expect(html).toContain('dataProcessing.title');
    expect(html).toContain('dataProcessing.wizard.createCta');
    expect(html).toContain('dataProcessing.subtitle');
    expect(html).toContain('dataProcessing.disclaimer');
    expect(html).toContain('dataProcessing.readiness.overall');
    expect(html).toContain('dataProcessing.sections.activities');
    expect(html).toContain('dataProcessing.sections.audit');
    expect(html).not.toContain('DSGVO-konform');
  });

  it('renders loading skeleton in active section', () => {
    hubState.loading = true;
    const html = renderToStaticMarkup(<DataProcessingHub />);
    expect(html).toContain('dataProcessing.status.loading');
    expect(html).toContain('animate-pulse');
  });

  it('renders global error with retry', () => {
    hubState.error = 'Network failed';
    const html = renderToStaticMarkup(<DataProcessingHub />);
    expect(html).toContain('dataProcessing.error.global');
    expect(html).toContain('Network failed');
  });

  it('renders forbidden state when hub permission is missing', () => {
    permissionsState.canViewHub = false;
    const html = renderToStaticMarkup(<DataProcessingHub />);
    expect(html).toContain('dataProcessing.error.forbidden.title');
    expect(html).not.toContain('dataProcessing.sections.activities');
  });

  it('shows blocking readiness tone without false green compliance claim', async () => {
    hubState.readiness = await buildReadiness({
      activities: [
        {
          id: 'a1',
          activityCode: 'PA-1',
          title: 'Test',
          status: 'ACTIVE',
          versionNumber: 1,
          isCurrentVersion: true,
          dpiaStatus: 'NOT_REQUIRED',
          hasBlockingGaps: true,
          completeness: { status: 'INCOMPLETE', blockingGaps: ['LEGAL_BASIS'] },
          runtimeCoverage: null,
          updatedAt: '2026-07-24T00:00:00.000Z',
        },
      ],
      coverage: {
        coverageVersion: 'v1',
        gitCommit: null,
        buildVersion: null,
        evaluatedAt: '2026-07-24T00:00:00.000Z',
        totalFlows: 2,
        enforcedCount: 1,
        notImplementedCount: 1,
        enforcementErrorCount: 0,
        partiallyEnforcedCount: 0,
        fullyProtected: false,
        flows: [],
      },
      partners: [],
      legacyAuthorizations: [],
    });
    const html = renderToStaticMarkup(<DataProcessingHub />);
    expect(html).toContain('dataProcessing.readiness.overall.blockingGaps');
    expect(html).not.toContain('dataProcessing.readiness.overall.traceable');
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
    expect(html).toContain('dataProcessing.sections.enforcement');
    expect(html).not.toContain('dataProcessing.sections.providers');
  });
});

describe('Data processing section states', () => {
  it('ProcessingActivitiesSection renders empty state', () => {
    const html = renderToStaticMarkup(
      <ProcessingActivitiesSection items={[]} loading={false} error={null} />,
    );
    expect(html).toContain('dataProcessing.activities.empty.title');
  });

  it('ProcessingActivitiesSection renders error state', () => {
    const html = renderToStaticMarkup(
      <ProcessingActivitiesSection items={[]} loading={false} error="403 Forbidden" onRetry={() => {}} />,
    );
    expect(html).toContain('dataProcessing.error.section');
    expect(html).toContain('403 Forbidden');
  });

  it('ProcessingActivitiesSection renders activity code not UUID as primary label', () => {
    const html = renderToStaticMarkup(
      <ProcessingActivitiesSection
        items={[
          {
            id: '00000000-0000-0000-0000-000000000099',
            activityCode: 'PA-FLEET',
            title: 'Fleet processing',
            status: 'ACTIVE',
            versionNumber: 2,
            isCurrentVersion: true,
            dpiaStatus: 'NOT_REQUIRED',
            hasBlockingGaps: false,
            completeness: { status: 'COMPLETE', blockingGaps: [] },
            runtimeCoverage: null,
            updatedAt: '2026-07-24T00:00:00.000Z',
          },
        ]}
        loading={false}
      />,
    );
    expect(html).toContain('Fleet processing');
    expect(html).toContain('PA-FLEET');
    expect(html).not.toContain('00000000-0000-0000-0000-000000000099');
  });

  it('EnforcementPoliciesSection renders coverage rows', () => {
    const html = renderToStaticMarkup(
      <EnforcementPoliciesSection
        flows={[
          {
            flowId: 'flow-1',
            flowName: 'DIMO telemetry export',
            sourceSystem: 'DIMO',
            status: 'ENFORCED',
            runtimeHealth: 'OK',
            missingEnforcementPoints: [],
            lastVerifiedAt: '2026-07-24T00:00:00.000Z',
          },
        ]}
        coverageVersion="2026.07.24"
        loading={false}
      />,
    );
    expect(html).toContain('DIMO telemetry export');
    expect(html).toContain('dataProcessing.enforcement.version:2026.07.24');
  });

  it('ProviderAccessSection filters provider authorizations', () => {
    const html = renderToStaticMarkup(
      <ProviderAccessSection
        authorizations={[
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
            dataCategories: [],
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
          {
            id: 'c1',
            organizationId: 'org',
            title: 'Customer consent',
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
        ]}
        loading={false}
      />,
    );
    expect(html).toContain('DIMO provider');
    expect(html).not.toContain('Customer consent');
  });

  it('ConsentsSection excludes provider authorizations', () => {
    const html = renderToStaticMarkup(
      <ConsentsSection
        authorizations={[
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
        ]}
        loading={false}
      />,
    );
    expect(html).toContain('Marketing consent');
  });

  it('PartnersProcessorsSection renders processor name', () => {
    const html = renderToStaticMarkup(
      <PartnersProcessorsSection
        items={[
          {
            id: 'dpa-1',
            processorName: 'Stripe Payments',
            status: 'ACTIVE',
            versionNumber: 3,
            contractReference: 'AVV-2026',
            transferAssessmentStatus: 'ASSESSED',
          },
        ]}
        loading={false}
      />,
    );
    expect(html).toContain('Stripe Payments');
    expect(html).toContain('AVV-2026');
  });

  it('AuditDecisionsSection renders empty state', () => {
    const html = renderToStaticMarkup(
      <AuditDecisionsSection items={[]} loading={false} error={null} />,
    );
    expect(html).toContain('dataProcessing.audit.empty.title');
  });
});
