/**
 * Physical Device Inventory — PostgreSQL authority (serial uniqueness, concurrency, audit, idempotency).
 */
import { BusinessType, PhysicalDeviceModelCode, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import {
  PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH,
  PHYSICAL_DEVICE_SERIAL_CONFLICT,
} from './physical-device-inventory.errors';

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;
const REQUIRED = process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_REQUIRED === '1';

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

  it('enforces case-insensitive serial uniqueness and idempotent intake replay', async () => {
    const serial = `R1-TEST-${randomUUID().slice(0, 8)}`;
    const idempotencyKey = `pdi-${randomUUID()}`;

    const first = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial.toLowerCase(),
        warehouseLocation: 'WH-EU-01',
        idempotencyKey,
      },
      'master-user',
    );
    expect(first.identityStatus).toBe('NEEDS_CLARIFICATION');
    expect(first.installEligible).toBe(false);

    const replay = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial.toUpperCase(),
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
          serialNumber: serial.toUpperCase(),
          warehouseLocation: 'WH-EU-02',
        },
        'master-user',
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_SERIAL_CONFLICT },
    });
  });

  it('rejects idempotency key reuse with different payload', async () => {
    const idempotencyKey = `pdi-mismatch-${randomUUID()}`;
    const serial = `R1-IDEM-${randomUUID().slice(0, 8)}`;
    await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'WH-A',
        idempotencyKey,
      },
      null,
    );
    await expect(
      service.manualIntake(
        {
          modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
          serialNumber: serial,
          warehouseLocation: 'WH-B',
          idempotencyKey,
        },
        null,
      ),
    ).rejects.toMatchObject({
      response: { code: PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH },
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

  it('does not persist device rows when owner organization is missing', async () => {
    const serial = `R1-TXROLL-${randomUUID().slice(0, 8)}`;
    const bogusOrg = randomUUID();
    await expect(
      service.manualIntake(
        {
          modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
          serialNumber: serial,
          warehouseLocation: 'WH-TX',
          ownerOrganizationId: bogusOrg,
        },
        null,
      ),
    ).rejects.toBeTruthy();
    const count = await prisma.physicalDevice.count({
      where: { serialNumber: { equals: serial, mode: 'insensitive' } },
    });
    expect(count).toBe(0);
  });

  it('records assignment foundation and durable audit rows on intake', async () => {
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

    const audits = await prisma.physicalDeviceInventoryAuditEvent.findMany({
      where: { physicalDeviceId: device.id },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].eventKind).toBe('MANUAL_INTAKE');
  });

  it('handles concurrent intake with one winner for the same serial', async () => {
    const serial = `R1-RACE-${randomUUID().slice(0, 8)}`;
    const attempts = await Promise.allSettled([
      service.manualIntake(
        { modelCode: PhysicalDeviceModelCode.RUPTELA_R1, serialNumber: serial, warehouseLocation: 'WH-RACE' },
        null,
      ),
      service.manualIntake(
        { modelCode: PhysicalDeviceModelCode.RUPTELA_R1, serialNumber: serial.toLowerCase(), warehouseLocation: 'WH-RACE' },
        null,
      ),
    ]);
    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });

  it('prevents deleting a device while assignment history exists', async () => {
    const serial = `R1-DEL-${randomUUID().slice(0, 8)}`;
    const device = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'WH-DEL',
      },
      null,
    );
    await expect(
      prisma.physicalDevice.delete({ where: { id: device.id } }),
    ).rejects.toBeTruthy();
  });
});

if (REQUIRED && !LIVE) {
  throw new Error('PHYSICAL_DEVICE_INVENTORY_POSTGRES_REQUIRED=1 but integration suite is not live');
}
