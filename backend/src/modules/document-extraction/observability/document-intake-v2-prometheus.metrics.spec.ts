import { TripMetricsService } from '@modules/observability/trip-metrics.service';
import {
  recordDocumentAction,
  recordDocumentClassification,
  recordDocumentDuplicate,
  recordDocumentEntityCandidate,
  recordDocumentFollowUp,
  recordDocumentOcr,
  recordDocumentUpload,
  toDocumentIntakeCategory,
} from './document-intake-v2-prometheus.metrics';

describe('document-intake-v2-prometheus.metrics', () => {
  let metrics: TripMetricsService;

  beforeEach(() => {
    metrics = new TripMetricsService();
  });

  it('exposes Document Intake V2 counters without forbidden labels', async () => {
    recordDocumentUpload(metrics, { scope: 'org', sourceSurface: 'org_inbox' });
    recordDocumentDuplicate(metrics, { outcome: 'unique' });
    recordDocumentOcr(metrics, { method: 'OCR' });
    recordDocumentClassification(metrics, { result: 'auto_continue' });
    recordDocumentEntityCandidate(metrics, {
      entityType: 'VEHICLE',
      confidence: 'HIGH',
    });
    recordDocumentAction(metrics, {
      semanticAction: 'ARCHIVE_DOCUMENT',
      outcome: 'succeeded',
    });
    recordDocumentFollowUp(metrics, {
      followUpType: 'CREATE_TASK',
      outcome: 'accepted',
    });

    const text = await metrics.getMetrics();
    expect(text).toContain('synqdrive_document_upload_total');
    expect(text).toContain('synqdrive_document_upload_rejected_total');
    expect(text).toContain('synqdrive_document_duplicate_total');
    expect(text).toContain('synqdrive_document_ocr_total');
    expect(text).toContain('synqdrive_document_ocr_failed_total');
    expect(text).toContain('synqdrive_document_classification_total');
    expect(text).toContain('synqdrive_document_awaiting_type_total');
    expect(text).toContain('synqdrive_document_extraction_total');
    expect(text).toContain('synqdrive_document_plausibility_blocker_total');
    expect(text).toContain('synqdrive_document_entity_candidate_total');
    expect(text).toContain('synqdrive_document_required_field_total');
    expect(text).toContain('synqdrive_document_action_plan_total');
    expect(text).toContain('synqdrive_document_action_total');
    expect(text).toContain('synqdrive_document_action_failed_total');
    expect(text).toContain('synqdrive_document_partial_apply_total');
    expect(text).toContain('synqdrive_document_recovery_total');
    expect(text).toContain('synqdrive_document_follow_up_total');
    expect(text).toContain('synqdrive_document_archive_total');
    expect(text).not.toMatch(/document_id=/);
    expect(text).not.toMatch(/extraction_id=/);
    expect(text).not.toMatch(/license_plate=/);
    expect(text).not.toMatch(/org_id=/);
  });

  it('maps document types to bounded categories', () => {
    expect(toDocumentIntakeCategory('INVOICE')).toBe('INVOICE');
    expect(toDocumentIntakeCategory('AUTHORITY_LETTER')).toBe('ARCHIVE');
    expect(toDocumentIntakeCategory('CUSTOM_UNKNOWN')).toBe('OTHER');
  });
});
