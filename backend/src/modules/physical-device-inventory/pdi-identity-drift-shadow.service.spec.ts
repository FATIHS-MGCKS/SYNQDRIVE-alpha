import { PdiIdentityDriftShadowService } from './pdi-identity-drift-shadow.service';

describe('PdiIdentityDriftShadowService', () => {
  const prisma = {
    dimoPollLog: { findFirst: jest.fn() },
    $queryRaw: jest.fn(),
  };

  afterEach(() => {
    delete process.env.PDI_IDENTITY_DRIFT_SHADOW_ENABLED;
    jest.resetAllMocks();
  });

  it('11. feature flag OFF → no shadow evaluation', async () => {
    process.env.PDI_IDENTITY_DRIFT_SHADOW_ENABLED = 'false';
    const service = new PdiIdentityDriftShadowService(prisma as never);
    const result = await service.runAfterSuccessfulDimoVehicleSync({ syncedCount: 3 });
    expect(result).toBeNull();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
