import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DocumentFollowUpSuggestionsPanel } from './DocumentFollowUpSuggestionsPanel';
import {
  INTAKE_TEST_EXTRACTION_ID,
  INTAKE_TEST_ORG_ID,
  INTAKE_TEST_VEHICLE_ID,
  intakeFollowUpSuggestion,
} from '../../lib/document-intake-test-fixtures';

const t = (key: string) => key;

describe('DocumentFollowUpSuggestionsPanel', () => {
  it('renders actionable follow-up suggestions with contact prepare action', () => {
    const html = renderToStaticMarkup(
      <DocumentFollowUpSuggestionsPanel
        orgId={INTAKE_TEST_ORG_ID}
        vehicleId={INTAKE_TEST_VEHICLE_ID}
        extractionId={INTAKE_TEST_EXTRACTION_ID}
        suggestions={[intakeFollowUpSuggestion]}
        t={t}
      />,
    );

    expect(html).toContain('docUpload.followUp.title');
    expect(html).toContain(intakeFollowUpSuggestion.title);
    expect(html).toContain(intakeFollowUpSuggestion.rationale);
    expect(html).toContain('docUpload.followUp.prepareContact');
    expect(html).toContain('docUpload.followUp.status.SUGGESTED');
  });

  it('returns null when no extraction or actionable suggestions', () => {
    const html = renderToStaticMarkup(
      <DocumentFollowUpSuggestionsPanel
        orgId={INTAKE_TEST_ORG_ID}
        vehicleId={INTAKE_TEST_VEHICLE_ID}
        extractionId={null}
        suggestions={[]}
        t={t}
      />,
    );

    expect(html).toBe('');
  });

  it('shows loading state without auto-opening contact modal', () => {
    const html = renderToStaticMarkup(
      <DocumentFollowUpSuggestionsPanel
        orgId={INTAKE_TEST_ORG_ID}
        vehicleId={INTAKE_TEST_VEHICLE_ID}
        extractionId={INTAKE_TEST_EXTRACTION_ID}
        suggestions={[]}
        loading
        t={t}
      />,
    );

    expect(html).toContain('docUpload.followUp.loading');
    expect(html).not.toContain('docUpload.followUp.contact.modalTitle');
  });
});
