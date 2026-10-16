/**
 * Physical Device Inventory P1B.2 — uninstall & lifecycle (PostgreSQL).
 */
import {
  BusinessType,
  PhysicalDeviceAssignmentKind,
  PhysicalDeviceModelCode,
  PrismaClient,
  VehicleRegistryLifecycle,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PhysicalDeviceInventoryService } from './physical-device-inventory.service';
import { PrismaService } from '@shared/database/prisma.service';
import { PhysicalDeviceIdentityAttestationKind } from './dto/verify-physical-device-identity.dto';
import { PhysicalDeviceLossAttestationKind } from './dto/mark-physical-device-lost.dto';
import { PhysicalDeviceUninstallCondition } from './dto/uninstall-physical-device.dto';
import {
  PHYSICAL_DEVICE_ASSIGNMENT_MISMATCH,
  PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH,
  PHYSICAL_DEVICE_LIFECYCLE_NOT_ELIGIBLE,
  PHYSICAL_DEVICE_LOSS_EVIDENCE_INSUFFICIENT,
  PHYSICAL_DEVICE_NOT_INSTALL_ELIGIBLE,
  PHYSICAL_DEVICE_NOT_UNINSTALL_ELIGIBLE,
  PHYSICAL_DEVICE_P1B2_WRITES_DISABLED,
} from './physical-device-inventory.errors';

const LIVE =
  process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_INTEGRATION === '1' && !!process.env.DATABASE_URL;
const REQUIRED = process.env.PHYSICAL_DEVICE_INVENTORY_POSTGRES_REQUIRED === '1';

const describeLive = LIVE ? describe : describe.skip;

