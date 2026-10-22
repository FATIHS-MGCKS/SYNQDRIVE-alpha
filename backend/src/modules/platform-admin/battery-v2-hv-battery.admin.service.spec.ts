import { NotFoundException } from '@nestjs/common';
import { BatteryV2HvBatteryAdminService } from './battery-v2-hv-battery.admin.service';
import { BatteryDriveProfile } from '../vehicle-intelligence/battery-health/battery-v2-domain';

describe('BatteryV2HvBatteryAdminService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
    hvChargeSession: { findMany: jest.fn() },
    hvBatteryHealthSnapshot: { count: jest.fn(), findFirst: jest.fn() },
    hvCapacityObservation: { count: jest.fn() },
    vehicleBatteryReferenceCapacity: { findFirst: jest.fn() },
    vehicleBatteryCapability: { findUnique: jest.fn() },
  };
  const measurementQuality = {
    getVehicleMeasurementQuality: jest.fn(),
  };
  const assessments = {
    findLatestHvCapacityShadow: jest.fn(),
    findLatestHvSohGateAssessment: jest.fn(),
  };

  const service = new BatteryV2HvBatteryAdminService(
    prisma as never,
    measurementQuality as never,
    assessments as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-1',
      fuelType: 'ELECTRIC',
      organizationId: 'org-1',
    });
    prisma.hvChargeSession.findMany.mockResolvedValue([]);
    prisma.hvBatteryHealthSnapshot.count.mockResolvedValue(0);
    prisma.hvBatteryHealthSnapshot.findFirst.mockResolvedValue(null);
    prisma.vehicleBatteryCapability.findUnique.mockResolvedValue({ id: 'cap' });
    measurementQuality.getVehicleMeasurementQuality.mockResolvedValue({
      vehicleQualityLevel: 'Q1',
      qualityScore: 10,
      capacityConfidence: 'NOT_ESTIMABLE',
      referenceConfidence: 'NONE',
      sohPublicationReadiness: 'BLOCKED',
      sessions: [],
    });
    assessments.findLatestHvCapacityShadow.mockResolvedValue(null);
    assessments.findLatestHvSohGateAssessment.mockResolvedValue(null);
  });

  it('returns HV vehicle context for electric fuel type', async () => {
    const ctx = await service.getVehicleContext({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
    });
    expect(ctx.hvSupported).toBe(true);
    expect(ctx.driveProfile).toBe(BatteryDriveProfile.BEV);
  });

  it('rejects non-HV vehicles for overview', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'veh-ice',
      fuelType: 'DIESEL',
    });
    await expect(
      service.getOverview({ organizationId: 'org-1', vehicleId: 'veh-ice' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns zero episode overview when no sessions exist', async () => {
    const overview = await service.getOverview({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
    });
    expect(overview.physicalChargeEpisodeCount).toBe(0);
    expect(overview.socDataAvailability).toBe('NOT_MEASURED');
    expect(overview.sohEvidence.internalEstimatedSohPercent).toBeNull();
  });
});
