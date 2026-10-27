import { TiresService } from './tires.service';

describe('TiresService.getWearAnalysis V3 attachment', () => {
  it('returns V2-only payload when customer read disabled', async () => {
    const analysis = { frontLeftMm: 6, overallPercent: 70 };
    const wearModel = { computeWearAnalysis: jest.fn().mockResolvedValue(analysis) };
    const svc = new TiresService({} as never, wearModel as never, undefined);
    const result = await svc.getWearAnalysis('veh-1');
    expect(result).toEqual(analysis);
    expect(result).not.toHaveProperty('wearV3');
  });

  it('attaches wearV3 when customer read enabled', async () => {
    const analysis = { frontLeftMm: 6, overallPercent: 70 };
    const wearModel = { computeWearAnalysis: jest.fn().mockResolvedValue(analysis) };
    const v3Read = {
      isCustomerReadEnabled: () => true,
      isCustomerReadAuthoritative: () => false,
      computeCustomerRead: jest.fn().mockResolvedValue({ modelVersion: '0.2.0', wheels: [] }),
    };
    const prisma = {
      vehicleTireSetup: {
        findFirst: jest.fn().mockResolvedValue({ id: 'setup-1' }),
      },
    };
    const svc = new TiresService(prisma as never, wearModel as never, v3Read as never);
    const result = (await svc.getWearAnalysis('veh-1')) as {
      wearReadModel: string;
      wearV3: { modelVersion: string; wheels: unknown[] };
    };
    expect(result.wearReadModel).toBe('v2');
    expect(result.wearV3).toEqual({ modelVersion: '0.2.0', wheels: [] });
    expect(v3Read.computeCustomerRead).toHaveBeenCalledWith('setup-1');
  });
});
