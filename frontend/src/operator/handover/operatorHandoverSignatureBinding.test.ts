import { describe, expect, it } from 'vitest';
import {
  buildOperatorHandoverSignableContent,
  hashOperatorHandoverSignableContent,
  sha256FromSignatureDataUrl,
} from './operatorHandoverSignableContent';
import { createOperatorHandoverSignatureBinding } from './operatorHandoverSignatureBinding';
import { createInitialHandoverState } from './operatorHandoverPayload';
import type { OperatorHandoverBookingRef } from './operatorHandoverPayload';

const booking: OperatorHandoverBookingRef = {
  id: 'booking-1',
  vehicleId: 'vehicle-1',
  customerId: 'customer-1',
  vehicleName: 'Test',
  plate: 'M-AB 123',
  customerName: 'Customer',
  startDate: '2026-07-20',
  endDate: '2026-07-25',
  pickupLocation: 'Station A',
};

describe('operatorHandoverSignableContent', () => {
  it('produces stable signable hash', async () => {
    const content = buildOperatorHandoverSignableContent({
      odometerKm: 12000,
      fuelPercent: 80,
      fuelFull: false,
      exteriorClean: true,
      interiorClean: true,
      tiresSeasonOk: true,
      warningLightsOn: false,
      warningLightsNotes: null,
      notes: null,
      documentsAcknowledged: true,
      damageIds: ['d1'],
      technicalObservations: [],
    });
    const a = await hashOperatorHandoverSignableContent(content);
    const b = await hashOperatorHandoverSignableContent(content);
    expect(a).toBe(b);
  });

  it('changes hash when signable fields change', async () => {
    const base = buildOperatorHandoverSignableContent({
      odometerKm: 12000,
      fuelPercent: 80,
      fuelFull: false,
      exteriorClean: true,
      interiorClean: true,
      tiresSeasonOk: true,
      warningLightsOn: false,
      warningLightsNotes: null,
      notes: null,
      documentsAcknowledged: true,
      damageIds: [],
      technicalObservations: [],
    });
    const changed = buildOperatorHandoverSignableContent({
      ...base,
      odometerKm: 12100,
    });
    expect(await hashOperatorHandoverSignableContent(base)).not.toBe(
      await hashOperatorHandoverSignableContent(changed),
    );
  });

  it('hashes signature image bytes only', async () => {
    const hash = await sha256FromSignatureDataUrl('data:image/png;base64,YWJj');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('operatorHandoverSignatureBinding', () => {
  it('binds signature to signable payload hash', async () => {
    const state = createInitialHandoverState(booking, 'PICKUP');
    state.odometerKm = '12000';
    state.checks.documentsAcknowledged = true;
    state.customerSigName = 'Customer';
    const dataUrl = 'data:image/png;base64,YWJj';

    const binding = await createOperatorHandoverSignatureBinding({
      role: 'customer',
      dataUrl,
      typedName: 'Customer',
      payloadInput: { kind: 'PICKUP', booking, state },
      organizationId: 'org-1',
      bookingId: booking.id,
      customerId: booking.customerId ?? null,
      handoverSessionId: 'session-1',
      draftVersion: 2,
      capturedBy: 'user-1',
      stationId: 'station-1',
      staffId: null,
    });

    expect(binding.signerRole).toBe('customer');
    expect(binding.signableContentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(binding.imageContentSha256).toBe(await sha256FromSignatureDataUrl(dataUrl));
    expect(binding.storageClientUploadId).toBe('signature-customer-session-1');
  });
});
