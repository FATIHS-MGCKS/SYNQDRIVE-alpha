import { ConflictException } from '@nestjs/common';
import {
  buildHandoverCompletionCanonicalPayload,
  hashHandoverSignableContent,
} from './handover-completion-payload.canonical';
import {
  sha256FromSignatureDataUrl,
  validateHandoverSignatureBindings,
} from './handover-signature-binding.validation';
import { HANDOVER_SIGNATURE_BINDING_ERROR } from './handover-signature-binding.errors';

describe('handover-signature-binding.validation', () => {
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

  const customerDataUrl = 'data:image/png;base64,YWJj';
  const staffDataUrl = 'data:image/png;base64,ZGVm';

  const basePayload = {
    odometerKm: 12000,
    fuelPercent: 80,
    fuelFull: false,
    documentsAcknowledged: true,
    customerSignatureName: 'Customer',
    customerSignatureDataUrl: customerDataUrl,
    staffSignatureName: 'Staff',
    staffSignatureDataUrl: staffDataUrl,
    damageIds: ['damage-1'],
  };

  function makeBindings(signableHash: string) {
    return [
      {
        signerRole: 'customer' as const,
        signerReference: 'customer-1',
        organizationId: 'org-1',
        bookingId: 'booking-1',
        handoverSessionId: 'session-1',
        draftVersion: 3,
        signableContentHash: signableHash,
        imageContentSha256: sha256FromSignatureDataUrl(customerDataUrl),
        signedAt: '2026-07-25T10:00:00.000Z',
        capturedBy: 'user-1',
        stationId: 'station-1',
        storageClientUploadId: 'signature-customer-session-1',
        typedName: 'Customer',
      },
      {
        signerRole: 'operator' as const,
        signerReference: 'user-1',
        organizationId: 'org-1',
        bookingId: 'booking-1',
        handoverSessionId: 'session-1',
        draftVersion: 3,
        signableContentHash: signableHash,
        imageContentSha256: sha256FromSignatureDataUrl(staffDataUrl),
        signedAt: '2026-07-25T10:00:00.000Z',
        capturedBy: 'user-1',
        stationId: 'station-1',
        storageClientUploadId: 'signature-operator-session-1',
        typedName: 'Staff',
      },
    ];
  }

  it('accepts bindings tied to current signable content', () => {
    const canonical = buildHandoverCompletionCanonicalPayload(basePayload, baseContext);
    const signableHash = hashHandoverSignableContent(canonical);
    const uploads = new Map([
      [
        'signature-customer-session-1',
        {
          clientUploadId: 'signature-customer-session-1',
          kind: 'SIGNATURE',
          status: 'UPLOADED',
          bookingId: 'booking-1',
          handoverSessionId: 'session-1',
          contentSha256: sha256FromSignatureDataUrl(customerDataUrl),
          organizationId: 'org-1',
        },
      ],
      [
        'signature-operator-session-1',
        {
          clientUploadId: 'signature-operator-session-1',
          kind: 'SIGNATURE',
          status: 'UPLOADED',
          bookingId: 'booking-1',
          handoverSessionId: 'session-1',
          contentSha256: sha256FromSignatureDataUrl(staffDataUrl),
          organizationId: 'org-1',
        },
      ],
    ]);

    const result = validateHandoverSignatureBindings(
      basePayload,
      makeBindings(signableHash),
      {
        organizationId: 'org-1',
        bookingId: 'booking-1',
        handoverSessionId: 'session-1',
        draftVersion: 3,
        stationId: 'station-1',
        capturedBy: 'user-1',
        canonicalContext: baseContext,
      },
      uploads,
    );
    expect(result).toHaveLength(2);
  });

  it('rejects bindings when signable content changed after signature', () => {
    const canonical = buildHandoverCompletionCanonicalPayload(basePayload, baseContext);
    const staleHash = hashHandoverSignableContent(canonical);
    const changedPayload = { ...basePayload, odometerKm: 12100 };
    expect(() =>
      validateHandoverSignatureBindings(
        changedPayload,
        makeBindings(staleHash),
        {
          organizationId: 'org-1',
          bookingId: 'booking-1',
          handoverSessionId: 'session-1',
          draftVersion: 3,
          stationId: 'station-1',
          capturedBy: 'user-1',
          canonicalContext: baseContext,
        },
        new Map(),
      ),
    ).toThrow(ConflictException);
  });

  it('rejects foreign signature upload reference', () => {
    const canonical = buildHandoverCompletionCanonicalPayload(basePayload, baseContext);
    const signableHash = hashHandoverSignableContent(canonical);
    const uploads = new Map([
      [
        'signature-customer-session-1',
        {
          clientUploadId: 'signature-customer-session-1',
          kind: 'SIGNATURE',
          status: 'UPLOADED',
          bookingId: 'other-booking',
          handoverSessionId: 'session-1',
          contentSha256: sha256FromSignatureDataUrl(customerDataUrl),
          organizationId: 'org-1',
        },
      ],
    ]);

    expect(() =>
      validateHandoverSignatureBindings(
        basePayload,
        makeBindings(signableHash),
        {
          organizationId: 'org-1',
          bookingId: 'booking-1',
          handoverSessionId: 'session-1',
          draftVersion: 3,
          stationId: 'station-1',
          capturedBy: 'user-1',
          canonicalContext: baseContext,
        },
        uploads,
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: HANDOVER_SIGNATURE_BINDING_ERROR.UPLOAD_FOREIGN,
        }),
      }),
    );
  });

  it('requires customer and operator bindings', () => {
    const canonical = buildHandoverCompletionCanonicalPayload(basePayload, baseContext);
    const signableHash = hashHandoverSignableContent(canonical);
    const onlyCustomer = [
      {
        ...makeBindings(signableHash)[0],
        storageClientUploadId: null,
      },
    ];
    expect(() =>
      validateHandoverSignatureBindings(
        basePayload,
        onlyCustomer,
        {
          organizationId: 'org-1',
          bookingId: 'booking-1',
          handoverSessionId: 'session-1',
          draftVersion: 3,
          stationId: 'station-1',
          capturedBy: 'user-1',
          canonicalContext: baseContext,
        },
        new Map(),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: HANDOVER_SIGNATURE_BINDING_ERROR.OPERATOR_REQUIRED,
        }),
      }),
    );
  });

  it('rejects missing customer drawn signature', () => {
    const canonical = buildHandoverCompletionCanonicalPayload(basePayload, baseContext);
    const signableHash = hashHandoverSignableContent(canonical);
    expect(() =>
      validateHandoverSignatureBindings(
        { ...basePayload, customerSignatureDataUrl: null },
        makeBindings(signableHash),
        {
          organizationId: 'org-1',
          bookingId: 'booking-1',
          handoverSessionId: 'session-1',
          draftVersion: 3,
          stationId: 'station-1',
          capturedBy: 'user-1',
          canonicalContext: baseContext,
        },
        new Map(),
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: HANDOVER_SIGNATURE_BINDING_ERROR.ROLE_IMAGE_MISSING,
        }),
      }),
    );
  });
});
