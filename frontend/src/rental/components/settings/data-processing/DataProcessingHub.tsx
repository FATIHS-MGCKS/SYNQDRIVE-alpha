import { useEffect, useState } from 'react';
import { ErrorState } from '../../../../components/patterns';
import { useRentalOrg } from '../../../RentalContext';
import { useDataProcessingPermissions } from '../../../hooks/useDataProcessingPermissions';
import type { DataProcessingSectionId } from './data-processing.constants';
import { DataProcessingPageHeader } from './DataProcessingPageHeader';
import { DataProcessingReadinessStrip } from './DataProcessingReadinessStrip';
import { DataProcessingSubNav } from './DataProcessingSubNav';
import { useDataProcessingHub } from './useDataProcessingHub';
import { ProcessingActivitiesSection } from './sections/ProcessingActivitiesSection';
import { EnforcementPoliciesSection } from './sections/EnforcementPoliciesSection';
import { ProviderAccessSection } from './sections/ProviderAccessSection';
import { ConsentsSection } from './sections/ConsentsSection';
import { PartnersProcessorsSection } from './sections/PartnersProcessorsSection';
import { AuditDecisionsSection } from './sections/AuditDecisionsSection';
import { DataProcessingWizardDialog } from './wizard/DataProcessingWizardDialog';
import { useLanguage } from '../../../i18n/LanguageContext';

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

  const [activeSection, setActiveSection] = useState<DataProcessingSectionId>(
    permissions.visibleSections[0] ?? 'activities',
  );

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
    <div className="mx-auto max-w-[1600px] space-y-5 animate-fade-up">
      <DataProcessingPageHeader
        readiness={hub.readiness}
        loading={hub.loading}
        canCreate={canOpenWizard}
        onCreate={() => setWizardOpen(true)}
      />

      <DataProcessingReadinessStrip summary={hub.readiness} loading={hub.loading} />

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
        className="surface-premium rounded-2xl border border-border/70 p-4 sm:p-5"
        aria-label={t(`dataProcessing.sections.${activeSection}`)}
      >
        {activeSection === 'activities' && permissions.canViewActivities ? (
          <ProcessingActivitiesSection
            items={hub.activities}
            loading={hub.loading}
            error={hub.sectionErrors.activities ?? null}
            onRetry={() => void hub.reload()}
          />
        ) : null}

        {activeSection === 'enforcement' && permissions.canViewEnforcement ? (
          <EnforcementPoliciesSection
            flows={hub.coverage?.flows ?? []}
            coverageVersion={hub.coverage?.coverageVersion}
            loading={hub.loading}
            error={hub.sectionErrors.enforcement ?? null}
            onRetry={() => void hub.reload()}
          />
        ) : null}

        {activeSection === 'providers' && permissions.canViewProviders ? (
          <ProviderAccessSection
            authorizations={hub.legacyAuthorizations}
            loading={hub.loading}
            error={hub.sectionErrors.providers ?? null}
            onRetry={() => void hub.reload()}
          />
        ) : null}

        {activeSection === 'consents' && permissions.canViewConsents ? (
          <ConsentsSection
            authorizations={hub.legacyAuthorizations}
            loading={hub.loading}
            error={hub.sectionErrors.consents ?? null}
            onRetry={() => void hub.reload()}
          />
        ) : null}

        {activeSection === 'partners' && permissions.canViewPartners ? (
          <PartnersProcessorsSection
            items={hub.partners}
            loading={hub.loading}
            error={hub.sectionErrors.partners ?? null}
            onRetry={() => void hub.reload()}
          />
        ) : null}

        {activeSection === 'audit' && permissions.canViewAudit ? (
          <AuditDecisionsSection
            items={hub.auditDecisions}
            loading={hub.loading}
            error={hub.sectionErrors.audit ?? null}
            onRetry={() => void hub.reload()}
          />
        ) : null}
      </section>

      {orgId ? (
        <DataProcessingWizardDialog
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          orgId={orgId}
          permissions={{
            ...permissions,
            canRequestReview: permissions.canRequestReview && (canManage ?? permissions.canRequestReview),
          }}
          onSuccess={async () => {
            await hub.reload();
            setActiveSection('activities');
          }}
        />
      ) : null}
    </div>
  );
}
