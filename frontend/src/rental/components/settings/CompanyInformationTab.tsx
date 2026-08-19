import { Loader2, Pencil } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ErrorState,
  PageHeader,
  SkeletonCard,
  StatusChip,
} from '../../../components/patterns';
import { Button } from '../../../components/ui/button';
import { isMasterAdmin } from '../../../lib/auth';
import { useRentalOrg } from '../../RentalContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { CompanySetupChecklist } from './company/CompanySetupChecklist';
import { CompanySectionTabBar } from './company/CompanySectionTabBar';
import {
  CompanyBasisSection,
  CompanyBrandingSection,
  CompanyContactSection,
  CompanyDocumentsSection,
  CompanyHistorySection,
  CompanyTaxSection,
} from './company/CompanySections';
import {
  cloneDraft,
  computeSetupChecklist,
  draftFromProfile,
  isDraftDirty,
  getReadinessLabel,
  overallReadiness,
  validateCompanyDraft,
  type CompanyDraft,
  type CompanySection,
} from './company/company-utils';
import { useCompanyCenter } from './company/useCompanyCenter';

const READINESS_TONE: Record<
  ReturnType<typeof overallReadiness>,
  'success' | 'warning' | 'neutral'
> = {
  ready: 'success',
  incomplete: 'warning',
  review: 'neutral',
};

interface CompanyInformationTabProps {
  onNavigateToLegalDocuments?: () => void;
  onNavigateToStations?: () => void;
}

export function CompanyInformationTab({
  onNavigateToLegalDocuments,
  onNavigateToStations,
}: CompanyInformationTabProps) {
  const { t, locale } = useLanguage();
  const { orgId, setOrgBranding, userRole } = useRentalOrg();
  const canEdit = userRole === 'ORG_ADMIN' || isMasterAdmin();

  const {
    profile,
    legalDocs,
    stations,
    activity,
    loading,
    loadError,
    saving,
    logoUploading,
    docsLoading,
    activityLoading,
    loadProfile,
    saveProfile,
    uploadLogo,
    removeLogo,
  } = useCompanyCenter(orgId);

  const [activeSection, setActiveSection] = useState<CompanySection>('basis');
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CompanyDraft | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const savedDraft = useMemo(
    () => (profile ? draftFromProfile(profile) : null),
    [profile],
  );

  const effectiveDraft = isEditing && draft ? draft : savedDraft;

  const dirty = useMemo(
    () => isEditing && savedDraft && draft && isDraftDirty(savedDraft, draft),
    [isEditing, savedDraft, draft],
  );

  const setupItems = useMemo(
    () => computeSetupChecklist(locale, profile, profile?.logoUrl ?? null, legalDocs, stations),
    [profile, legalDocs, stations, locale],
  );

  const readiness = overallReadiness(setupItems);

  useEffect(() => {
    if (profile) {
      setOrgBranding({
        orgName: profile.companyName,
        orgLogoUrl: profile.logoUrl,
      });
    }
  }, [profile, setOrgBranding]);

  const scrollToSection = useCallback((section: CompanySection) => {
    setActiveSection(section);
    requestAnimationFrame(() => {
      document
        .getElementById(`company-section-${section}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const startEdit = () => {
    if (!savedDraft) return;
    setDraft(cloneDraft(savedDraft));
    setValidationError(null);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setValidationError(null);
    setIsEditing(false);
  };

  const patchDraft = useCallback(
    (patch: Partial<CompanyDraft>) => {
      if (!isEditing) return;
      setDraft((d) => ({ ...(d ?? savedDraft!), ...patch }));
    },
    [isEditing, savedDraft],
  );

  const handleSave = async () => {
    if (!draft) return;
    const err = validateCompanyDraft(locale, draft);
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    try {
      const updated = await saveProfile(draft);
      setOrgBranding({ orgName: updated.companyName });
      setDraft(null);
      setIsEditing(false);
    } catch {
      /* toast in hook */
    }
  };

  const handleLogoUpload = async (file: File) => {
    const url = await uploadLogo(file);
    setOrgBranding({ orgLogoUrl: url });
  };

  const handleLogoRemove = async () => {
    await removeLogo();
    setOrgBranding({ orgLogoUrl: null });
  };

  const headerActions = canEdit ? (
    isEditing ? (
      <div className="flex flex-wrap items-center gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={saving}>
          {t('common.cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
        >
          {saving ? <Loader2 className="animate-spin" /> : null}
          {t('settings.company.saveChanges')}
        </Button>
      </div>
    ) : (
      <Button type="button" variant="outline" size="sm" onClick={startEdit}>
        <Pencil />
        {t('common.edit')}
      </Button>
    )
  ) : (
    <span className="text-[11px] text-muted-foreground max-w-xs">
      {t('settings.company.adminOnlyHint')}
    </span>
  );

  if (loading && !profile) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (loadError && !profile) {
    return (
      <div className="max-w-[1600px] mx-auto">
        <ErrorState
          title={t('settings.company.loadErrorTitle')}
          error={loadError}
          onRetry={() => void loadProfile()}
          retryLabel={t('settings.shell.retryLoad')}
        />
      </div>
    );
  }

  if (!profile || !effectiveDraft) return null;

  return (
    <div className="max-w-[1600px] mx-auto space-y-4 animate-fade-up pb-6">
      <PageHeader
        title={t('settings.company.title')}
        status={<StatusChip tone={READINESS_TONE[readiness]}>{getReadinessLabel(locale, readiness)}</StatusChip>}
        actions={headerActions}
        className="mb-0"
      />

      {validationError && (
        <p className="text-xs text-[color:var(--status-critical)]">{validationError}</p>
      )}

      <CompanySetupChecklist
        items={setupItems}
        onNavigate={scrollToSection}
        onManageDocuments={onNavigateToLegalDocuments}
        onNavigateToStations={onNavigateToStations}
      />

      <div className="sticky top-0 z-10 -mx-1 px-1 py-1">
        <CompanySectionTabBar activeSection={activeSection} onSectionChange={scrollToSection} />
      </div>

      <div className="space-y-4">
        <div id="company-section-basis">
          <CompanyBasisSection
            editing={isEditing}
            draft={effectiveDraft}
            onChange={patchDraft}
          />
        </div>

        <div id="company-section-contact">
          <CompanyContactSection
            editing={isEditing}
            draft={effectiveDraft}
            onChange={patchDraft}
          />
        </div>

        <div id="company-section-tax">
          <CompanyTaxSection
            editing={isEditing}
            draft={effectiveDraft}
            onChange={patchDraft}
          />
        </div>

        <div id="company-section-branding">
          <CompanyBrandingSection
            editing={isEditing}
            draft={effectiveDraft}
            profile={profile}
            logoUploading={logoUploading}
            canEdit={canEdit}
            onChange={patchDraft}
            onUpload={handleLogoUpload}
            onRemoveLogo={handleLogoRemove}
          />
        </div>

        <div id="company-section-documents">
          <CompanyDocumentsSection
            legalDocs={legalDocs}
            loading={docsLoading}
            onManageDocuments={() => onNavigateToLegalDocuments?.()}
          />
        </div>

        <div id="company-section-history">
          <CompanyHistorySection activity={activity} loading={activityLoading} />
        </div>
      </div>
    </div>
  );
}
