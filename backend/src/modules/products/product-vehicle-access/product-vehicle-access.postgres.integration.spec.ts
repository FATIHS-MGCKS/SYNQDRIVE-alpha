/**
 * Run:
 *   PRODUCT_VEHICLE_ACCESS_POSTGRES_INTEGRATION=1 \
 *   DATABASE_URL=postgresql://synqdrive:synqdrive@127.0.0.1:5433/synqdrive_product_catalog_p2_pr1 \
 *   npm test -- --runInBand product-vehicle-access.postgres
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  OrganizationProductVehicleAccessMode,
  OrgProductStatus,
  PrismaClient,
  ProductSlug,
  VehicleProductGrantStatus,
  VehicleRegistryLifecycle,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { ProductVehicleAccessService } from './product-vehicle-access.service';
import { assertP2Pr3DisposablePostgresPreflight } from '../testing/p2-pr3-disposable-postgres-preflight';

const LIVE = process.env.PRODUCT_VEHICLE_ACCESS_POSTGRES_INTEGRATION === '1';
const OPT_IN = 'PRODUCT_VEHICLE_ACCESS_POSTGRES_INTEGRATION';

(LIVE ? describe : describe.skip)('ProductVehicleAccessService — postgres', () => {
  const prisma = new PrismaClient();
  let service: ProductVehicleAccessService;
  const orgIds: string[] = [];

  beforeAll(() => {
    assertP2Pr3DisposablePostgresPreflight(OPT_IN);
    service = new ProductVehicleAccessService(prisma as unknown as PrismaService);
  });

  afterAll(async () => {
    if (orgIds.length) {
      await prisma.vehicleProductGrant.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.vehicle.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organizationProduct.deleteMany({ where: { organizationId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    }
    await prisma.$disconnect();
  });

  async function seedOrgWithProduct(
    mode: OrganizationProductVehicleAccessMode,
    slug: ProductSlug = ProductSlug.RENTAL,
    status: OrgProductStatus = OrgProductStatus.ACTIVE,
  ) {
    const org = await prisma.organization.create({
      data: { companyName: `PVA ${Date.now()}`, businessType: 'RENTAL' },
    });
    orgIds.push(org.id);
    const product = await prisma.product.upsert({
      where: { slug },
      create: { slug, name: slug },
      update: {},
    });
    await prisma.organizationProduct.create({
      data: {
        organizationId: org.id,
        productId: product.id,
        status,
        vehicleAccessMode: mode,
      },
    });
    return org.id;
  }

  async function seedVehicle(
    orgId: string,
    lifecycle: VehicleRegistryLifecycle = VehicleRegistryLifecycle.ACTIVE,
  ) {
    return prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `VIN-${Date.now()}-${Math.random()}`,
        make: 'T',
        model: 'T',
        year: 2025,
        fuelType: 'ELECTRIC',
        licensePlate: `P-${Date.now()}`,
        status: 'AVAILABLE',
        registryLifecycle: lifecycle,
      },
    });
  }

  it('ORGANIZATION_WIDE authorizes all ACTIVE lifecycle vehicles', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    await seedVehicle(orgId);
    const where = await service.getAuthorizedVehicleWhere(orgId, ProductSlug.RENTAL);
    const count = await prisma.vehicle.count({ where });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('SELECTED_VEHICLES zero grants yields zero authorized vehicles', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.SELECTED_VEHICLES);
    await seedVehicle(orgId);
    const where = await service.getAuthorizedVehicleWhere(orgId, ProductSlug.RENTAL);
    expect(await prisma.vehicle.count({ where })).toBe(0);
  });

  it('SELECTED_VEHICLES with ACTIVE grant authorizes only granted vehicle', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.SELECTED_VEHICLES);
    const granted = await seedVehicle(orgId);
    await seedVehicle(orgId);
    await prisma.vehicleProductGrant.create({
      data: {
        organizationId: orgId,
        vehicleId: granted.id,
        productSlug: ProductSlug.RENTAL,
        status: VehicleProductGrantStatus.ACTIVE,
        grantedByUserId: 'admin-test',
      },
    });
    const where = await service.getAuthorizedVehicleWhere(orgId, ProductSlug.RENTAL);
    expect(await prisma.vehicle.count({ where })).toBe(1);
    await expect(service.assertVehicleAuthorized(orgId, granted.id, ProductSlug.RENTAL)).resolves.toBeUndefined();
  });

  it('TRIAL license denies vehicle access', async () => {
    const orgId = await seedOrgWithProduct(
      OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      ProductSlug.RENTAL,
      OrgProductStatus.TRIAL,
    );
    const vehicle = await seedVehicle(orgId);
    await expect(service.assertVehicleAuthorized(orgId, vehicle.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('revoked grant does not authorize vehicle', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.SELECTED_VEHICLES);
    const vehicle = await seedVehicle(orgId);
    await prisma.vehicleProductGrant.create({
      data: {
        organizationId: orgId,
        vehicleId: vehicle.id,
        productSlug: ProductSlug.RENTAL,
        status: VehicleProductGrantStatus.REVOKED,
        grantedByUserId: 'admin-test',
      },
    });
    await expect(service.assertVehicleAuthorized(orgId, vehicle.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('inactive license fails closed', async () => {
    const orgId = await seedOrgWithProduct(
      OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE,
      ProductSlug.RENTAL,
      OrgProductStatus.SUSPENDED,
    );
    const vehicle = await seedVehicle(orgId);
    await expect(service.assertVehicleAuthorized(orgId, vehicle.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('ARCHIVED lifecycle vehicle denied under ORGANIZATION_WIDE', async () => {
    const orgId = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    const archived = await seedVehicle(orgId, VehicleRegistryLifecycle.ARCHIVED);
    await expect(service.assertVehicleAuthorized(orgId, archived.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('transferred vehicle not visible in foreign org', async () => {
    const orgA = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    const orgB = await seedOrgWithProduct(OrganizationProductVehicleAccessMode.ORGANIZATION_WIDE);
    const vehicleInB = await seedVehicle(orgB);
    await expect(service.assertVehicleAuthorized(orgA, vehicleInB.id, ProductSlug.RENTAL)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});