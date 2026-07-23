import { BookingPickupGateService } from './booking-pickup-gate.service';
import { BookingPickupGateAuditService } from './booking-pickup-gate-audit.service';
import { PickupGateBlockedException } from './booking-pickup-gate.errors';
import {
  PICKUP_GATE_CODE,
  PICKUP_GATE_EVENT_TYPE,
} from './booking-pickup-gate.constants';
import {
  BUNDLE_COMPLETENESS_REASON_CODE,
  BUNDLE_COMPLETENESS_STATUS,
} from '@modules/documents/booking-document-completeness.constants';
import { DOCUMENT_TYPE } from '@modules/documents/documents.constants';
import type { BundleCompletenessResult } from '@modules/documents/booking-document-completeness.types';

const actor = {
  userId: 'user-1',
  displayName: 'Operator One',
  membershipRole: 'ORG_MEMBER',
};

const baseInput = {
  organizationId: 'org-1',
  bookingId: 'bk-1',
  actor,
  payload: {
    documentsAcknowledged: true,
    customerSignatureName: 'Customer',
    customerSignatureDataUrl: 'data:image/png;base64,abc',
  },
};

function completeLegalSlots() {
  return {
    terms: {
      documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
      required: true,
      present: true,
      scopeExempt: false,
      generatedDocumentId: 'gen-terms',
      legalDocumentId: 'legal-terms',
      integrityStatus: 'VERIFIED',
      scanStatus: 'PASSED',
    },
    consumer: {
      documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
      required: true,
      present: true,
      scopeExempt: false,
      generatedDocumentId: 'gen-consumer',
      legalDocumentId: 'legal-consumer',
      integrityStatus: 'VERIFIED',
      scanStatus: 'PASSED',
    },
    privacy: {
      documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
      required: true,
      present: true,
      scopeExempt: false,
      generatedDocumentId: 'gen-privacy',
      legalDocumentId: 'legal-privacy',
      integrityStatus: 'VERIFIED',
      scanStatus: 'PASSED',
    },
  };
}

function completeBundleResult(overrides: Partial<BundleCompletenessResult> = {}): BundleCompletenessResult {
  return {
    status: BUNDLE_COMPLETENESS_STATUS.COMPLETE,
    legacyBundleStatus: 'COMPLETE',
    missingItems: [],
    blockingReasons: [],
    nonBlockingWarnings: [],
    evaluatedAt: new Date().toISOString(),
    resolverVersion: 'v1',
    affectedDocumentTypes: [],
    phases: [],
    legal: completeLegalSlots(),
    orgConfigurationGaps: [],
    cumulativeRequiredTypes: [],
    presentTypes: [],
    ...overrides,
  };
}

function makeGateService(options: {
  completeness?: BundleCompletenessResult;
  generationJobCount?: number;
  crossTenantDocs?: number;
  booking?: Record<string, unknown> | null;
  customer?: Record<string, unknown> | null;
  deliveryEvidence?: Array<Record<string, unknown>>;
  canOverride?: boolean;
}) {
  const completeness = {
    evaluateForBooking: jest.fn().mockResolvedValue(
      options.completeness ?? completeBundleResult(),
    ),
  };
  const audit = {
    appendBlocked: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    appendInTransaction: jest.fn(),
  };
  const prisma = {
    booking: {
      findFirst: jest.fn().mockResolvedValue(
        options.booking === null
          ? null
          : {
              id: 'bk-1',
              organizationId: 'org-1',
              customerId: 'cust-1',
              vehicleId: 'veh-1',
              status: 'CONFIRMED',
              startDate: new Date(),
              ...(options.booking ?? {}),
            },
      ),
    },
    customer: {
      findFirst: jest.fn().mockResolvedValue(
        options.customer === null ? null : { id: 'cust-1', ...(options.customer ?? {}) },
      ),
    },
    generatedDocument: {
      count: jest.fn().mockResolvedValue(options.crossTenantDocs ?? 0),
    },
    bookingDocumentGenerationJob: {
      count: jest.fn().mockResolvedValue(options.generationJobCount ?? 0),
    },
    legalDocumentDeliveryEvidence: {
      findMany: jest.fn().mockResolvedValue(
        options.deliveryEvidence ?? [
          {
            documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
            presentedAt: new Date(),
            acknowledgedAt: new Date(),
          },
          {
            documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION,
            presentedAt: new Date(),
            acknowledgedAt: new Date(),
          },
          {
            documentType: DOCUMENT_TYPE.PRIVACY_POLICY,
            presentedAt: new Date(),
            acknowledgedAt: new Date(),
          },
        ],
      ),
    },
    organizationMembership: {
      findFirst: jest.fn().mockResolvedValue(
        options.canOverride === false
          ? { role: 'ORG_MEMBER', permissions: {} }
          : { role: 'ORG_ADMIN', permissions: {} },
      ),
    },
  };

  const service = new BookingPickupGateService(
    prisma as any,
    completeness as any,
    audit as unknown as BookingPickupGateAuditService,
  );
  return { service, prisma, completeness, audit };
}

