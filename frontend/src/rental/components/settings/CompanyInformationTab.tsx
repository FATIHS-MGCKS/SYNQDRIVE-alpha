import { Loader2, Pencil, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ErrorState,
  PageHeader,
  SkeletonCard,
  StatusChip,
} from '../../../components/patterns';
import { isMasterAdmin } from '../../../lib/auth';
import { useRentalOrg } from '../../RentalContext';
import { CompanySetupChecklist } from './company/CompanySetupChecklist';
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
  COMPANY_SECTIONS,
  computeSetupChecklist,
  draftFromProfile,
  isDraftDirty,
  overallReadiness,
  READINESS_LABEL,
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
    () => computeSetupChecklist(profile, profile?.logoUrl ?? null, legalDocs, stations),
    [profile, legalDocs, stations],
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
    const err = validateCompanyDraft(draft);
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

  if (loading && !profile) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-5">
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
          title="Unternehmensprofil konnte nicht geladen werden"
          error={loadError}
          onRetry={() => void loadProfile()}
          retryLabel="Erneut laden"
        />
      </div>
    );
  }

  if (!profile || !effectiveDraft) return null;

  return (
    <div className="max-w-[1600px] mx-auto space-y-5 animate-fade-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <PageHeader
          title="Unternehmensinformationen"
          description="Zentrale Firmen-, Rechnungs- und Brandingdaten für Dokumente, Rechnungen und Kommunikation."
        />
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <StatusChip tone={READINESS_TONE[readiness]}>{READINESS_LABEL[readiness]}</StatusChip>
          {canEdit ? (
            isEditing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  <X className="w-3.5 h-3.5" />
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!dirty || saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-[var(--brand-foreground)] disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Änderungen speichern
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--brand)] text-[var(--brand-foreground)]"
              >
                <Pencil className="w-3.5 h-3.5" />
                Bearbeiten
              </button>
            )
          ) : (
            <span className="text-[11px] text-muted-foreground max-w-xs">
              Nur Organisationsadministratoren können diese Daten bearbeiten.
            </span>
          )}
        </div>
      </div>

      {validationError && (
        <p className="text-xs text-[color:var(--status-critical)]">{validationError}</p>
      )}

      <CompanySetupChecklist
        items={setupItems}
        onNavigate={scrollToSection}
        onManageDocuments={onNavigateToLegalDocuments}
        onNavigateToStations={onNavigateToStations}
      />

      <nav className="flex flex-wrap gap-2 sticky top-0 z-10 py-2 bg-background/90 backdrop-blur-sm border-b border-border/40 -mx-1 px-1">
        {COMPANY_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => scrollToSection(s.id)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              activeSection === s.id
                ? 'bg-[var(--brand)] text-[var(--brand-foreground)]'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      <div className="space-y-5 pb-8">
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
