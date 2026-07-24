import { useEffect, useMemo, useState } from 'react';
import { ErrorState } from '../../../../components/patterns';
import { api, type DataAuthorizationDto } from '../../../../lib/api';
import type { DataProcessingDetailTarget } from '../../../lib/data-processing-detail.types';
import type { DataProcessingKpiKey } from '../../../lib/data-processing-list-state';
import { readDataProcessingFiltersFromUrl } from '../../../lib/data-processing-list-state';
import { buildDataProcessingReadinessFromMetrics } from '../../../lib/data-processing-readiness';
import {
  buildLegacyFetcher,
  buildRegisterFetcher,
  useDataProcessingSectionList,
} from '../../../lib/useDataProcessingSectionList';
import { useRentalOrg } from '../../../RentalContext';
import { useDataProcessingPermissions } from '../../../hooks/useDataProcessingPermissions';
import type { DataProcessingSectionId } from './data-processing.constants';
import { DATA_PROCESSING_MAIN_ID, DP_SECTION_PANEL_ID, DP_SECTION_TAB_ID } from './data-processing-a11y';
import { DataProcessingActiveFilters } from './DataProcessingActiveFilters';
import { DataProcessingDetailHost } from './detail/DataProcessingDetailHost';
import { DataProcessingKpiStrip } from './DataProcessingKpiStrip';
import { DataProcessingPageHeader } from './DataProcessingPageHeader';
import { DataProcessingSubNav } from './DataProcessingSubNav';
import { useDataProcessingHub } from './useDataProcessingHub';
import { ProcessingActivitiesSection } from './sections/ProcessingActivitiesSection';
import { EnforcementPoliciesSection } from './sections/EnforcementPoliciesSection';
import { ProviderAccessSection } from './sections/ProviderAccessSection';
import { ConsentsSection } from './sections/ConsentsSection';
import { PartnersProcessorsSection } from './sections/PartnersProcessorsSection';
import { AuditDecisionsSection } from './sections/AuditDecisionsSection';
import { DataProcessingSavedViews } from './DataProcessingSavedViews';
import { useAuditDecisionsList } from '../../../lib/useAuditDecisionsList';
import { DataProcessingWizardDialog } from './wizard/DataProcessingWizardDialog';
import { useLanguage } from '../../../i18n/LanguageContext';
import { isProviderAuthorization } from './sections/ProviderAccessSection';

interface Props {
  canWrite?: boolean;
  canManage?: boolean;
}