describe('BookingPickupGateService (integration)', () => {
  it('allows successful pickup when all prerequisites are met', async () => {
    const { service } = makeGateService({});
    const result = await service.evaluatePickupGate(baseInput);
    expect(result.allowed).toBe(true);
    expect(result.requirements).toHaveLength(0);
  });

  it('blocks pickup when privacy policy is missing', async () => {
    const { service } = makeGateService({
      completeness: completeBundleResult({
        legal: {
          ...completeLegalSlots(),
          privacy: { ...completeLegalSlots().privacy, present: false },
        },
      }),
      deliveryEvidence: [
        { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, presentedAt: new Date(), acknowledgedAt: new Date() },
        { documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION, presentedAt: new Date(), acknowledgedAt: new Date() },
      ],
    });
    const result = await service.evaluatePickupGate(baseInput);
    expect(result.allowed).toBe(false);
    expect(result.softBlocks.some((b) => b.code === PICKUP_GATE_CODE.PRIVACY_POLICY_MISSING)).toBe(true);
  });

  it('blocks pickup when consumer information is missing', async () => {
    const { service } = makeGateService({
      completeness: completeBundleResult({
        legal: {
          ...completeLegalSlots(),
          consumer: { ...completeLegalSlots().consumer, present: false },
        },
      }),
    });
    const result = await service.evaluatePickupGate(baseInput);
    expect(result.softBlocks.some((b) => b.code === PICKUP_GATE_CODE.CONSUMER_INFO_MISSING)).toBe(true);
  });

  it('blocks pickup when legal acknowledgment is missing', async () => {
    const { service } = makeGateService({
      deliveryEvidence: [
        { documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS, presentedAt: new Date(), acknowledgedAt: null },
        { documentType: DOCUMENT_TYPE.CONSUMER_INFORMATION, presentedAt: new Date(), acknowledgedAt: null },
        { documentType: DOCUMENT_TYPE.PRIVACY_POLICY, presentedAt: new Date(), acknowledgedAt: null },
      ],
    });
    const result = await service.evaluatePickupGate({
      ...baseInput,
      payload: {
        ...baseInput.payload,
        documentsAcknowledged: false,
        customerSignatureName: null,
        customerSignatureDataUrl: null,
      },
    });
    expect(result.softBlocks.some((b) => b.code === PICKUP_GATE_CODE.LEGAL_ACKNOWLEDGMENT_MISSING)).toBe(true);
    expect(result.softBlocks.some((b) => b.code === PICKUP_GATE_CODE.DOCUMENTS_NOT_ACKNOWLEDGED)).toBe(true);
    expect(result.softBlocks.some((b) => b.code === PICKUP_GATE_CODE.SIGNATURE_MISSING)).toBe(true);
  });

  it('blocks pickup while mandatory generation is in progress', async () => {
    const { service } = makeGateService({ generationJobCount: 2 });
    const result = await service.evaluatePickupGate(baseInput);
    expect(result.hardBlocks.some((b) => b.code === PICKUP_GATE_CODE.GENERATION_IN_PROGRESS)).toBe(true);
  });

  it('blocks pickup on checksum / integrity deviation', async () => {
    const { service } = makeGateService({
      completeness: completeBundleResult({
        status: BUNDLE_COMPLETENESS_STATUS.INTEGRITY_FAILED,
        blockingReasons: [
          {
            code: BUNDLE_COMPLETENESS_REASON_CODE.INTEGRITY_CHECKSUM_MISMATCH,
            message: 'Checksum mismatch',
            blocking: true,
            documentType: DOCUMENT_TYPE.RENTAL_CONTRACT,
          },
        ],
      }),
    });
    const result = await service.evaluatePickupGate(baseInput);
    expect(result.hardBlocks.some((b) => b.code === PICKUP_GATE_CODE.INTEGRITY_FAILED)).toBe(true);
  });

  it('blocks pickup for foreign tenant booking', async () => {
    const { service } = makeGateService({ booking: null });
    const result = await service.evaluatePickupGate(baseInput);
    expect(result.hardBlocks.some((b) => b.code === PICKUP_GATE_CODE.TENANT_MISMATCH)).toBe(true);
  });

  it('allows authorized override with mandatory reason', async () => {
    const { service } = makeGateService({
      completeness: completeBundleResult({
        legal: {
          ...completeLegalSlots(),
          privacy: { ...completeLegalSlots().privacy, present: false },
        },
      }),
      canOverride: true,
    });
    const result = await service.evaluatePickupGate({
      ...baseInput,
      overrideReason: 'Customer accepted paper copy on site',
    });
    expect(result.allowed).toBe(true);
    expect(result.overrideUsed).toBe(true);
  });

  it('denies override without permission', async () => {
    const { service } = makeGateService({
      completeness: completeBundleResult({
        legal: {
          ...completeLegalSlots(),
          privacy: { ...completeLegalSlots().privacy, present: false },
        },
      }),
      canOverride: false,
    });
    const result = await service.evaluatePickupGate({
      ...baseInput,
      overrideReason: 'Attempted override',
    });
    expect(result.allowed).toBe(false);
    expect(result.hardBlocks.some((b) => b.code === PICKUP_GATE_CODE.OVERRIDE_DENIED)).toBe(true);
  });

  it('rejects manipulated actor id from client payload', async () => {
    const { service } = makeGateService({});
    const result = await service.evaluatePickupGate({
      ...baseInput,
      payload: {
        ...baseInput.payload,
        performedByUserId: 'attacker-user',
      },
    });
    expect(result.hardBlocks.some((b) => b.code === PICKUP_GATE_CODE.ACTOR_MANIPULATION)).toBe(true);
  });

  it('assertPickupAllowed throws structured error and appends blocked audit', async () => {
    const { service, audit } = makeGateService({ generationJobCount: 1 });
    await expect(service.assertPickupAllowed(baseInput)).rejects.toBeInstanceOf(PickupGateBlockedException);
    expect(audit.appendBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: PICKUP_GATE_EVENT_TYPE.BLOCKED,
        bookingId: 'bk-1',
      }),
    );
  });
});

