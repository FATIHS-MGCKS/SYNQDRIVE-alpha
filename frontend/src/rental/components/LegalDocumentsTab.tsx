import { useRef, useState } from 'react';
import { FileText, Plus, RefreshCw } from 'lucide-react';
import {
  ErrorState,
  PageHeader,
  StatusChip,
} from '../../components/patterns';
import { Button } from '../../components/ui/button';
import { LEGAL_DOCUMENT_ADMIN_DISCLAIMER_DE } from '../lib/legal-document-types';
import { useRentalOrg } from '../RentalContext';
import { useLegalDocumentsOverview } from './legal-documents/useLegalDocumentsOverview';
import { LegalDocumentsReadinessStrip } from './legal-documents/LegalDocumentsReadinessStrip';
import { LegalDocumentCategoryCards } from './legal-documents/LegalDocumentCategoryCards';
import { LegalDocumentConfigAlerts } from './legal-documents/LegalDocumentConfigAlerts';
import { LegalDocumentVersionHistorySection } from './legal-documents/LegalDocumentVersionHistorySection';
import { LegalDocumentAuditSection } from './legal-documents/LegalDocumentAuditSection';
import { LegalDocumentsLegacyMutations } from './legal-documents/LegalDocumentsLegacyMutations';
import { LegalDocumentUploadWizardDialog } from './legal-documents/LegalDocumentUploadWizardDialog';

interface LegalDocumentsTabProps {
  /** @deprecated Design-system migration — prop ignored; uses theme tokens */
  isDarkMode?: boolean;
}

export function LegalDocumentsTab(_props: LegalDocumentsTabProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const canViewAudit = hasPermission('legal-documents-audit', 'read');
  const canUploadLegal = hasPermission('legal-documents', 'write');
  const canPublishLegal = hasPermission('legal-documents', 'manage');
  const canSubmitReview = canUploadLegal;

  const [wizardOpen, setWizardOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement | null>(null);

  const { docs, summary, events, loading, eventsLoading, error, eventsError, refresh } =
    useLegalDocumentsOverview(orgId, { loadEvents: canViewAudit });

  const scrollToHistory = (categoryKey: string) => {
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    void categoryKey;
  };

  if (!orgId) {
    return (
      <ErrorState
        title="Organisation nicht verfügbar"
        description="Die Rechtstexte können ohne Mandantenkontext nicht geladen werden."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        variant="full"
        eyebrow="Verwaltung"
        title="Kunden-Rechtstexte"
        description="Verwalten Sie freigegebene Vertrags- und Datenschutzhinweise für Buchungen und Kundenprozesse."
        icon={<FileText className="h-4 w-4" />}
        status={
          <StatusChip tone={summary.overallTone} dot>
            {summary.overallLabel}
          </StatusChip>
        }
        meta={<span>{LEGAL_DOCUMENT_ADMIN_DISCLAIMER_DE}</span>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canUploadLegal ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setWizardOpen(true)}
                data-testid="legal-documents-new-version"
              >
                <Plus />
                Neue Version
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={loading ? 'animate-spin' : ''} />
              Aktualisieren
            </Button>
          </div>
        }
      />

      {error ? (
        <ErrorState title="Rechtstexte konnten nicht geladen werden" error={error} onRetry={() => void refresh()} />
      ) : (
        <>
          <LegalDocumentsReadinessStrip summary={summary} loading={loading} />
          <LegalDocumentConfigAlerts alerts={summary.configAlerts} />
          <LegalDocumentCategoryCards
            categories={summary.categories}
            loading={loading}
            onSelectCategory={scrollToHistory}
          />

          <div ref={historyRef}>
            <LegalDocumentVersionHistorySection
              orgId={orgId}
              rows={summary.allVersions}
              loading={loading}
            />
          </div>

          {canViewAudit ? (
            <LegalDocumentAuditSection events={events} loading={eventsLoading || loading} />
          ) : null}

          {eventsError ? (
            <p className="text-[12px] text-muted-foreground">Audit-Hinweis: {eventsError}</p>
          ) : null}

          <LegalDocumentsLegacyMutations
            orgId={orgId}
            categories={summary.categories}
            canUpload={canUploadLegal}
            canPublish={canPublishLegal}
            onChanged={refresh}
          />

          <LegalDocumentUploadWizardDialog
            open={wizardOpen}
            onOpenChange={setWizardOpen}
            orgId={orgId}
            existingDocs={docs}
            canUpload={canUploadLegal}
            canSubmitReview={canSubmitReview}
            onSuccess={refresh}
          />
        </>
      )}
    </div>
  );
}
