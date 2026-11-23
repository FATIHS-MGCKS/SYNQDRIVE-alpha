import { DocumentExtractionStatus, DocumentExtractionType } from '@prisma/client';
import { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import {
  assertHmOnlyBatteryInputContract,
  resolveHmOnlyHvBatteryReference,
} from './hm-only-canonical-battery-document-substantiation';

const baseDto = {
  hmVehicleId: 'hm-1',
  organizationId: 'org-a',
  hvBatteryUsableCapacityKwh: 64,
  hvBatteryReferenceDocumentId: 'doc-1',
};

function docFixture(overrides?: Partial<Record<string, unknown>>) {
  return {
    organizationId: 'org-a',
    vehicleId: null,
    status: DocumentExtractionStatus.CONFIRMED,
    effectiveDocumentType: DocumentExtractionType.REGISTRATION_CERTIFICATE,
    confirmedData: {
      scope: 'hv',
      capacityKwh: 64,
    },
    extractedData: null,
    ...overrides,
  };
}

describe('hm-only-canonical-battery-document-substantiation', () => {
  it('rejects serviceEventId at HM input contract', () => {
    expect(() =>
      assertHmOnlyBatteryInputContract({
        ...baseDto,
        hvBatteryReferenceServiceEventId: 'evt-1',
      }),
    ).toThrow(VehicleOnboardingError);
  });

  it('rejects arbitrary document for MANUFACTURER_VERIFIED without substantiation', async () => {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn().mockResolvedValue(
          docFixture({
            status: DocumentExtractionStatus.READY_FOR_REVIEW,
            confirmedData: { scope: 'hv', capacityKwh: 64 },
          }),
        ),
      },
    };
  await expect(
      resolveHmOnlyHvBatteryReference(prisma as never, 'org-a', {
        ...baseDto,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CAPTURE_PAYLOAD' });
  });

  it('rejects MANUFACTURER_VERIFIED when document capacity mismatches', async () => {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn().mockResolvedValue(
          docFixture({ confirmedData: { scope: 'hv', capacityKwh: 50 } }),
        ),
      },
    };
    await expect(
      resolveHmOnlyHvBatteryReference(prisma as never, 'org-a', {
        ...baseDto,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CAPTURE_PAYLOAD' });
  });

  it('accepts MANUFACTURER_VERIFIED when document substantiates HV capacity', async () => {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn().mockResolvedValue(docFixture()),
      },
    };
    const ref = await resolveHmOnlyHvBatteryReference(prisma as never, 'org-a', {
      ...baseDto,
      hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
    });
    expect(ref).toMatchObject({
      source: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      documentId: 'doc-1',
      capacityKwh: 64,
      serviceEventId: null,
    });
  });

  it('accepts MANUAL_VERIFIED with org-scoped onboarding document', async () => {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org-a',
          vehicleId: null,
        }),
      },
    };
    const ref = await resolveHmOnlyHvBatteryReference(prisma as never, 'org-a', {
      ...baseDto,
      hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
    });
    expect(ref?.source).toBe(BatteryReferenceCapacitySource.MANUAL_VERIFIED);
  });

  it('rejects cross-tenant document references', async () => {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn().mockResolvedValue({
          organizationId: 'org-other',
          vehicleId: null,
        }),
      },
    };
    await expect(
      resolveHmOnlyHvBatteryReference(prisma as never, 'org-a', {
        ...baseDto,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      }),
    ).rejects.toMatchObject({ code: 'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH' });
  });

  it('requires HV_BMS_REPORT signal for BMS_REPORT source', async () => {
    const prisma = {
      vehicleDocumentExtraction: {
        findUnique: jest.fn().mockResolvedValue(
          docFixture({
            effectiveDocumentType: DocumentExtractionType.BATTERY,
            confirmedData: { scope: 'hv', capacityKwh: 64, sohSource: 'HV_BMS_REPORT' },
          }),
        ),
      },
    };
    const ref = await resolveHmOnlyHvBatteryReference(prisma as never, 'org-a', {
      ...baseDto,
      hvBatteryReferenceSource: BatteryReferenceCapacitySource.BMS_REPORT,
    });
    expect(ref?.source).toBe(BatteryReferenceCapacitySource.BMS_REPORT);
  });
});