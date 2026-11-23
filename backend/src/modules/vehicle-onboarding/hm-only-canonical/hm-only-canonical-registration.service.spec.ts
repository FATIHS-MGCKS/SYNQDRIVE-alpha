import { ConflictException, NotFoundException } from '@nestjs/common';
import { DocumentExtractionStatus, DocumentExtractionType } from '@prisma/client';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import { BatteryReferenceCapacitySource } from '@modules/vehicle-intelligence/battery-health/battery-v2-domain';
import { HmOnlyCanonicalRegistrationService } from './hm-only-canonical-registration.service';

function buildHarness(overrides?: {
  hmRecord?: Record<string, unknown>;
  existingVehicle?: unknown | null;
  adoptCase?: { id: string; concurrencyToken: string };
  readiness?: { decision: string; blockingFailureCount: number };
  activation?: { vehicleId: string };
}) {
  const hmRecord = {
    id: 'hm-1',
    organizationId: 'org-a',
    vin: 'WBA12345678901234',
    brand: 'BMW',
    clearanceStatus: 'APPROVED',
    sourceMode: 'HM_ONLY',
    registrationState: 'NOT_REGISTERED',
    synqdriveVehicleId: null,
    ...overrides?.hmRecord,
  };

  const prisma = {
    highMobilityVehicle: {
      findUnique: jest.fn().mockResolvedValue(hmRecord),
    },
    vehicle: {
      findFirst: jest.fn().mockResolvedValue(overrides?.existingVehicle ?? null),
    },
    vehicleOnboardingCase: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    organization: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
    organizationProduct: {
      findMany: jest.fn().mockResolvedValue([
        { product: { slug: 'RENTAL' }, status: 'ACTIVE' },
      ]),
    },
    vehicleDocumentExtraction: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };

  const sourceAdoption = {
    adoptProviderSource: jest.fn().mockResolvedValue(
      overrides?.adoptCase ?? { id: 'case-1', concurrencyToken: 'tok-1' },
    ),
  };
  const capture = {
    updateAdminBaseline: jest.fn().mockResolvedValue({ case: { concurrencyToken: 'tok-2' } }),
    updateIdentityOperatorModelYear: jest.fn().mockResolvedValue({ case: { concurrencyToken: 'tok-2a' } }),
    updateIdentityOperatorFuelType: jest.fn().mockResolvedValue({ case: { concurrencyToken: 'tok-2b' } }),
    updateTechnicalBaseline: jest.fn().mockResolvedValue({ case: { concurrencyToken: 'tok-3' } }),
  };
  const readiness = {
    evaluateAndSealReadiness: jest.fn().mockResolvedValue(
      overrides?.readiness ?? { decision: 'READY', blockingFailureCount: 0 },
    ),
  };
  const activation = {
    activateVehicle: jest.fn().mockResolvedValue(
      overrides?.activation ?? { vehicleId: 'veh-canonical' },
    ),
  };

  const service = new HmOnlyCanonicalRegistrationService(
    prisma as never,
    sourceAdoption as never,
    capture as never,
    readiness as never,
    activation as never,
  );

  return { service, prisma, sourceAdoption, capture, readiness, activation, hmRecord };
}

