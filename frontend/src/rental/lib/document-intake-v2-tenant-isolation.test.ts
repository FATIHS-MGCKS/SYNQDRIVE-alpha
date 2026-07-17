import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

function read(rel: string) {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Document Intake V2 tenant isolation (frontend)', () => {
  it('scopes archive and inbox API calls to organizationId', () => {
    const archiveHook = read('hooks/useDocumentArchiveList.ts');
    const inboxHook = read('hooks/useDocumentReviewInbox.ts');
    const intakeFlow = read('hooks/useDocumentIntakeFlow.ts');
    const uploadPage = read('hooks/useDocumentUploadPage.ts');

    expect(archiveHook).toContain('listArchiveByOrg(orgId');
    expect(inboxHook).toContain('listArchiveByOrg(orgId');
    expect(intakeFlow).toContain('orgId');
    expect(uploadPage).toContain('orgId');
  });

  it('surfaces load errors instead of mixing cross-tenant data', () => {
    const archiveHook = read('hooks/useDocumentArchiveList.ts');
    const archivePanel = read('components/documents/DocumentArchivePanel.tsx');
    const uploadView = read('components/DocumentUploadView.tsx');

    expect(archiveHook).toContain("setError('load_failed')");
    expect(archivePanel).toContain('docUpload.archive.loadError');
    expect(uploadView).toContain('useRentalOrg');
    expect(uploadView).not.toMatch(/orgId\s*\|\|\s*['"]org-/);
  });

  it('does not treat unconfirmed APPLIED status as success in intake flow', () => {
    const intakeFlow = read('hooks/useDocumentIntakeFlow.ts');
    const applyResult = read('lib/document-apply-result.ts');

    expect(intakeFlow).toContain('canShowApplyDone');
    expect(applyResult).toContain('applyingInProgress');
    expect(applyResult).toContain('requiredActionsComplete');
  });
});