describe('BookingsHandoverService pickup idempotency', () => {
  it('returns existing protocol when duplicate pickup request on ACTIVE booking', async () => {
    const { BookingsHandoverService } = require('../bookings-handover.service');
    const existingProtocol = {
      id: 'proto-1',
      bookingId: 'bk-1',
      vehicleId: 'veh-1',
      kind: 'PICKUP',
      performedAt: new Date(),
      performedByUserId: 'user-1',
      performedByName: 'Operator',
      odometerKm: 1000,
      fuelPercent: 80,
      fuelFull: false,
      exteriorClean: true,
      interiorClean: true,
      tiresSeasonOk: true,
      warningLightsOn: false,
      warningLightsNotes: null,
      notes: null,
      customerSignatureName: 'Customer',
      customerSignatureDataUrl: null,
      staffSignatureName: null,
      staffSignatureDataUrl: null,
      documentsAcknowledged: true,
      damageIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      bookingHandoverProtocol: {
        findUnique: jest.fn().mockResolvedValue(existingProtocol),
      },
      booking: {
        findFirst: jest.fn().mockResolvedValue({ id: 'bk-1', status: 'ACTIVE' }),
      },
    };
    const handoverSignatures = {
      summariesForProtocolIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'proto-1',
            {
              customer: {
                signaturePresent: true,
                signedAt: existingProtocol.performedAt.toISOString(),
                signatureReferenceId: 'sig-c',
              },
              staff: {
                signaturePresent: false,
                signedAt: null,
                signatureReferenceId: null,
              },
            },
          ],
        ]),
      ),
      buildProtocolCompleted: jest.fn().mockReturnValue(false),
    };
    const svc = new BookingsHandoverService(
      prisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      handoverSignatures as any,
    );
    const result = await svc.createHandover('org-1', 'bk-1', 'PICKUP', {
      odometerKm: 1000,
      fuelPercent: 80,
    }, actor);
    expect(result.booking.status).toBe('ACTIVE');
    expect(result.protocol.id).toBe('proto-1');
  });
});