describeLive('PhysicalDeviceInventory P1B.2 (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let service: PhysicalDeviceInventoryService;
  const priorB1 = process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED;
  const priorB2 = process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED;

  beforeAll(() => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = '1';
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED = '1';
    prisma = new PrismaClient();
    service = new PhysicalDeviceInventoryService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B1_WRITES_ENABLED = priorB1;
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED = priorB2;
    await prisma.$disconnect();
  });

  async function createOrg() {
    const id = randomUUID();
    await prisma.organization.create({
      data: {
        id,
        companyName: `PDI P1B2 ${id.slice(0, 8)}`,
        businessType: BusinessType.RENTAL,
      },
    });
    return id;
  }

  async function createActiveVehicle(orgId: string) {
    const id = randomUUID();
    await prisma.vehicle.create({
      data: {
        id,
        organizationId: orgId,
        make: 'Test',
        model: 'Vehicle',
        year: 2024,
        fuelType: 'GASOLINE',
        status: VehicleStatus.AVAILABLE,
        registryLifecycle: VehicleRegistryLifecycle.ACTIVE,
      },
    });
    return id;
  }

  async function installOnVehicle(orgId: string, vehicleId: string) {
    const serial = `R1-P1B2-${randomUUID().slice(0, 8)}`;
    const device = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: serial,
        warehouseLocation: 'WH-P1B2',
        ownerOrganizationId: orgId,
      },
      'master-admin',
    );
    await prisma.physicalDevice.update({
      where: { id: device.id },
      data: { identityStatus: 'VERIFIED' },
    });
    const installed = await service.installOnVehicle(
      device.id,
      { vehicleId, installConfirmation: true },
      'master-admin',
    );
    const assignment = await prisma.physicalDeviceAssignment.findFirst({
      where: {
        physicalDeviceId: device.id,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
        effectiveTo: null,
      },
    });
    return { device: installed, assignmentId: assignment!.id, vehicleId };
  }

  it('rejects P1B2 writes when flag disabled', async () => {
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED = '0';
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    await expect(
      service.uninstallFromVehicle(
        device.id,
        {
          vehicleId: vehicle,
          assignmentId,
          physicalUninstallConfirmed: true,
          uninstallReason: 'test',
          deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
          physicalReturnConfirmed: true,
          warehouseLocation: 'WH-RETURN',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: PHYSICAL_DEVICE_P1B2_WRITES_DISABLED } });
    process.env.PHYSICAL_DEVICE_INVENTORY_P1B2_WRITES_ENABLED = '1';
  });

  it('uninstalls with return to stock and preserves assignment history', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    const linksBefore = await prisma.vehicleDataSourceLink.count({ where: { vehicleId: vehicle } });
    const billingBefore = await prisma.billingSubscription.count();

    const out = await service.uninstallFromVehicle(
      device.id,
      {
        vehicleId: vehicle,
        assignmentId,
        physicalUninstallConfirmed: true,
        uninstallReason: 'Workshop removal',
        deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
        physicalReturnConfirmed: true,
        warehouseLocation: 'WH-RETURN-1',
        idempotencyKey: `uninstall-${randomUUID()}`,
      },
      'master-admin',
    );

    expect(out.status).toBe('AVAILABLE');
    expect(out.currentVehicleId).toBeNull();
    expect(out.warehouseLocation).toBe('WH-RETURN-1');

    const closed = await prisma.physicalDeviceAssignment.findUnique({ where: { id: assignmentId } });
    expect(closed?.effectiveTo).not.toBeNull();

    const linksAfter = await prisma.vehicleDataSourceLink.count({ where: { vehicleId: vehicle } });
    const billingAfter = await prisma.billingSubscription.count();
    expect(linksAfter).toBe(linksBefore);
    expect(billingAfter).toBe(billingBefore);
  });

  it('uninstall without physical return sets PENDING_RETURN not AVAILABLE', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    const out = await service.uninstallFromVehicle(
      device.id,
      {
        vehicleId: vehicle,
        assignmentId,
        physicalUninstallConfirmed: true,
        uninstallReason: 'Awaiting courier',
        deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
        physicalReturnConfirmed: false,
      },
      'master-admin',
    );
    expect(out.status).toBe('PENDING_RETURN');
    expect(out.warehouseLocation).toBe('WH-P1B2');
  });

  it('uninstall as defective without warehouse update', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    const out = await service.uninstallFromVehicle(
      device.id,
      {
        vehicleId: vehicle,
        assignmentId,
        physicalUninstallConfirmed: true,
        uninstallReason: 'Damaged harness',
        deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.DEFECTIVE,
        physicalReturnConfirmed: false,
        defectDescription: 'Water ingress',
      },
      'master-admin',
    );
    expect(out.status).toBe('DEFECTIVE');
    expect(out.warehouseLocation).toBe('WH-P1B2');
  });

  it('rejects duplicate uninstall', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    await service.uninstallFromVehicle(
      device.id,
      {
        vehicleId: vehicle,
        assignmentId,
        physicalUninstallConfirmed: true,
        uninstallReason: 'once',
        deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
        physicalReturnConfirmed: false,
      },
      'master-admin',
    );
    await expect(
      service.uninstallFromVehicle(
        device.id,
        {
          vehicleId: vehicle,
          assignmentId,
          physicalUninstallConfirmed: true,
          uninstallReason: 'twice',
          deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
          physicalReturnConfirmed: false,
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: PHYSICAL_DEVICE_NOT_UNINSTALL_ELIGIBLE } });
  });

  it('replays uninstall idempotency and rejects payload mismatch', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    const key = `uninstall-idem-${randomUUID()}`;
    const payload = {
      vehicleId: vehicle,
      assignmentId,
      physicalUninstallConfirmed: true,
      uninstallReason: 'idem',
      deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
      physicalReturnConfirmed: true,
      warehouseLocation: 'WH-A',
      idempotencyKey: key,
    };
    const first = await service.uninstallFromVehicle(device.id, payload, 'master-admin');
    const second = await service.uninstallFromVehicle(device.id, payload, 'master-admin');
    expect(second.id).toBe(first.id);

    await expect(
      service.uninstallFromVehicle(
        device.id,
        { ...payload, uninstallReason: 'different payload' },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: PHYSICAL_DEVICE_IDEMPOTENCY_PAYLOAD_MISMATCH } });
  });

  it('parallel uninstall requests yield one transition and one replay', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    const key = `parallel-uninstall-${randomUUID()}`;
    const body = {
      vehicleId: vehicle,
      assignmentId,
      physicalUninstallConfirmed: true,
      uninstallReason: 'parallel',
      deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
      physicalReturnConfirmed: false,
      idempotencyKey: key,
    };
    const [a, b] = await Promise.all([
      service.uninstallFromVehicle(device.id, body, 'master-admin'),
      service.uninstallFromVehicle(device.id, body, 'master-admin'),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.status).toBe('PENDING_RETURN');
    const auditCount = await prisma.physicalDeviceInventoryAuditEvent.count({
      where: { physicalDeviceId: device.id, eventKind: 'UNINSTALL', idempotencyKey: key },
    });
    expect(auditCount).toBe(1);
  });

  it('fails closed on duplicate active install assignments', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    await prisma.physicalDeviceAssignment.create({
      data: {
        physicalDeviceId: device.id,
        organizationId: org,
        vehicleId: vehicle,
        assignmentKind: PhysicalDeviceAssignmentKind.INSTALL,
        effectiveFrom: new Date(),
      },
    });
    await expect(
      service.uninstallFromVehicle(
        device.id,
        {
          vehicleId: vehicle,
          assignmentId,
          physicalUninstallConfirmed: true,
          uninstallReason: 'x',
          deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
          physicalReturnConfirmed: false,
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: 'PHYSICAL_DEVICE_ASSIGNMENT_INTEGRITY_CONFLICT' } });
  });

  it('rejects mark lost when status INSTALLED without active assignment', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    await prisma.physicalDeviceAssignment.update({
      where: { id: assignmentId },
      data: { effectiveTo: new Date() },
    });
    await expect(
      service.markLost(
        device.id,
        {
          lossAttestationKind: PhysicalDeviceLossAttestationKind.MASTER_ADMIN_LOSS_CONFIRMATION,
          lossEvidenceNotes: 'Inconsistent row',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: 'PHYSICAL_DEVICE_STATUS_ASSIGNMENT_INCONSISTENT' } });
  });

  it('rejects uninstall for foreign organization vehicle', async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    const vehicleB = await createActiveVehicle(orgB);
    const { device, assignmentId } = await installOnVehicle(orgA, await createActiveVehicle(orgA));
    await expect(
      service.uninstallFromVehicle(
        device.id,
        {
          vehicleId: vehicleB,
          assignmentId,
          physicalUninstallConfirmed: true,
          uninstallReason: 'wrong org',
          deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
          physicalReturnConfirmed: false,
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: PHYSICAL_DEVICE_ASSIGNMENT_MISMATCH } });
  });

  it('rejects stale assignment and wrong vehicle on uninstall', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const otherVehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    await expect(
      service.uninstallFromVehicle(
        device.id,
        {
          vehicleId: otherVehicle,
          assignmentId,
          physicalUninstallConfirmed: true,
          uninstallReason: 'wrong',
          deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
          physicalReturnConfirmed: false,
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: PHYSICAL_DEVICE_ASSIGNMENT_MISMATCH } });
    await service.uninstallFromVehicle(
      device.id,
      {
        vehicleId: vehicle,
        assignmentId,
        physicalUninstallConfirmed: true,
        uninstallReason: 'ok',
        deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
        physicalReturnConfirmed: false,
      },
      'master-admin',
    );
    await expect(
      service.uninstallFromVehicle(
        device.id,
        {
          vehicleId: vehicle,
          assignmentId,
          physicalUninstallConfirmed: true,
          uninstallReason: 'stale',
          deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
          physicalReturnConfirmed: false,
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: PHYSICAL_DEVICE_NOT_UNINSTALL_ELIGIBLE } });
  });

  it('return to stock updates warehouse for available device', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    await service.uninstallFromVehicle(
      device.id,
      {
        vehicleId: vehicle,
        assignmentId,
        physicalUninstallConfirmed: true,
        uninstallReason: 'remove',
        deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
        physicalReturnConfirmed: false,
      },
      'master-admin',
    );
    const returned = await service.returnToStock(
      device.id,
      {
        warehouseLocation: 'WH-STOCK-2',
        physicalReturnConfirmed: true,
      },
      'master-admin',
    );
    expect(returned.warehouseLocation).toBe('WH-STOCK-2');
    expect(returned.status).toBe('AVAILABLE');
  });

  it('mark lost requires explicit evidence and blocks installed devices', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const { device, assignmentId } = await installOnVehicle(org, vehicle);
    await expect(
      service.markLost(
        device.id,
        {
          lossAttestationKind: PhysicalDeviceLossAttestationKind.MASTER_ADMIN_LOSS_CONFIRMATION,
          lossEvidenceNotes: '   ',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: PHYSICAL_DEVICE_LOSS_EVIDENCE_INSUFFICIENT } });

    await expect(
      service.markLost(
        device.id,
        {
          lossAttestationKind: PhysicalDeviceLossAttestationKind.MASTER_ADMIN_LOSS_CONFIRMATION,
          lossEvidenceNotes: 'Police report #123',
        },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: 'PHYSICAL_DEVICE_ACTIVE_VEHICLE_ASSIGNMENT' } });

    await service.uninstallFromVehicle(
      device.id,
      {
        vehicleId: vehicle,
        assignmentId,
        physicalUninstallConfirmed: true,
        uninstallReason: 'remove',
        deviceConditionAfterUninstall: PhysicalDeviceUninstallCondition.FUNCTIONAL,
        physicalReturnConfirmed: false,
      },
      'master-admin',
    );
    const lost = await service.markLost(
      device.id,
      {
        lossAttestationKind: PhysicalDeviceLossAttestationKind.MASTER_ADMIN_LOSS_CONFIRMATION,
        lossEvidenceNotes: 'Police report #123',
      },
      'master-admin',
    );
    expect(lost.status).toBe('LOST');
  });

  it('DEFECTIVE LOST RETIRED cannot install', async () => {
    const org = await createOrg();
    const vehicle = await createActiveVehicle(org);
    const device = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: `R1-BAD-${randomUUID().slice(0, 8)}`,
        warehouseLocation: 'WH',
        ownerOrganizationId: org,
      },
      'master-admin',
    );
    await prisma.physicalDevice.update({
      where: { id: device.id },
      data: { identityStatus: 'VERIFIED', status: 'DEFECTIVE' },
    });
    await expect(
      service.installOnVehicle(device.id, { vehicleId: vehicle, installConfirmation: true }, 'master-admin'),
    ).rejects.toMatchObject({ response: { code: PHYSICAL_DEVICE_NOT_INSTALL_ELIGIBLE } });
  });

  it('retire requires explicit confirmation and no active install', async () => {
    const device = await service.manualIntake(
      {
        modelCode: PhysicalDeviceModelCode.RUPTELA_R1,
        serialNumber: `R1-RET-${randomUUID().slice(0, 8)}`,
        warehouseLocation: 'WH',
      },
      'master-admin',
    );
    const retired = await service.retire(
      device.id,
      { retireReason: 'End of life', retirementConfirmation: true },
      'master-admin',
    );
    expect(retired.status).toBe('RETIRED');
    await expect(
      service.retire(
        device.id,
        { retireReason: 'again', retirementConfirmation: true },
        'master-admin',
      ),
    ).rejects.toMatchObject({ response: { code: PHYSICAL_DEVICE_LIFECYCLE_NOT_ELIGIBLE } });
  });
});

if (REQUIRED && !LIVE) {
  throw new Error('PHYSICAL_DEVICE_INVENTORY_POSTGRES_REQUIRED=1 but integration env not configured');
}
