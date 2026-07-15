import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { FuelType, VehicleStatus } from '@prisma/client';
import { VehicleGenericPatchDto } from './dto/vehicle-generic-patch.dto';
import { mapVehicleGenericPatchToUpdateInput } from './vehicle-generic-patch.mapper';
import { VehiclesService } from './vehicles.service';

const validationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

async function transformPatch(body: Record<string, unknown>): Promise<VehicleGenericPatchDto> {
  return validationPipe.transform(body, {
    type: 'body',
    metatype: VehicleGenericPatchDto,
  });
}

describe('VehicleGenericPatchDto validation', () => {
  it('rejects RESERVED on generic PATCH', async () => {
    await expect(
      transformPatch({ status: VehicleStatus.RESERVED, licensePlate: 'KS-AB 1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects RENTED on generic PATCH', async () => {
    await expect(
      transformPatch({ status: VehicleStatus.RENTED }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects cleaningStatus mass-assignment', async () => {
    await expect(
      transformPatch({ cleaningStatus: 'NEEDS_CLEANING' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects nested organization connect payloads', async () => {
    await expect(
      transformPatch({
        organization: { connect: { id: 'other-org' } },
        licensePlate: 'X',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown top-level keys', async () => {
    await expect(
      transformPatch({ organizationId: 'evil-org', notes: 'ok' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts whitelisted master-data fields', async () => {
    const dto = await transformPatch({
      licensePlate: 'KS-AB 123',
      notes: 'Updated',
      fuelType: FuelType.DIESEL,
      mileageKm: 42_000,
    });
    expect(dto.licensePlate).toBe('KS-AB 123');
    expect(dto.notes).toBe('Updated');
    expect(dto.fuelType).toBe(FuelType.DIESEL);
    expect(dto.mileageKm).toBe(42_000);
  });
});

describe('mapVehicleGenericPatchToUpdateInput', () => {
  it('maps scalars without status or relations', () => {
    const data = mapVehicleGenericPatchToUpdateInput({
      licensePlate: 'B-XY 99',
      notes: 'Fleet note',
    });
    expect(data).toEqual({
      licensePlate: 'B-XY 99',
      notes: 'Fleet note',
    });
    expect(data).not.toHaveProperty('status');
    expect(data).not.toHaveProperty('organization');
  });

  it('parses ISO date strings to Date instances', () => {
    const data = mapVehicleGenericPatchToUpdateInput({
      lastServiceDate: '2026-01-15T00:00:00.000Z',
    });
    expect(data.lastServiceDate).toBeInstanceOf(Date);
  });
});

describe('VehiclesService.updateMasterData', () => {
  function makeService(prisma: {
    vehicle: {
      findFirst: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
    };
  }): VehiclesService {
    const stub = (): any => ({});
    return new (VehiclesService as any)(
      prisma,
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
      stub(),
    );
  }

  it('scopes update to tenant organization', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = makeService(prisma);

    await expect(
      service.updateMasterData(
        'veh-1',
        { licensePlate: 'NEW' },
        'org-a',
      ),
    ).rejects.toThrow('Vehicle not found');

    expect(prisma.vehicle.findFirst).toHaveBeenCalledWith({
      where: { id: 'veh-1', organizationId: 'org-a' },
    });
    expect(prisma.vehicle.update).not.toHaveBeenCalled();
  });

  it('updates allowed fields when vehicle belongs to org', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn().mockResolvedValue({ id: 'veh-1' }),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'veh-1', licensePlate: 'NEW' }),
      },
    };
    const service = makeService(prisma);

    await service.updateMasterData('veh-1', { licensePlate: 'NEW' }, 'org-a');

    expect(prisma.vehicle.update).toHaveBeenCalledWith({
      where: { id: 'veh-1' },
      data: { licensePlate: 'NEW' },
    });
  });

  it('rejects empty patch body', async () => {
    const prisma = {
      vehicle: {
        findFirst: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
      },
    };
    const service = makeService(prisma);

    await expect(
      service.updateMasterData('veh-1', {}, 'org-a'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
