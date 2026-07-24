import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LifecycleActionDialog } from './detail/LifecycleActionDialog';
import { LifecycleActionFooter } from './detail/shared/LifecycleActionFooter';
import { FourEyesBanner } from './detail/shared/FourEyesBanner';
import { LifecycleBlockersPanel } from './detail/shared/LifecycleBlockersPanel';
import { ProcessingActivityDetailDrawer } from './detail/ProcessingActivityDetailDrawer';

vi.mock('../../../RentalContext', () => ({
  useRentalOrg: () => ({ orgId: 'org-1', hasPermission: () => true }),
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

const apiMock = vi.hoisted(() => ({
  register: {
    get: vi.fn(),
    versions: vi.fn(),
  },
  review: { getCycle: vi.fn() },
}));

vi.mock('../../../../lib/api', () => ({
  api: { dataProcessing: apiMock },
}));

vi.mock('../../../../components/patterns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../components/patterns')>();
  return {
    ...actual,
    FormDialog: ({
      title,
      description,
      children,
      footer,
    }: {
      title: React.ReactNode;
      description?: React.ReactNode;
      children: React.ReactNode;
      footer?: React.ReactNode;
    }) => (
      <div>
        <div>{title}</div>
        <div>{description}</div>
        {children}
        {footer}
      </div>
    ),
    DetailDrawer: ({
      title,
      description,
      children,
      footer,
      status,
    }: {
      title: React.ReactNode;
      description?: React.ReactNode;
      children: React.ReactNode;
      footer?: React.ReactNode;
      status?: React.ReactNode;
    }) => (
      <div>
        <div>{title}</div>
        <div>{description}</div>
        <div>{status}</div>
        {children}
        {footer}
      </div>
    ),
  };
});

describe('data-processing detail views', () => {
  beforeEach(() => {
    apiMock.register.get.mockReset();
    apiMock.register.versions.mockReset();
    apiMock.review.getCycle.mockReset();
  });

  it('renders lifecycle action dialog with mandatory revoke reason field', () => {
    const html = renderToStaticMarkup(
      <LifecycleActionDialog
        open
        onOpenChange={() => {}}
        action="revoke"
        onConfirm={() => {}}
      />,
    );
    expect(html).toContain('dataProcessing.lifecycle.revoke');
    expect(html).toContain('dataProcessing.lifecycle.revokeImpact');
    expect(html).toContain('dataProcessing.lifecycle.separatesFrom');
    expect(html).toContain('textarea');
    expect(html).toContain('aria-required="true"');
  });

  it('renders reject dialog separately from revoke', () => {
    const html = renderToStaticMarkup(
      <LifecycleActionDialog
        open
        onOpenChange={() => {}}
        action="reject"
        onConfirm={() => {}}
      />,
    );
    expect(html).toContain('dataProcessing.lifecycle.reject');
    expect(html).toContain('dataProcessing.lifecycle.rejectImpact');
  });

  it('renders four-eyes banner when required', () => {
    const html = renderToStaticMarkup(
      <FourEyesBanner fourEyesRequired reviewCycleStatus="IN_PROGRESS" />,
    );
    expect(html).toContain('dataProcessing.detail.fourEyes.title');
    expect(html).toContain('role="status"');
  });

  it('renders DPIA and DPA blockers', () => {
    const html = renderToStaticMarkup(
      <LifecycleBlockersPanel
        dpiaStatus="REQUIRED_NOT_DONE"
        dpaBlockers={['Missing SCC']}
        blockingGaps={['legal_basis']}
      />,
    );
    expect(html).toContain('dataProcessing.detail.blockers.dpia');
    expect(html).toContain('dataProcessing.detail.blockers.dpa');
    expect(html).toContain('Missing SCC');
  });

  it('renders lifecycle footer actions', () => {
    const html = renderToStaticMarkup(
      <LifecycleActionFooter
        actions={['approve', 'reject', 'revoke']}
        onAction={() => {}}
      />,
    );
    expect(html).toContain('dataProcessing.lifecycle.approve');
    expect(html).toContain('dataProcessing.lifecycle.reject');
    expect(html).toContain('dataProcessing.lifecycle.revoke');
  });

  it('renders processing activity detail with not-editable notice for active record', async () => {
    apiMock.register.get.mockResolvedValue({
      id: 'act-1',
      activityCode: 'PA-001',
      title: 'Fleet telemetry',
      status: 'ACTIVE',
      versionNumber: 2,
      isCurrentVersion: true,
      dpiaStatus: 'NOT_REQUIRED',
      hasBlockingGaps: false,
      completeness: { status: 'COMPLETE', blockingGaps: [] },
      runtimeCoverage: { enforcedFlows: 3, totalFlows: 4 },
      updatedAt: new Date().toISOString(),
      dataCategories: ['LOCATION'],
      legalBasisAssessments: [],
      enforcementPolicies: [],
      processors: [],
    });
    apiMock.register.versions.mockResolvedValue([
      {
        id: 'act-1',
        versionNumber: 2,
        isCurrentVersion: true,
        status: 'ACTIVE',
        title: 'Fleet telemetry',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const html = renderToStaticMarkup(
      <ProcessingActivityDetailDrawer
        activityId="act-1"
        orgId="org-1"
        open
        onOpenChange={() => {}}
        canManage
      />,
    );
    expect(html).toContain('dataProcessing.detail.loading');
  });

  it('mobile: lifecycle footer uses wrap layout classes', () => {
    const html = renderToStaticMarkup(
      <LifecycleActionFooter actions={['activate']} onAction={() => {}} />,
    );
    expect(html).toContain('flex-wrap');
  });
});
