import {
  DeviceConnectionPhysicalAuthorityMode,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { buildBindingScopeFromToken } from './device-connection-physical-state.binding';
import { DeviceConnectionPhysicalAuthorityCutoverRepository } from './device-connection-physical-authority-cutover.repository';
import {
  cleanupPhysicalStatePostgresFixture,
  createPhysicalStatePostgresFixture,
  type PhysicalStatePostgresFixture,
} from './testing/physical-state-postgres.integration.harness';

const LIVE =
  process.env.PHYSICAL_STATE_POSTGRES_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL);
const REQUIRED = process.env.PHYSICAL_STATE_POSTGRES_REQUIRED === '1';
const describePg = LIVE ? describe : describe.skip;

if (REQUIRED && !LIVE) {
  throw new Error(
    'PHYSICAL_STATE_POSTGRES_REQUIRED=1 but DATABASE_URL / PHYSICAL_STATE_POSTGRES_INTEGRATION not configured',
  );
}

describePg('DeviceConnectionPhysicalAuthorityCutoverRepository (postgres)', () => {
  let prisma: PrismaClient;
  let repository: DeviceConnectionPhysicalAuthorityCutoverRepository;
  let fixture: PhysicalStatePostgresFixture;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$executeRawUnsafe('SELECT 1');
    repository = new DeviceConnectionPhysicalAuthorityCutoverRepository(
      prisma as unknown as PrismaService,
    );
  });

  beforeEach(async () => {
    fixture = await createPhysicalStatePostgresFixture(prisma);
  });

  afterEach(async () => {
    await cleanupPhysicalStatePostgresFixture(prisma, fixture);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. creation defaults to LEGACY', async () => {
    const row = await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      }),
    );
    expect(row.authorityMode).toBe(DeviceConnectionPhysicalAuthorityMode.LEGACY);
    expect(row.latchedAt).toBeNull();
  });

  it('2-3. unique identity (organizationId, vehicleId, provider) prevents duplicates', async () => {
    const first = await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      }),
    );
    const second = await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      }),
    );
    expect(first.id).toBe(second.id);

    const count = await prisma.deviceConnectionPhysicalAuthorityCutover.count({
      where: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      },
    });
    expect(count).toBe(1);
  });

  it('4. different provider is independent', async () => {
    await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      }),
    );
    await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'OTHER',
      }),
    );
    const count = await prisma.deviceConnectionPhysicalAuthorityCutover.count({
      where: { vehicleId: fixture.vehicle.id },
    });
    expect(count).toBe(2);
  });

  it('5. different vehicle is independent', async () => {
    const otherVehicle = await prisma.vehicle.create({
      data: {
        organizationId: fixture.org.id,
        vin: `VIN2${fixture.suffix}`.slice(0, 17).padEnd(17, '1'),
        licensePlate: `PS2-${fixture.suffix}`.slice(0, 12),
        make: 'Test',
        model: 'PhysicalState',
        year: 2024,
        fuelType: 'GASOLINE',
        status: 'AVAILABLE',
        hardwareType: 'LTE_R1',
      },
      select: { id: true },
    });

    await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      }),
    );
    await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: otherVehicle.id,
        provider: 'DIMO',
      }),
    );

    const count = await prisma.deviceConnectionPhysicalAuthorityCutover.count({
      where: { organizationId: fixture.org.id },
    });
    expect(count).toBe(2);

    await prisma.deviceConnectionPhysicalAuthorityCutover.deleteMany({
      where: { vehicleId: otherVehicle.id },
    });
    await prisma.vehicle.delete({ where: { id: otherVehicle.id } });
  });

  it('6. different organization is independent', async () => {
    const otherOrg = await prisma.organization.create({
      data: {
        companyName: `Other Org ${fixture.suffix}`,
        businessType: 'RENTAL',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    const otherVehicle = await prisma.vehicle.create({
      data: {
        organizationId: otherOrg.id,
        vin: `VIN3${fixture.suffix}`.slice(0, 17).padEnd(17, '2'),
        licensePlate: `PS3-${fixture.suffix}`.slice(0, 12),
        make: 'Test',
        model: 'PhysicalState',
        year: 2024,
        fuelType: 'GASOLINE',
        status: 'AVAILABLE',
        hardwareType: 'LTE_R1',
      },
      select: { id: true },
    });

    await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      }),
    );
    await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: otherOrg.id,
        vehicleId: otherVehicle.id,
        provider: 'DIMO',
      }),
    );

    const count = await prisma.deviceConnectionPhysicalAuthorityCutover.count();
    expect(count).toBeGreaterThanOrEqual(2);

    await prisma.deviceConnectionPhysicalAuthorityCutover.deleteMany({
      where: { vehicleId: otherVehicle.id },
    });
    await prisma.vehicle.delete({ where: { id: otherVehicle.id } });
    await prisma.organization.delete({ where: { id: otherOrg.id } });
  });

  it('7. new bindingKey does not create or reset authority identity', async () => {
    await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      }),
    );

    await prisma.deviceConnectionPhysicalAuthorityCutover.updateMany({
      where: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      },
      data: {
        authorityMode: DeviceConnectionPhysicalAuthorityMode.PHYSICAL,
        latchedAt: new Date(),
      },
    });

    const bindingA = buildBindingScopeFromToken({ provider: 'DIMO', tokenId: fixture.tokenId });
    const bindingB = buildBindingScopeFromToken({
      provider: 'DIMO',
      tokenId: fixture.tokenId + 1,
    });
    expect(bindingA.bindingKey).not.toBe(bindingB.bindingKey);

    const row = await prisma.$transaction((tx) =>
      repository.ensureAuthorityRow(tx, {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      }),
    );
    expect(row.authorityMode).toBe(DeviceConnectionPhysicalAuthorityMode.PHYSICAL);

    const authorityCount = await prisma.deviceConnectionPhysicalAuthorityCutover.count({
      where: {
        organizationId: fixture.org.id,
        vehicleId: fixture.vehicle.id,
        provider: 'DIMO',
      },
    });
    expect(authorityCount).toBe(1);
  });

  it('8. tenant mismatch rejected', async () => {
    await expect(
      prisma.$transaction((tx) =>
        repository.ensureAuthorityRow(tx, {
          organizationId: 'wrong-org',
          vehicleId: fixture.vehicle.id,
          provider: 'DIMO',
        }),
      ),
    ).rejects.toThrow(/tenant_mismatch/);
  });
});
