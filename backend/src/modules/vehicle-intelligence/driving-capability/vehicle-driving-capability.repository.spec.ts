import { DrivingCapabilityStatus } from '@prisma/client';
import { VehicleDrivingCapabilityRepository } from './vehicle-driving-capability.repository';
import { DRIVING_CAPABILITY_PROVIDER } from './vehicle-driving-capability.types';

function makePrisma() {
  return {
    vehicle: { findFirst: jest.fn() },
    vehicleDrivingCapability: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  } as any;
}

describe('VehicleDrivingCapabilityRepository', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let repository: VehicleDrivingCapabilityRepository;

  beforeEach(() => {
    prisma = makePrisma();
    repository = new VehicleDrivingCapabilityRepository(prisma);
  });

  it('scopes findByVehicle to organization + vehicle', async () => {
    prisma.vehicleDrivingCapability.findMany.mockResolvedValue([]);
    await repository.findByVehicle('org-1', 'vehicle-a');
    expect(prisma.vehicleDrivingCapability.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', vehicleId: 'vehicle-a' },
      orderBy: [{ providerSource: 'asc' }, { capabilityKey: 'asc' }],
    });
  });

  it('upserts DIMO probe for LTE vehicle with tenant check', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-lte' });
    prisma.vehicleDrivingCapability.upsert.mockResolvedValue({ id: 'cap-1' });

    await repository.upsertProbe({
      organizationId: 'org-1',
      vehicleId: 'vehicle-lte',
      hardwareProfile: 'LTE_R1',
      providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
      signalName: 'behavior.harshAcceleration',
      capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
      checkedAt: new Date('2026-07-16T10:00:00Z'),
      nativeEventAvailable: true,
      effectiveCadenceMs: 8000,
      p95CadenceMs: 12000,
      coverage: 0.92,
      capabilityVersion: 'cap-probe-v1',
    });

    expect(prisma.vehicleDrivingCapability.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_vehicleId_providerSource_capabilityKey: {
            organizationId: 'org-1',
            vehicleId: 'vehicle-lte',
            providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
            capabilityKey: 'behavior.harshAcceleration',
          },
        },
        create: expect.objectContaining({
          capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
          nativeEventAvailable: true,
        }),
      }),
    );
  });

  it('stores HF detector capability for SMART5 without inferring from hardware', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-smart5' });
    prisma.vehicleDrivingCapability.upsert.mockResolvedValue({ id: 'cap-2' });

    await repository.upsertProbe({
      organizationId: 'org-1',
      vehicleId: 'vehicle-smart5',
      hardwareProfile: 'SMART5',
      providerSource: DRIVING_CAPABILITY_PROVIDER.HF_LOCAL,
      detectorName: 'hf-cadence-sufficient',
      capabilityStatus: DrivingCapabilityStatus.LIMITED,
      checkedAt: new Date('2026-07-16T11:00:00Z'),
      effectiveCadenceMs: 1200,
      coverage: 0.55,
      capabilityVersion: 'cap-probe-v1',
    });

    expect(prisma.vehicleDrivingCapability.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          detectorName: 'hf-cadence-sufficient',
          signalName: null,
          capabilityKey: 'hf-cadence-sufficient',
          capabilityStatus: DrivingCapabilityStatus.LIMITED,
        }),
      }),
    );
  });

  it('downgrades UNSUPPORTED to DEGRADED when provider error metadata is present', async () => {
    prisma.vehicle.findFirst.mockResolvedValue({ id: 'vehicle-lte' });
    prisma.vehicleDrivingCapability.upsert.mockResolvedValue({ id: 'cap-3' });

    await repository.upsertProbe({
      organizationId: 'org-1',
      vehicleId: 'vehicle-lte',
      hardwareProfile: 'LTE_R1',
      providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
      signalName: 'behavior.harshBraking',
      capabilityStatus: DrivingCapabilityStatus.UNSUPPORTED,
      checkedAt: new Date('2026-07-16T12:00:00Z'),
      metadata: { providerError: true, providerErrorCode: 'DIMO_503' },
      capabilityVersion: 'cap-probe-v1',
    });

    expect(prisma.vehicleDrivingCapability.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          capabilityStatus: DrivingCapabilityStatus.DEGRADED,
        }),
        update: expect.objectContaining({
          capabilityStatus: DrivingCapabilityStatus.DEGRADED,
        }),
      }),
    );
  });
});
