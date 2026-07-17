import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

function read(rel: string) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Document Intake V2 full-flow contract', () => {
  it('idle upload shows only dropzone and context hint wiring', () => {
    const view = read('components/DocumentUploadView.tsx');
    const zone = read('components/documents/DocumentIntakeUploadZone.tsx');
    expect(view).toContain('DocumentIntakeUploadZone');
    expect(view).toContain('flow === \'idle\'');
    expect(zone).toContain('aria-label');
    expect(zone).toContain('type="file"');
  });

  it('shows origin context without auto-confirming entity links', () => {
    const view = read('components/DocumentUploadView.tsx');
    const context = read('../lib/document-upload-context.ts');
    const entry = read('lib/document-intake-entry.ts');
    expect(view).toContain('formatUploadContextBanner');
    expect(context).toContain('buildOriginContextHint');
    expect(entry).toContain('shouldUseOrgUploadForContext');
    expect(entry).toContain('readDocumentIntakeEntry');
  });

  it('wires classification, entity review, schema review, and action preview', () => {
    const view = read('components/DocumentUploadView.tsx');
    const review = read('components/documents/DocumentExtractionReviewPanel.tsx');
    expect(view).toContain('DocumentClassificationResultPanel');
    expect(review).toContain('DocumentEntityReview');
    expect(review).toContain('DocumentSchemaFieldReview');
    expect(review).toContain('DocumentActionPlanReview');
    expect(review).toContain('hasSavedFieldReview');
  });

  it('wires apply result, retry, and follow-up panels', () => {
    const view = read('components/DocumentUploadView.tsx');
    const drawer = read('components/documents/VehicleDocumentUploadDrawer.tsx');
    const followUp = read('components/documents/DocumentFollowUpSuggestionsPanel.tsx');
    expect(view).toContain('DocumentApplyResultPanel');
    expect(view).toContain('handleRetryFailedActions');
    expect(drawer).toContain('DocumentFollowUpSuggestionsPanel');
    expect(followUp).toContain('DocumentFollowUpContactPrepareModal');
  });

  it('wires three-tab review inbox and archive with URL state', () => {
    const view = read('components/DocumentUploadView.tsx');
    const nav = read('lib/document-intake-navigation.ts');
    expect(view).toContain('DocumentReviewInboxPanel');
    expect(view).toContain('DocumentArchivePanel');
    expect(nav).toContain('readDocumentIntakeTab');
    expect(nav).toContain('replaceDocumentIntakeUrl');
    expect(nav).toContain('readDocumentArchiveQuery');
  });

  it('supports session reload via active extraction pointer', () => {
    const session = read('lib/document-extraction-session.ts');
    const intakeFlow = read('hooks/useDocumentIntakeFlow.ts');
    expect(session).toContain('synqdrive_rental_active_extraction');
    expect(intakeFlow).toContain('readActiveExtractionPointer');
  });

  it('scopes org archive and review inbox API calls', () => {
    const inbox = read('hooks/useDocumentReviewInbox.ts');
    const archive = read('hooks/useDocumentArchiveList.ts');
    const intakeFlow = read('hooks/useDocumentIntakeFlow.ts');
    expect(inbox).toContain('listArchiveByOrg');
    expect(archive).toContain('listArchiveByOrg');
    expect(inbox).toContain('orgId');
    expect(intakeFlow).toContain('orgId');
  });

  it('includes i18n keys for de/en/fr lifecycle states', () => {
    for (const locale of ['en.ts', 'de.ts', 'fr.ts']) {
      const src = read(`i18n/translations/${locale}`);
      expect(src).toContain('docUpload.tab.upload');
      expect(src).toContain('docUpload.tab.review');
      expect(src).toContain('docUpload.tab.archive');
      expect(src).toContain('documentExtraction.status.AWAITING_DOCUMENT_TYPE');
      expect(src).toContain('docUpload.retryFailed');
    }
  });
});
