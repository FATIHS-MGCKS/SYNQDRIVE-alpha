import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC_ROOT = path.join(__dirname, '../../..');

const consumers = [
  'modules/communication/ops/communication-quick-action.executor.ts',
  'modules/whatsapp/whatsapp-ai-tools.service.ts',
  'modules/whatsapp/whatsapp-booking-reminder.service.ts',
  'modules/whatsapp/whatsapp-conversation-context.service.ts',
];

describe('Core booking document bundle view port — consumer wiring', () => {
  it.each(consumers)('%s injects CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT only', (rel) => {
    const source = fs.readFileSync(path.join(SRC_ROOT, rel), 'utf8');
    expect(source).toContain('CORE_BOOKING_DOCUMENT_BUNDLE_VIEW_PORT');
    expect(source).not.toMatch(/BookingDocumentBundleService/);
  });
});