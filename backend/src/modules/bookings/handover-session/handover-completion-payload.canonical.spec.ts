import {
  buildHandoverCompletionCanonicalPayload,
  hashHandoverCompletionPayload,
  hashHandoverSignedContent,
  signedHandoverContentChanged,
} from './handover-completion-payload.canonical';

describe('handover-completion-payload.canonical', () => {
  const baseContext = {
    organizationId: 'org-1',
    bookingId: 'booking-1',
    vehicleId: 'vehicle-1',
    customerId: 'customer-1',
    stationId: 'station-1',
    kind: 'PICKUP' as const,
    documentVersion: 1,
    protocolVersion: 1,
    performedAt: '2026-07-25T10:00:00.000Z',
  };

  const basePayload = {
    odometerKm: 12000,
    fuelPercent: 80,
    fuelFull: false,
    documentsAcknowledged: true,
    customerSignatureName: 'Customer',
    customerSignatureDataUrl: 'data:image/png;base64,abc',
    staffSignatureName: 'Staff',
    staffSignatureDataUrl: 'data:image/png;base64,def',
    damageIds: ['damage-1'],
  };

  it('produces stable payload hash for identical input', () => {
    const a = buildHandoverCompletionCanonicalPayload(basePayload, baseContext);
    const b = buildHandoverCompletionCanonicalPayload(basePayload, baseContext);
    expect(hashHandoverCompletionPayload(a)).toBe(hashHandoverCompletionPayload(b));
  });

  it('changes hash when signed content changes', () => {
    const original = buildHandoverCompletionCanonicalPayload(basePayload, baseContext);
    const changed = buildHandoverCompletionCanonicalPayload(
      { ...basePayload, odometerKm: 12100 },
      baseContext,
    );
    expect(hashHandoverCompletionPayload(original)).not.toBe(
      hashHandoverCompletionPayload(changed),
    );
    expect(signedHandoverContentChanged(original, changed)).toBe(true);
  });

  it('does not require re-signature when only non-signed metadata changes', () => {
    const original = buildHandoverCompletionCanonicalPayload(basePayload, baseContext);
    const changed = buildHandoverCompletionCanonicalPayload(basePayload, {
      ...baseContext,
      documentVersion: 2,
      protocolVersion: 2,
    });
    expect(hashHandoverCompletionPayload(original)).not.toBe(
      hashHandoverCompletionPayload(changed),
    );
    expect(signedHandoverContentChanged(original, changed)).toBe(false);
    expect(hashHandoverSignedContent(original)).toBe(hashHandoverSignedContent(changed));
  });
});
