import { NotFoundException } from '@nestjs/common';
import { VendorCategory } from '@prisma/client';
import { VendorsService } from './vendors.service';
import { mapMapboxCategory } from './vendor-mapbox.service';

/**
 * Vendor Management overhaul — regression gates for the non-negotiable rules:
 *
 *   1. Vendor `update` only touches master data. It must NEVER read, delete,
 *      or recreate `VendorVehicle` rows — that was the old bug that wiped
 *      link notes. Links are managed exclusively via the link endpoints.
 *   2. Strict tenancy on `linkVehicle`: a vehicle that does not belong to the
 *      same org must be rejected (no cross-tenant links).
 *   3. `create` persists master data only — no vehicle-link side effects.
 *   4. Mapbox POI categories are normalised into the `VendorCategory` enum.
 *
 * The service is a thin orchestration layer over Prisma; we bypass the DI
 * container and inject a hand-rolled prisma/audit double so any unexpected
 * table access throws loudly.
 */

type AnyFn = jest.Mock;

function makePrismaDouble() {
  const vendorVehicle = {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
  };
  const prisma = {
    vendor: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    vehicle: { findFirst: jest.fn() },
    vendorVehicle,
    orgInvoice: { findMany: jest.fn() },
    activityLog: { findMany: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb({ vendorVehicle })),
  };
  return prisma;
}

function makeAuditDouble() {
  return { record: jest.fn(), critical: jest.fn() };
}

function makeService(prisma: ReturnType<typeof makePrismaDouble>, audit = makeAuditDouble()) {
  return new (VendorsService as any)(prisma, audit) as VendorsService;
}

const VENDOR_INCLUDE_ROW = {
  id: 'v1',
  organizationId: 'org1',
  name: 'Werkstatt Kassel',
  category: 'WORKSHOP',
  vendorVehicles: [],
  _count: { invoices: 0 },
};

describe('VendorsService — master data isolation', () => {
  it('update() never touches VendorVehicle rows (link notes are preserved)', async () => {
    const prisma = makePrismaDouble();
    // assertVendor → exists
    prisma.vendor.findFirst
      .mockResolvedValueOnce({ id: 'v1', name: 'Werkstatt Kassel' }) // assertVendor
      .mockResolvedValueOnce(VENDOR_INCLUDE_ROW); // findById after update
    prisma.vendor.update.mockResolvedValue({ id: 'v1' });

    const service = makeService(prisma);
    await service.update('org1', 'v1', { name: 'Neuer Name' } as any);

    expect(prisma.vendor.update).toHaveBeenCalledTimes(1);
    // The whole point of the fix: zero link mutations on a master-data update.
    expect(prisma.vendorVehicle.deleteMany).not.toHaveBeenCalled();
    expect(prisma.vendorVehicle.create).not.toHaveBeenCalled();
    expect(prisma.vendorVehicle.upsert).not.toHaveBeenCalled();
    expect(prisma.vendorVehicle.update).not.toHaveBeenCalled();
  });

  it('create() persists master data only — no vehicle-link writes', async () => {
    const prisma = makePrismaDouble();
    prisma.vendor.create.mockResolvedValue({ id: 'v1', name: 'X', category: 'WORKSHOP', source: 'MANUAL' });
    prisma.vendor.findFirst.mockResolvedValue(VENDOR_INCLUDE_ROW); // findById

    const service = makeService(prisma);
    await service.create('org1', { name: 'X', category: 'WORKSHOP' } as any);

    expect(prisma.vendor.create).toHaveBeenCalledTimes(1);
    expect(prisma.vendorVehicle.create).not.toHaveBeenCalled();
    expect(prisma.vendorVehicle.upsert).not.toHaveBeenCalled();
  });
});

describe('VendorsService — tenancy guards', () => {
  it('linkVehicle() rejects a vehicle that is not in the same org', async () => {
    const prisma = makePrismaDouble();
    prisma.vendor.findFirst.mockResolvedValue({ id: 'v1', name: 'X' }); // assertVendor ok
    prisma.vehicle.findFirst.mockResolvedValue(null); // cross-tenant / missing vehicle

    const service = makeService(prisma);
    await expect(
      service.linkVehicle('org1', 'v1', { vehicleId: 'veh-other-org' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('update() throws NotFound when the vendor is not in the org', async () => {
    const prisma = makePrismaDouble();
    prisma.vendor.findFirst.mockResolvedValue(null); // assertVendor fails

    const service = makeService(prisma);
    await expect(service.update('org1', 'missing', { name: 'X' } as any)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.vendor.update).not.toHaveBeenCalled();
  });
});

describe('mapMapboxCategory — POI normalisation', () => {
  const cases: Array<[string[], VendorCategory]> = [
    [['Tire Shop'], VendorCategory.TIRE_DEALER],
    [['Car Wash'], VendorCategory.DETAILING],
    [['Auto Glass'], VendorCategory.AUTO_GLASS],
    [['Karosserie & Lackiererei'], VendorCategory.BODY_REPAIR],
    [['Gutachter'], VendorCategory.APPRAISER],
    [['TÜV Prüfstelle'], VendorCategory.TUV_STATION],
    [['Versicherung'], VendorCategory.INSURANCE],
    [['Abschleppdienst'], VendorCategory.TOWING],
    [['Auto Parts'], VendorCategory.PARTS_DEALER],
    [['Autohaus'], VendorCategory.DEALERSHIP],
    [['Car Repair'], VendorCategory.WORKSHOP],
  ];

  it.each(cases)('maps %j → %s', (input, expected) => {
    expect(mapMapboxCategory(input)).toBe(expected);
  });

  it('falls back to OTHER for unknown / empty categories', () => {
    expect(mapMapboxCategory([])).toBe(VendorCategory.OTHER);
    expect(mapMapboxCategory(undefined)).toBe(VendorCategory.OTHER);
    expect(mapMapboxCategory(['florist'])).toBe(VendorCategory.OTHER);
  });
});
