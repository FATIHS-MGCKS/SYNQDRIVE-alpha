import { useRef, useState } from 'react';
import { FileText, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import {
  ErrorState,
  PageHeader,
  StatusChip,
} from '../../components/patterns';
import { Button } from '../../components/ui/button';
import type { LegalDocumentDto } from '../../lib/api';
import { LEGAL_DOCUMENT_ADMIN_DISCLAIMER_DE } from '../lib/legal-document-types';
import { useRentalOrg } from '../RentalContext';
import { useLegalDocumentsOverview } from './legal-documents/useLegalDocumentsOverview';
import { LegalDocumentsReadinessStrip } from './legal-documents/LegalDocumentsReadinessStrip';
import { LegalDocumentCategoryCards } from './legal-documents/LegalDocumentCategoryCards';
import { LegalDocumentConfigAlerts } from './legal-documents/LegalDocumentConfigAlerts';
import { LegalDocumentVersionHistoriesPanel } from './legal-documents/LegalDocumentVersionHistoriesPanel';
import { LegalDocumentVersionDetailDrawer } from './legal-documents/LegalDocumentVersionDetailDrawer';
import { LegalDocumentAuditSection } from './legal-documents/LegalDocumentAuditSection';
import { LegalDocumentUploadWizardDialog } from './legal-documents/LegalDocumentUploadWizardDialog';
import { LegalDocumentLifecycleActionDialog } from './legal-documents/lifecycle/LegalDocumentLifecycleActionDialog';
import { LEGAL_LIFECYCLE_ACTION_CONFIG } from '../lib/legal-document-lifecycle.constants';
import type { LegalDocumentLifecycleDialogState } from '../lib/legal-document-lifecycle.types';
import { formatLifecycleEventLabel } from '../lib/legal-document-lifecycle.utils';
import { LEGAL_DOCS_HEADING_ID, LEGAL_DOCS_MAIN_ID } from './legal-documents/legal-documents-a11y';

interface LegalDocumentsTabProps {
  /** @deprecated Design-system migration — prop ignored; uses theme tokens */
  isDarkMode?: boolean;
}

export function LegalDocumentsTab(_props: LegalDocumentsTabProps) {
  const { orgId, hasPermission } = useRentalOrg();
  const canViewAudit = hasPermission('legal-documents-audit', 'read');
  const canViewUsage = hasPermission('legal-documents', 'read');
  const canUploadLegal = hasPermission('legal-documents', 'write');
  const canPublishLegal = hasPermission('legal-documents', 'manage');
  const canSubmitReview = canUploadLegal;

  const [wizardOpen, setWizardOpen] = useState(false);
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [lifecycleState, setLifecycleState] = useState<LegalDocumentLifecycleDialogState | null>(null);
  const [detailDocument, setDetailDocument] = useState<LegalDocumentDto | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [focusCategoryKey, setFocusCategoryKey] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement | null>(null);

  const { docs, summary, events, settings, loading, eventsLoading, error, eventsError, refresh } =
    useLegalDocumentsOverview(orgId, { loadEvents: canViewAudit });

  const scrollToHistory = (categoryKey: string) => {
    setFocusCategoryKey(categoryKey);
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const target = document.getElementById(`legal-version-history-${categoryKey}`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openDetail = (document: LegalDocumentDto) => {
    setDetailDocument(document);
    setDetailOpen(true);
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
    <section
      className="space-y-6"
      aria-labelledby={LEGAL_DOCS_HEADING_ID}
      id={LEGAL_DOCS_MAIN_ID}
    >
      <PageHeader
        variant="full"
        eyebrow="Verwaltung"
        title={<span id={LEGAL_DOCS_HEADING_ID}>Kunden-Rechtstexte</span>}
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
            <LegalDocumentVersionHistoriesPanel
              orgId={orgId}
              permissions={{ canWrite: canUploadLegal, canManage: canPublishLegal }}
              settings={settings}
              focusCategoryKey={focusCategoryKey}
              onOpenDetail={openDetail}
              onOpenAction={(state) => {
                setLifecycleState(state);
                setLifecycleOpen(true);
              }}
            />
          </div>

          {canViewAudit ? (
            <LegalDocumentAuditSection events={events} loading={eventsLoading || loading} />
          ) : null}

          {eventsError ? (
            <p className="text-[12px] text-muted-foreground">Audit-Hinweis: {eventsError}</p>
          ) : null}

          <LegalDocumentVersionDetailDrawer
            orgId={orgId}
            document={detailDocument}
            open={detailOpen}
            onOpenChange={(open) => {
              setDetailOpen(open);
              if (!open) setDetailDocument(null);
            }}
            canViewAudit={canViewAudit}
            canViewUsage={canViewUsage}
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

          <LegalDocumentLifecycleActionDialog
            open={lifecycleOpen}
            state={lifecycleState}
            settings={settings}
            permissions={{ canWrite: canUploadLegal, canManage: canPublishLegal }}
            onOpenChange={(open) => {
              setLifecycleOpen(open);
              if (!open) setLifecycleState(null);
            }}
            onSuccess={async ({ document, latestEvent }) => {
              await refresh();
              const action = lifecycleState?.action;
              const label = action ? LEGAL_LIFECYCLE_ACTION_CONFIG[action].confirmLabel : 'Aktion';
              toast.success(
                latestEvent
                  ? `${label} — ${formatLifecycleEventLabel(latestEvent.eventType)}`
                  : `${label} — Status: ${document.status}`,
              );
            }}
            onConflict={refresh}
          />
        </>
      )}
    </section>
  );
}