describe('HmOnlyCanonicalRegistrationService (V2B-PR2)', () => {
  it('happy path orchestrates adopt → capture → readiness → activation', async () => {
    const { service, sourceAdoption, capture, readiness, activation } = buildHarness();
    const result = await service.register({
      dto: { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'iX', year: 2023 },
      access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'user-actor' },
    });
    expect(result.synqdriveVehicleId).toBe('veh-canonical');
    expect(sourceAdoption.adoptProviderSource).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'HIGH_MOBILITY',
        sourceMirrorId: 'hm-1',
        idempotencyKey: 'hm-only-canonical-register:v1:org-a:hm-1',
      }),
    );
    expect(capture.updateAdminBaseline).toHaveBeenCalled();
    expect(capture.updateIdentityOperatorModelYear).toHaveBeenCalled();
    expect(capture.updateTechnicalBaseline).toHaveBeenCalled();
    expect(readiness.evaluateAndSealReadiness).toHaveBeenCalled();
    expect(activation.activateVehicle).toHaveBeenCalledWith(
      expect.objectContaining({ onboardingCaseId: 'case-1' }),
    );
  });

  it('returns same vehicle id on idempotent replay when case completed', async () => {
    const { service, prisma, sourceAdoption, activation } = buildHarness({
      hmRecord: { synqdriveVehicleId: 'veh-existing', registrationState: 'REGISTERED' },
    });
    prisma.vehicle.findFirst = jest.fn().mockResolvedValue({
      id: 'veh-existing',
      vin: 'WBA12345678901234',
      organizationId: 'org-a',
      registryLifecycle: 'ACTIVE',
    });
    prisma.vehicleOnboardingCase.findFirst = jest.fn().mockResolvedValue({
      id: 'case-done',
      vehicleId: 'veh-existing',
    });

    const result = await service.register({
      dto: { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'iX', year: 2023 },
      access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'user-actor' },
    });

    expect(result.synqdriveVehicleId).toBe('veh-existing');
    expect(sourceAdoption.adoptProviderSource).not.toHaveBeenCalled();
    expect(activation.activateVehicle).not.toHaveBeenCalled();
  });

  it('fail-closed on readiness NOT_READY', async () => {
    const { service } = buildHarness({
      readiness: { decision: 'NOT_READY', blockingFailureCount: 2 },
    });
    await expect(
      service.register({
        dto: { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'iX', year: 2023 },
        access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
      }),
    ).rejects.toMatchObject({ code: 'READINESS_NOT_SEALED' });
  });

  it('rejects missing HM record', async () => {
    const { service, prisma } = buildHarness();
    prisma.highMobilityVehicle.findUnique = jest.fn().mockResolvedValue(null);
    await expect(
      service.register({
        dto: { hmVehicleId: 'hm-missing', organizationId: 'org-a', model: 'iX', year: 2023 },
        access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects duplicate VIN for different vehicle', async () => {
    const { service } = buildHarness({
      existingVehicle: {
        id: 'veh-other',
        organizationId: 'org-a',
        registryLifecycle: 'ACTIVE',
      },
    });
    await expect(
      service.register({
        dto: { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'iX', year: 2023 },
        access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('passes capture concurrency tokens through admin and technical mutations', async () => {
    const { service, capture, sourceAdoption } = buildHarness();
    await service.register({
      dto: { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'iX', year: 2023 },
      access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'user-actor' },
    });
    expect(capture.updateAdminBaseline).toHaveBeenCalledWith(
      expect.objectContaining({ expectedConcurrencyToken: 'tok-1' }),
    );
    expect(sourceAdoption.adoptProviderSource).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'user-actor' }),
    );
  });

  it('does not persist synthetic HV battery on electric fuel without operator evidence', async () => {
    const { service, capture } = buildHarness();
    await service.register({
      dto: {
        hmVehicleId: 'hm-1',
        organizationId: 'org-a',
        model: 'iX',
        year: 2023,
        fuelType: 'electric',
      },
      access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'user-actor' },
    });
    const technicalCall = capture.updateTechnicalBaseline.mock.calls[0][0];
    expect(technicalCall.body.hvBatteryReference).toBeUndefined();
  });

  it('forwards substantiated MANUFACTURER_VERIFIED HV reference through capture', async () => {
    const { service, capture, prisma } = buildHarness();
    prisma.vehicleDocumentExtraction = {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: 'org-a',
        vehicleId: null,
        status: DocumentExtractionStatus.CONFIRMED,
        effectiveDocumentType: DocumentExtractionType.REGISTRATION_CERTIFICATE,
        confirmedData: { scope: 'hv', capacityKwh: 64 },
        extractedData: null,
      }),
    };
    await service.register({
      dto: {
        hmVehicleId: 'hm-1',
        organizationId: 'org-a',
        model: 'iX',
        year: 2023,
        fuelType: 'electric',
        hvBatteryUsableCapacityKwh: 64,
        hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
        hvBatteryReferenceDocumentId: 'doc-org-a',
      },
      access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'user-actor' },
    });
    expect(capture.updateTechnicalBaseline.mock.calls[0][0].body.hvBatteryReference).toMatchObject({
      capacityKwh: 64,
      source: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
      documentId: 'doc-org-a',
      serviceEventId: null,
    });
    expect(capture.updateIdentityOperatorFuelType).toHaveBeenCalled();
  });

  it('rejects hvBatteryReferenceServiceEventId on HM canonical path', async () => {
    const { service } = buildHarness();
    await expect(
      service.register({
        dto: {
          hmVehicleId: 'hm-1',
          organizationId: 'org-a',
          model: 'iX',
          year: 2023,
          hvBatteryUsableCapacityKwh: 64,
          hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
          hvBatteryReferenceServiceEventId: 'evt-1',
        },
        access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'user-actor' },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CAPTURE_PAYLOAD' });
  });

  it('rejects cross-tenant battery evidence references', async () => {
    const { service, prisma } = buildHarness();
    prisma.vehicleDocumentExtraction = {
      findUnique: jest.fn().mockResolvedValue({
        organizationId: 'org-other',
        vehicleId: null,
      }),
    };
    await expect(
      service.register({
        dto: {
          hmVehicleId: 'hm-1',
          organizationId: 'org-a',
          model: 'iX',
          year: 2023,
          fuelType: 'ELECTRIC',
          hvBatteryUsableCapacityKwh: 64,
          hvBatteryReferenceSource: BatteryReferenceCapacitySource.MANUFACTURER_VERIFIED,
          hvBatteryReferenceDocumentId: 'doc-other-org',
        },
        access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: 'user-actor' },
      }),
    ).rejects.toMatchObject({ code: 'TECHNICAL_BASELINE_EVIDENCE_SCOPE_MISMATCH' });
  });

  it('surfaces capture concurrency conflicts without bypassing capture APIs', async () => {
    const { service, capture } = buildHarness();
    capture.updateTechnicalBaseline.mockRejectedValueOnce(
      new VehicleOnboardingError('ONBOARDING_CONCURRENCY_CONFLICT', 'Stale token'),
    );
    await expect(
      service.register({
        dto: { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'iX', year: 2023 },
        access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects OFFBOARDED lifecycle VIN collision', async () => {
    const { service } = buildHarness({
      existingVehicle: {
        id: 'veh-off',
        organizationId: 'org-a',
        registryLifecycle: 'OFFBOARDED',
      },
    });
    await expect(
      service.register({
        dto: { hmVehicleId: 'hm-1', organizationId: 'org-a', model: 'iX', year: 2023 },
        access: { tenantOrganizationId: 'org-a', isMasterAdmin: false, actorUserId: null },
      }),
    ).rejects.toBeInstanceOf(VehicleOnboardingError);
  });
});