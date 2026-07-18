import {
  FINE_COMPLETE,
  FINE_MISSING_EVENT_DATE,
  FINE_MISSING_OFFENSE_TYPE,
  FINE_WITH_ACCEPTED_LINKS,
  FINE_ZERO_AMOUNT,
} from './__fixtures__/document-fine-fixtures';
import {
  assessFineApplyGate,
  buildFineApplyPayload,
  readAcceptedEntityLinks,
  resolveFineEntityLinks,
} from './document-fine-extraction.rules';

describe('document-fine-extraction.rules', () => {
  it('builds apply payload for complete fine documents', () => {
    const payload = buildFineApplyPayload(FINE_COMPLETE);
    expect(payload).toMatchObject({
      offenseType: 'Parkverstoß',
      amountCents: 1750,
      fineNumber: 'REF-2025-001',
    });
  });

  it('blocks missing event date, zero amount, and missing offense type', () => {
    expect(assessFineApplyGate({ fields: FINE_MISSING_EVENT_DATE }).canApply).toBe(false);
    expect(assessFineApplyGate({ fields: FINE_ZERO_AMOUNT }).canApply).toBe(false);
    expect(assessFineApplyGate({ fields: FINE_MISSING_OFFENSE_TYPE }).canApply).toBe(false);
  });

  it('blocks duplicate reference numbers', () => {
    const gate = assessFineApplyGate({
      fields: FINE_COMPLETE,
      duplicateReferenceFineId: 'fine-existing-1',
    });
    expect(gate.canApply).toBe(false);
    expect(gate.blockers.some((row) => row.code === 'FINE_DUPLICATE_REFERENCE_NUMBER')).toBe(true);
  });

  it('resolves booking/customer/driver links only from accepted entity links', () => {
    const links = resolveFineEntityLinks(FINE_WITH_ACCEPTED_LINKS);
    expect(links).toEqual({
      bookingId: 'booking-1',
      customerId: 'customer-1',
      driverCustomerId: 'driver-1',
    });
    expect(readAcceptedEntityLinks(FINE_COMPLETE)).toEqual([]);
  });
});
