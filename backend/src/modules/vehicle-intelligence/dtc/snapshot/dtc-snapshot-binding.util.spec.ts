import { verifyActiveDimoBindingForVehicle } from './dtc-snapshot-binding.util';

describe('verifyActiveDimoBindingForVehicle', () => {
  it('rejects when ingress token does not match registered DimoVehicle', async () => {
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          dimoVehicleId: 'dv-1',
          dimoVehicle: { tokenId: 100 },
        }),
      },
      vehicleDataSourceLink: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'link-1',
          isActive: true,
          dimoVehicleId: 'dv-1',
        }),
      },
    };
    const r = await verifyActiveDimoBindingForVehicle(prisma, 'v1', 999);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('TOKEN_DIMO_VEHICLE_MISMATCH');
  });

  it('accepts when token and link dimo vehicle align', async () => {
    const prisma = {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({
          dimoVehicleId: 'dv-1',
          dimoVehicle: { tokenId: 100 },
        }),
      },
      vehicleDataSourceLink: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'link-1',
          isActive: true,
          dimoVehicleId: 'dv-1',
        }),
      },
    };
    const r = await verifyActiveDimoBindingForVehicle(prisma, 'v1', 100);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.binding.providerBindingId).toBe('link-1');
      expect(r.binding.dimoTokenId).toBe(100);
    }
  });
});
