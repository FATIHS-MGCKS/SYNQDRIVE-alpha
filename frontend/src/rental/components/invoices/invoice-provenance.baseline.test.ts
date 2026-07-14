import { describe, expect, it } from 'vitest';

import { deriveInvoiceProvenanceLabel } from './invoice-baseline.fixtures';

describe('invoice provenance derivation — baseline (type-based, not true provenance)', () => {
  it('OUTGOING_BOOKING is labeled Automatisch (Buchung)', () => {
    expect(deriveInvoiceProvenanceLabel({ type: 'OUTGOING_BOOKING' })).toBe(
      'Automatisch (Buchung)',
    );
  });

  it('OUTGOING_FINAL is currently labeled Manuell (regression: auto final invoice)', () => {
    expect(deriveInvoiceProvenanceLabel({ type: 'OUTGOING_FINAL' })).toBe('Manuell');
  });

  it('OUTGOING_MANUAL is labeled Manuell', () => {
    expect(deriveInvoiceProvenanceLabel({ type: 'OUTGOING_MANUAL' })).toBe('Manuell');
  });

  it('INCOMING_UPLOADED is labeled Document Extraction', () => {
    expect(
      deriveInvoiceProvenanceLabel({ type: 'INCOMING_UPLOADED', documentExtractionId: 'ext-1' }),
    ).toBe('Document Extraction');
  });

  it('INCOMING_VENDOR without extraction is Manuell', () => {
    expect(deriveInvoiceProvenanceLabel({ type: 'INCOMING_VENDOR' })).toBe('Manuell');
  });
});

describe.skip('invoice provenance — target state (enable after provenance field / phase P1)', () => {
  it('OUTGOING_FINAL from booking return should not be Manuell', () => {
    expect(deriveInvoiceProvenanceLabel({ type: 'OUTGOING_FINAL' })).not.toBe('Manuell');
  });
});
