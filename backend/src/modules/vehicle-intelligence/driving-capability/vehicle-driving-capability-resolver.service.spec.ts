import { DrivingCapabilityStatus } from '@prisma/client';
import { VehicleDrivingCapabilityResolverService } from './vehicle-driving-capability-resolver.service';
import { VehicleDrivingCapabilityRepository } from './vehicle-driving-capability.repository';
import {
  DRIVING_CAPABILITY_PROVIDER,
  NATIVE_BEHAVIOR_SIGNALS,
} from './vehicle-driving-capability.types';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cap-1',
    organizationId: 'org-1',
    vehicleId: 'vehicle-lte',
    hardwareProfile: 'LTE_R1',
    providerSource: DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
    signalName: NATIVE_BEHAVIOR_SIGNALS.HARSH_ACCELERATION,
    detectorName: null,
    capabilityKey: NATIVE_BEHAVIOR_SIGNALS.HARSH_ACCELERATION,
    capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
    firstSeenAt: new Date('2026-07-01T00:00:00Z'),
    lastSeenAt: new Date('2026-07-16T00:00:00Z'),
    checkedAt: new Date('2026-07-16T00:00:00Z'),
    effectiveCadenceMs: 7000,
    p95CadenceMs: 9000,
    coverage: 0.88,
    nativeEventAvailable: true,
    metadata: null,
    capabilityVersion: 'cap-probe-v1',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-16T00:00:00Z'),
    ...overrides,
  };
}

describe('VehicleDrivingCapabilityResolverService', () => {
  const prisma = {
    vehicle: { findFirst: jest.fn() },
  } as any;
  const repository = {
    findByVehicle: jest.fn(),
    findOne: jest.fn(),
  } as unknown as VehicleDrivingCapabilityRepository;

  let resolver: VehicleDrivingCapabilityResolverService;

  beforeEach(() => {
    jest.clearAllMocks();
    resolver = new VehicleDrivingCapabilityResolverService(prisma, repository);
  });

  it('returns UNKNOWN when no probe exists — does not infer from LTE_R1 hardware', async () => {
    (repository.findOne as jest.Mock).mockResolvedValue(null);

    const resolved = await resolver.resolveSignal(
      'org-1',
      'vehicle-lte',
      DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
      NATIVE_BEHAVIOR_SIGNALS.HARSH_BRAKING,
    );

    expect(resolved.capabilityStatus).toBe(DrivingCapabilityStatus.UNKNOWN);
    expect(resolved.resolutionSource).toBe('none');
    expect(resolved.nativeEventAvailable).toBeNull();
  });

  it('returns persisted SUPPORTED only when probe row says so', async () => {
    (repository.findOne as jest.Mock).mockResolvedValue(makeRow());

    const resolved = await resolver.resolveSignal(
      'org-1',
      'vehicle-lte',
      DRIVING_CAPABILITY_PROVIDER.DIMO_TELEMETRY,
      NATIVE_BEHAVIOR_SIGNALS.HARSH_ACCELERATION,
    );

    expect(resolved.capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);
    expect(resolved.resolutionSource).toBe('persisted');
    expect(resolved.nativeEventAvailable).toBe(true);
  });

  it('differentiates vehicles with different provider probe outcomes', async () => {
    (repository.findByVehicle as jest.Mock).mockImplementation(
      async (_org: string, vehicleId: string) => {
        if (vehicleId === 'vehicle-lte') {
          return [
            makeRow({
              vehicleId: 'vehicle-lte',
              capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
              nativeEventAvailable: true,
            }),
          ];
        }
        return [
          makeRow({
            id: 'cap-2',
            vehicleId: 'vehicle-smart5',
            hardwareProfile: 'SMART5',
            providerSource: DRIVING_CAPABILITY_PROVIDER.HF_LOCAL,
            signalName: null,
            detectorName: 'hf-cadence-sufficient',
            capabilityKey: 'hf-cadence-sufficient',
            capabilityStatus: DrivingCapabilityStatus.LIMITED,
            nativeEventAvailable: false,
          }),
        ];
      },
    );
    prisma.vehicle.findFirst.mockResolvedValue({
      id: 'vehicle-lte',
      hardwareType: 'LTE_R1',
      fuelType: 'GASOLINE',
    });

    const lte = await resolver.resolveForVehicle('org-1', 'vehicle-lte');
    const smart5 = await resolver.resolveForVehicle('org-1', 'vehicle-smart5');

    expect(lte.capabilities[0].capabilityStatus).toBe(DrivingCapabilityStatus.SUPPORTED);
    expect(smart5.capabilities[0].providerSource).toBe(DRIVING_CAPABILITY_PROVIDER.HF_LOCAL);
    expect(smart5.capabilities[0].capabilityStatus).toBe(DrivingCapabilityStatus.LIMITED);
  });

  it('isNativeBehaviorSignalSupported requires persisted SUPPORTED + nativeEventAvailable', async () => {
    (repository.findOne as jest.Mock).mockResolvedValue(
      makeRow({
        capabilityStatus: DrivingCapabilityStatus.SUPPORTED,
        nativeEventAvailable: true,
      }),
    );
    await expect(
      resolver.isNativeBehaviorSignalSupported(
        'org-1',
        'vehicle-lte',
        NATIVE_BEHAVIOR_SIGNALS.HARSH_ACCELERATION,
      ),
    ).resolves.toBe(true);

    (repository.findOne as jest.Mock).mockResolvedValue(null);
    await expect(
      resolver.isNativeBehaviorSignalSupported(
        'org-1',
        'vehicle-lte',
        NATIVE_BEHAVIOR_SIGNALS.HARSH_ACCELERATION,
      ),
    ).resolves.toBe(false);
  });
});
