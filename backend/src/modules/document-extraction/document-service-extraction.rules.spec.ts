import { SERVICE_COMPLETE, SERVICE_MISSING_DATE } from './__fixtures__/document-service-fixtures';
import {
  assessServiceApplyGate,
  buildServiceApplyPayload,
  readServiceEventDate,
  resolveServiceEventType,
  SERVICE_DOCUMENT_TYPES,
} from './document-service-extraction.rules';

describe('document-service-extraction.rules', () => {
  it('requires explicit event date', () => {
    const gate = assessServiceApplyGate({
      documentType: SERVICE_DOCUMENT_TYPES.SERVICE,
      fields: SERVICE_MISSING_DATE,
    });
    expect(gate.canApply).toBe(false);
    expect(gate.blockers.some((blocker) => blocker.code === 'MISSING_EVENT_DATE')).toBe(true);
  });

  it('builds payload for complete service without default date', () => {
    const payload = buildServiceApplyPayload(SERVICE_DOCUMENT_TYPES.SERVICE, SERVICE_COMPLETE);
    expect(payload?.eventDate).toBe('2026-05-12');
    expect(payload?.eventType).toBe(resolveServiceEventType(SERVICE_DOCUMENT_TYPES.SERVICE));
    expect(readServiceEventDate(SERVICE_COMPLETE)).toBe('2026-05-12');
  });

  it('maps oil change document type to OIL_CHANGE event type', () => {
    const payload = buildServiceApplyPayload(SERVICE_DOCUMENT_TYPES.OIL_CHANGE, {
      ...SERVICE_COMPLETE,
      eventDate: '2026-05-14',
    });
    expect(payload?.eventType).toBe('OIL_CHANGE');
  });
});