export function DataProcessingHub({ canWrite, canManage }: Props) {
  const { orgId } = useRentalOrg();
  const permissions = useDataProcessingPermissions();
  const { t } = useLanguage();
  const hub = useDataProcessingHub(orgId, permissions);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<DataProcessingDetailTarget | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [legacyAuth, setLegacyAuth] = useState<DataAuthorizationDto | null>(null);
  const [legacyActionLoading, setLegacyActionLoading] = useState(false);
  const [enforcementErrorsOnly, setEnforcementErrorsOnly] = useState(false);

  const [activeSection, setActiveSection] = useState<DataProcessingSectionId>(
    permissions.visibleSections[0] ?? 'activities',
  );

  const urlFilters = useMemo(() => readDataProcessingFiltersFromUrl(), []);

  const activitiesList = useDataProcessingSectionList({
    orgId,
    enabled: activeSection === 'activities' && permissions.canViewActivities,
    initialFilters: urlFilters,
    syncUrl: true,
    fetchPage: buildRegisterFetcher(),
  });

  const providersList = useDataProcessingSectionList({
    orgId,
    enabled: activeSection === 'providers' && permissions.canViewProviders,
    initialFilters: urlFilters,
    syncUrl: true,
    fetchPage: async (orgId, filters) => {
      const result = await buildLegacyFetcher()(orgId, filters);
      return {
        items: result.items.filter(isProviderAuthorization),
        nextCursor: result.nextCursor,
      };
    },
  });

  const consentsList = useDataProcessingSectionList({
    orgId,
    enabled: activeSection === 'consents' && permissions.canViewConsents,
    initialFilters: urlFilters,
    syncUrl: true,
    fetchPage: buildLegacyFetcher(),
  });

  const readiness = useMemo(
    () =>
      buildDataProcessingReadinessFromMetrics({
        metrics: hub.metrics,
        coverage: hub.coverage,
        partners: hub.partners,
      }),
    [hub.metrics, hub.coverage, hub.partners],
  );

  const auditList = useAuditDecisionsList({
    orgId,
    enabled: activeSection === 'audit' && permissions.canViewAudit,
    limit: 25,
  });

  const kpiSection =
    activeSection === 'providers' || activeSection === 'consents'
      ? activeSection
      : activeSection === 'enforcement'
        ? 'enforcement'
        : 'activities';

  const activeList =
    activeSection === 'activities'
      ? activitiesList
      : activeSection === 'providers'
        ? providersList
        : activeSection === 'consents'
          ? consentsList
          : null;

  const handleKpiClick = (kpi: DataProcessingKpiKey) => {
    if (activeSection === 'enforcement' && kpi === 'enforcement_errors') {
      setEnforcementErrorsOnly((prev) => !prev);
      return;
    }
    if (!activeList) return;
    activeList.setFilters({
      kpi: activeList.filters.kpi === kpi ? null : kpi,
      status: '',
      riskLevel: '',
      dataCategory: '',
    });
  };

  const openDetail = (target: DataProcessingDetailTarget) => {
    setDetailTarget(target);
    setDetailOpen(true);
    if (target.kind === 'legacy-authorization' && orgId) {
      const pool = [...providersList.items, ...consentsList.items];
      const found = pool.find((a) => a.id === target.id) ?? null;
      setLegacyAuth(found);
      if (!found) {
        void api.dataAuthorizations.get(orgId, target.id).then(setLegacyAuth).catch(() => setLegacyAuth(null));
      }
    }
  };

  const handleLegacyGrant = async () => {
    if (!orgId || !legacyAuth) return;
    setLegacyActionLoading(true);
    try {
      const updated = await api.dataAuthorizations.grant(orgId, legacyAuth.id);
      setLegacyAuth(updated);
      await Promise.all([hub.reload(), providersList.reload(), consentsList.reload()]);
    } finally {
      setLegacyActionLoading(false);
    }
  };

  const handleLegacyRevoke = async () => {
    if (!orgId || !legacyAuth) return;
    setLegacyActionLoading(true);
    try {
      const updated = await api.dataAuthorizations.revoke(orgId, legacyAuth.id, {
        reason: t('dataProcessing.lifecycle.revokeFromDetail'),
      });
      setLegacyAuth(updated);
      await Promise.all([hub.reload(), providersList.reload(), consentsList.reload()]);
    } finally {
      setLegacyActionLoading(false);
    }
  };

  useEffect(() => {
    if (!permissions.visibleSections.includes(activeSection)) {
      setActiveSection(permissions.visibleSections[0] ?? 'activities');
    }
  }, [activeSection, permissions.visibleSections]);

  const canOpenWizard =
    permissions.canCreateAny && (canWrite ?? permissions.canCreateAny) && Boolean(orgId);

  if (!permissions.canViewHub) {
    return (
      <ErrorState
        title={t('dataProcessing.error.forbidden.title')}
        description={t('dataProcessing.error.forbidden.description')}
      />
    );
  }

  return (
    <div
      id={DATA_PROCESSING_MAIN_ID}
      className="mx-auto max-w-[1600px] space-y-5 motion-safe:animate-fade-up"
      data-testid="data-processing-main"
    >
      <DataProcessingPageHeader
        readiness={readiness}
        loading={hub.loading}
        canCreate={canOpenWizard}
        onCreate={() => setWizardOpen(true)}
      />

      <DataProcessingKpiStrip
        metrics={hub.metrics}
        loading={hub.loading}
        section={kpiSection}
        activeKpi={
          activeSection === 'enforcement' && enforcementErrorsOnly
            ? 'enforcement_errors'
            : activeList?.filters.kpi ?? null
        }
        onKpiClick={
          activeList || activeSection === 'enforcement' ? handleKpiClick : undefined
        }
      />

      {activeList && orgId ? (
        <DataProcessingSavedViews
          orgId={orgId}
          section={
            activeSection === 'providers'
              ? 'providers'
              : activeSection === 'consents'
                ? 'consents'
                : 'activities'
          }
          filters={activeList.filters}
          onApply={(patch) => activeList.setFilters(patch)}
        />
      ) : null}

      {activeList ? (
        <DataProcessingActiveFilters filters={activeList.filters} onClear={activeList.resetFilters} />
      ) : null}

      <p className="text-[11px] leading-relaxed text-muted-foreground">{t('dataProcessing.disclaimer')}</p>

      {hub.error && !hub.loading ? (
        <ErrorState
          title={t('dataProcessing.error.global')}
          description={hub.error}
          onRetry={() => void hub.reload()}
        />
      ) : null}

      <DataProcessingSubNav
        active={activeSection}
        onChange={setActiveSection}
        visibleSections={permissions.visibleSections}
      />

      <section
        role="tabpanel"
        id={DP_SECTION_PANEL_ID[activeSection]}
        aria-labelledby={DP_SECTION_TAB_ID[activeSection]}
        tabIndex={0}
        className="surface-premium rounded-2xl border border-border/70 p-4 sm:p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)] focus-visible:ring-offset-2"
      >
        {activeSection === 'activities' && permissions.canViewActivities ? (
          <ProcessingActivitiesSection
            list={activitiesList}
            onRowClick={(row) => openDetail({ kind: 'processing-activity', id: row.id })}
          />
        ) : null}

        {activeSection === 'enforcement' && permissions.canViewEnforcement ? (
          <EnforcementPoliciesSection
            flows={hub.coverage?.flows ?? []}
            coverageVersion={hub.coverage?.coverageVersion}
            loading={hub.loading}
            error={hub.sectionErrors.enforcement ?? null}
            onRetry={() => void hub.reload()}
            enforcementErrorsOnly={enforcementErrorsOnly}
          />
        ) : null}

        {activeSection === 'providers' && permissions.canViewProviders ? (
          <ProviderAccessSection
            list={providersList}
            onRowClick={(row) => openDetail({ kind: 'legacy-authorization', id: row.id })}
          />
        ) : null}

        {activeSection === 'consents' && permissions.canViewConsents ? (
          <ConsentsSection
            list={consentsList}
            filterFn={(a) => !isProviderAuthorization(a)}
            onRowClick={(row) => openDetail({ kind: 'legacy-authorization', id: row.id })}
          />
        ) : null}

        {activeSection === 'partners' && permissions.canViewPartners ? (
          <PartnersProcessorsSection
            items={hub.partners}
            loading={hub.loading}
            error={hub.sectionErrors.partners ?? null}
            onRetry={() => void hub.reload()}
            onRowClick={(row) => openDetail({ kind: 'dpa', id: row.id })}
          />
        ) : null}

        {activeSection === 'audit' && permissions.canViewAudit ? (
          <AuditDecisionsSection
            items={auditList.items}
            loading={auditList.loading}
            error={auditList.error}
            onRetry={() => void auditList.reload()}
            nextCursor={auditList.nextCursor}
            onLoadMore={() => void auditList.loadMore()}
            itemCount={auditList.items.length}
          />
        ) : null}
      </section>

      {orgId ? (
        <>
          <DataProcessingWizardDialog
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            orgId={orgId}
            permissions={{
              ...permissions,
              canRequestReview: permissions.canRequestReview && (canManage ?? permissions.canRequestReview),
            }}
            onSuccess={async () => {
              await Promise.all([hub.reload(), activitiesList.reload()]);
              setActiveSection('activities');
            }}
          />
          <DataProcessingDetailHost
            target={detailTarget}
            orgId={orgId}
            open={detailOpen}
            onOpenChange={setDetailOpen}
            canManage={canManage ?? permissions.canRequestReview}
            onUpdated={() => void Promise.all([hub.reload(), activitiesList.reload()])}
            legacyAuth={legacyAuth}
            legacyActionLoading={legacyActionLoading}
            onLegacyGrant={() => void handleLegacyGrant()}
            onLegacyRevoke={() => void handleLegacyRevoke()}
            onNavigate={(t) => openDetail(t)}
          />
        </>
      ) : null}
    </div>
  );
}
