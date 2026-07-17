import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Source guards: every activated document intake entry point routes to canonical V2.
 */
describe('document intake entry point guards', () => {
  const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8');

  it('central page uses intake entry state and back navigation', () => {
    const view = read('../components/DocumentUploadView.tsx');
    expect(view).toContain('intakeEntry');
    expect(view).toContain('onReturnToOrigin');
    expect(view).toContain('docUpload.backToOrigin');
  });

  it('invoices page routes KI-Upload to DocumentIntakeLaunchButton', () => {
    const src = read('../components/invoices/InvoicesPage.tsx');
    expect(src).toContain('DocumentIntakeLaunchAiButton');
    expect(src).toContain("optionalContextType: 'INVOICE'");
    expect(src).not.toContain('InvoiceExtractionUpload');
  });

  it('fines page removes legacy AIUploadFlow stub', () => {
    const src = read('../components/FinesView.tsx');
    expect(src).toContain('DocumentIntakeLaunchAiButton');
    expect(src).toContain("optionalContextType: 'FINE'");
    expect(src).not.toContain('function AIUploadFlow');
  });

  it('booking detail exposes document intake launch', () => {
    const src = read('../components/booking-detail/BookingFinanceDocumentsTab.tsx');
    expect(src).toContain("optionalContextType: 'BOOKING'");
    expect(src).toContain('DocumentIntakeLaunchAiButton');
  });

  it('customer detail separates KYC from document intake', () => {
    const src = read('../components/customer-detail/CustomerDocumentsTab.tsx');
    expect(src).toContain('CustomerDocumentUploadBox');
    expect(src).toContain("optionalContextType: 'CUSTOMER'");
    expect(src).toContain('DocumentIntakeLaunchAiButton');
  });

  it('health page wires AI upload to openDocumentIntake', () => {
    const src = read('../components/HealthErrorsView.tsx');
    expect(src).toContain('openDocumentIntake');
    expect(src).toContain("sourceSurface: 'health_page'");
  });

  it('damage dialog links to document intake', () => {
    const src = read('../components/damages/DamageAiIntakeDialog.tsx');
    expect(src).toContain('DocumentIntakeLaunchButton');
    expect(src).toContain("sourceSurface: 'damage_page'");
  });

  it('vehicle drawer passes vehicle optional context', () => {
    const src = read('../components/documents/VehicleDocumentUploadDrawer.tsx');
    expect(src).toContain("optionalContextType: 'VEHICLE'");
    expect(src).toContain('useDocumentExtractionFlow');
  });

  it('operator flow wires org context upload', () => {
    const src = read('../../operator/ai-upload/OperatorAiUploadFlow.tsx');
    expect(src).toContain('mapOperatorContextModeToEntry');
    expect(src).toContain('optionalContextType');
    expect(src).toContain("sourceSurface: 'operator_ai_upload'");
  });

  it('navigation exposes openDocumentIntake', () => {
    const app = read('../App.tsx');
    expect(app).toContain('openDocumentIntake');
    expect(app).toContain('pushDocumentIntakeEntry');
  });
});
