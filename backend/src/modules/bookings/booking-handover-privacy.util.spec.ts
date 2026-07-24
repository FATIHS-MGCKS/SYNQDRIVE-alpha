import type { HandoverProtocolDto } from './handover.types';
import { redactHandoverProtocolForList } from './booking-handover-privacy.util';

function sampleProtocol(): HandoverProtocolDto {
  return {
    id: 'proto-1',
    bookingId: 'bk-1',
    vehicleId: 'veh-1',
    kind: 'PICKUP',
    performedAt: '2026-07-01T10:00:00.000Z',
    performedByUserId: 'user-1',
    performedByName: 'Operator',
    odometerKm: 12000,
    fuelPercent: 80,
    fuelFull: false,
    exteriorClean: true,
    interiorClean: true,
    tiresSeasonOk: true,
    warningLightsOn: false,
    warningLightsNotes: null,
    notes: null,
    customerSignatureName: 'Max Mustermann',
    customerSignatureDataUrl: 'data:image/png;base64,SECRET',
    staffSignatureName: 'Staff User',
    staffSignatureDataUrl: 'data:image/png;base64,STAFF',
    documentsAcknowledged: true,
    damageIds: [],
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
  };
}

describe('booking-handover-privacy.util', () => {
  it('returns null for null protocol', () => {
    expect(redactHandoverProtocolForList(null)).toBeNull();
  });

  it('strips signature payloads from list summaries', () => {
    const redacted = redactHandoverProtocolForList(sampleProtocol());
    expect(redacted).not.toBeNull();
    expect(redacted).not.toHaveProperty('customerSignatureDataUrl');
    expect(redacted).not.toHaveProperty('staffSignatureDataUrl');
    expect(redacted).not.toHaveProperty('customerSignatureName');
    expect(redacted).not.toHaveProperty('staffSignatureName');
    expect(redacted?.hasCustomerSignature).toBe(true);
    expect(redacted?.hasStaffSignature).toBe(true);
    expect(redacted?.odometerKm).toBe(12000);
  });

  it('reports false signature flags when no signature present', () => {
    const redacted = redactHandoverProtocolForList({
      ...sampleProtocol(),
      customerSignatureName: null,
      customerSignatureDataUrl: null,
      staffSignatureName: null,
      staffSignatureDataUrl: null,
    });
    expect(redacted?.hasCustomerSignature).toBe(false);
    expect(redacted?.hasStaffSignature).toBe(false);
  });
});
