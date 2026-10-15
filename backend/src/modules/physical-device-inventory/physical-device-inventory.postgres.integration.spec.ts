/**
 * Physical Device Inventory — PostgreSQL authority (serial uniqueness, concurrency, stock counts).
 */
import { BusinessType, PhysicalDeviceModelCode, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PHYSICAL_DEVICE_SERIAL_CONFLICT } from './physical-device-inventory.errors';

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;

const describeLive = LIVE ? describe : describe.skip;

describeLive('PhysicalDeviceInventoryService (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: PhysicalDeviceInventoryService;

  beforeAll(async () => {
    prisma = new PrismaClient();
    service = new PhysicalDeviceInventoryService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createOrg() {
    const id = randomUUID();
    await prisma.organization.create({
      data: {
        id,
        companyName: `PDI test ${id.slice(0, 8)}`,
        businessType: BusinessType.RENTAL,
      },
    });
    return id;
  }

  it('enforces unique serial numbers and supports idempotent intake', async () => {
    const serial = `R1-TEST-${randomUUID().slice(0, 8)}`;
    const idempotencyKey = `pdi-${randomUUID()}`;

    const first = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'WH-EU-01',
        idempotencyKey,
      },
      'master-user',
    );
    const replay = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'WH-EU-01',
        idempotencyKey,
      },
      'master-user',
    );
    expect(replay.id).toBe(first.id);

    await expect(
      service.manualIntake(
        {
          modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
          serialNumber: serial,
          warehouseLocation: 'WH-EU-02',
        },
        'master-user',
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_SERIAL_CONFLICT },
    });
  });

  it('scopes stock counts by owner organization', async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const serialA = `R1-ORG-A-${randomUUID().slice(0, 6)}`;
    const serialB = `R1-ORG-B-${randomUUID().slice(0, 6)}`;

    await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serialA,
        warehouseLocation: 'WH-A',
        ownerOrganizationId: orgA,
      },
      null,
    );
    await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.SMART5,
        serialNumber: serialB,
        warehouseLocation: 'WH-B',
        ownerOrganizationId: orgB,
      },
      null,
    );

    const listA = await service.listDevices({ ownerOrganizationId: orgA });
    expect(listA.total).toBeGreaterThanOrEqual(1);
    expect(listA.items.every((i) => i.ownerOrganizationId === orgA)).toBe(true);

    const summary = await service.getStockSummary();
    expect(summary.total).toBeGreaterThanOrEqual(2);
    expect(summary.byStatus.AVAILABLE).toBeGreaterThanOrEqual(2);
  });

  it('records assignment foundation row on intake', async () => {
    const serial = `R1-ASN-${randomUUID().slice(0, 8)}`;
    const device = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'WH-FOUNDATION',
      },
      'actor-1',
    );
    const assignments = await prisma.physicalDeviceAssignment.findMany({
      where: { physicalDeviceId: device.id },
    });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].assignmentKind).toBe('INVENTORY_INTAKE');
    expect(assignments[0].vehicleId).toBeNull();
  });

  it('handles concurrent intake with one winner for the same serial', async () => {
    const serial = `R1-RACE-${randomUUID().slice(0, 8)}`;
    const attempts = await Promise.allSettled([
      service.manualIntake(
        { modelCode: PhysicalDeviceModelCode.RUPTELA_R1, serialNumber: serial, warehouseLocation: 'WH-RACE' },
        null,
      ),
      service.manualIntake(
        { modelCode: PhysicalDeviceModelCode.RUPTELA_R1, serialNumber: serial, warehouseLocation: 'WH-RACE' },
        null,
      ),
    ]);
    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
