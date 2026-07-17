import { BadRequestException } from '@nestjs/common';
import { ReferenceCapacityVerificationStatus } from '../battery-v2-domain';
import {
  BatteryReferenceCapacitySource,
  BatteryReferenceCapacityType,
} from '../battery-v2-domain';
import { VehicleBatteryReferenceCapacityService } from './vehicle-battery-reference-capacity.service';

describe('VehicleBatteryReferenceCapacityService', () => {
  const organizationId = 'org-1';
  const vehicleId = 'veh-tesla-ksfh';
  const actorUserId = 'user-admin';

  const repository = {
    findActiveForVehicle: jest.fn(),
    listHistory: jest.fn(),
    listAuditTrail: jest.fn(),
    createWithSupersede: jest.fn(),
    updateVerified: jest.fn(),
    updateNotes: jest.fn(),
    appendChange: jest.fn(),
  };

  let service: VehicleBatteryReferenceCapacityService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VehicleBatteryReferenceCapacityService(repository as any);
    repository.findActiveForVehicle.mockResolvedValue(null);
    repository.appendChange.mockResolvedValue({ id: 'change-1' });
  });

  it('creates UNVERIFIED usable capacity for Tesla 57 kWh spec', async () => {
    repository.createWithSupersede.mockResolvedValue({
      id: 'ref-1',
      organizationId,
      vehicleId,
      capacityKwh: 57,
      capacityType: BatteryReferenceCapacityType.USABLE,
      source: BatteryReferenceCapacitySource.VERIFIED_VEHICLE_SPEC,
      verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
      verifiedByUserId: null,
      verifiedAt: null,
      documentId: null,
      serviceEventId: null,
      effectiveFrom: new Date('2026-07-16T12:00:00.000Z'),
      effectiveTo: null,
      isActive: true,
      supersededById: null,
      notes: 'KS FH 660E registration value',
      createdAt: new Date('2026-07-16T12:00:00.000Z'),
    });

    const result = await service.create(
      organizationId,
      vehicleId,
      {
        capacityKwh: 57,
        capacityType: BatteryReferenceCapacityType.USABLE,
        source: BatteryReferenceCapacitySource.VERIFIED_VEHICLE_SPEC,
        notes: 'KS FH 660E registration value',
      },
      actorUserId,
    );

    expect(result.verificationStatus).toBe(
      ReferenceCapacityVerificationStatus.UNVERIFIED,
    );
    expect(result.capacityKwh).toBe(57);
    expect(repository.appendChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATED' }),
    );
  });

  it('supersedes active spec instead of silent overwrite', async () => {
    repository.findActiveForVehicle.mockResolvedValue({
      id: 'ref-old',
      verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
      capacityKwh: 57,
    });
    repository.createWithSupersede.mockResolvedValue({
      id: 'ref-new',
      organizationId,
      vehicleId,
      capacityKwh: 57.2,
      capacityType: BatteryReferenceCapacityType.USABLE,
      source: BatteryReferenceCapacitySource.BMS_REPORT,
      verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
      verifiedByUserId: null,
      verifiedAt: null,
      documentId: 'doc-1',
      serviceEventId: null,
      effectiveFrom: new Date(),
      effectiveTo: null,
      isActive: true,
      supersededById: null,
      notes: null,
      createdAt: new Date(),
    });

    await service.create(
      organizationId,
      vehicleId,
      {
        capacityKwh: 57.2,
        capacityType: BatteryReferenceCapacityType.USABLE,
        source: BatteryReferenceCapacitySource.BMS_REPORT,
        documentId: 'doc-1',
      },
      actorUserId,
    );

    expect(repository.createWithSupersede).toHaveBeenCalledWith(
      expect.objectContaining({ supersedeActiveId: 'ref-old' }),
    );
    expect(repository.appendChange).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SUPERSEDED', referenceCapacityId: 'ref-old' }),
    );
  });

  it('verifies active reference capacity with audit trail', async () => {
    repository.findActiveForVehicle.mockResolvedValue({
      id: 'ref-1',
      organizationId,
      vehicleId,
      capacityKwh: 57,
      capacityType: BatteryReferenceCapacityType.USABLE,
      source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      verificationStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
      verifiedByUserId: null,
      verifiedAt: null,
      documentId: null,
      serviceEventId: null,
      effectiveFrom: new Date(),
      effectiveTo: null,
      isActive: true,
      supersededById: null,
      notes: null,
      createdAt: new Date(),
    });
    repository.updateVerified.mockResolvedValue({
      id: 'ref-1',
      organizationId,
      vehicleId,
      capacityKwh: 57,
      capacityType: BatteryReferenceCapacityType.USABLE,
      source: BatteryReferenceCapacitySource.MANUAL_VERIFIED,
      verificationStatus: ReferenceCapacityVerificationStatus.VERIFIED,
      verifiedByUserId: actorUserId,
      verifiedAt: new Date('2026-07-16T13:00:00.000Z'),
      documentId: null,
      serviceEventId: null,
      effectiveFrom: new Date(),
      effectiveTo: null,
      isActive: true,
      supersededById: null,
      notes: 'Workshop confirmed',
      createdAt: new Date(),
    });

    const result = await service.verify(
      organizationId,
      vehicleId,
      'ref-1',
      { notes: 'Workshop confirmed' },
      actorUserId,
    );

    expect(result.verificationStatus).toBe(
      ReferenceCapacityVerificationStatus.VERIFIED,
    );
    expect(result.verifiedByUserId).toBe(actorUserId);
    expect(repository.appendChange).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'VERIFIED',
        previousStatus: ReferenceCapacityVerificationStatus.UNVERIFIED,
        newStatus: ReferenceCapacityVerificationStatus.VERIFIED,
      }),
    );
  });

  it('rejects disallowed legacy vehicle master source', async () => {
    await expect(
      service.create(organizationId, vehicleId, {
        capacityKwh: 57,
        capacityType: BatteryReferenceCapacityType.USABLE,
        source: BatteryReferenceCapacitySource.VEHICLE_MASTER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
