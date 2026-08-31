import { ReferenceCaptureMassBindingService } from './reference-capture-mass-binding.service';

describe('ReferenceCaptureMassBindingService (RP-044)', () => {
  it('binds manufacturer curb weight when available', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          curbWeightKg: 1650,
          frontWeightDistributionPct: 58,
          make: 'VW',
          model: 'Golf',
        }),
      },
    };
    const service = new ReferenceCaptureMassBindingService(prisma as never);
    const binding = await service.resolveMassBinding('org', 'veh');

    expect(binding.baseVehicleMassKg).toBe(1650);
    expect(binding.massSource).toBe('MANUFACTURER_CURB_WEIGHT');
    expect(binding.massConfidence).toBe('HIGH');
    expect(binding.effectiveMassKg).toBe(1650);
    expect(binding.optionalSessionPayloadKg).toBeNull();
  });

  it('does not invent runtime passenger/cargo mass', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({
          curbWeightKg: null,
          frontWeightDistributionPct: null,
          make: 'VW',
          model: 'Golf',
        }),
      },
    };
    const service = new ReferenceCaptureMassBindingService(prisma as never);
    const binding = await service.resolveMassBinding('org', 'veh');

    expect(binding.baseVehicleMassKg).toBeNull();
    expect(binding.effectiveMassKg).toBeNull();
    expect(binding.optionalSessionPayloadKg).toBeNull();
    expect(binding.limitationNote).toContain('No curbWeightKg');
  });
});
