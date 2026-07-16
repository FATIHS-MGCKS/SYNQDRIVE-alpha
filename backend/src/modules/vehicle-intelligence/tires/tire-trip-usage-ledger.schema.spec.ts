import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260716210000_tire_trip_usage_ledger/migration.sql',
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('TireTripUsageLedger schema (Prompt 9)', () => {
  it('passes prisma validate', () => {
    const output = execSync('npm run prisma:validate', {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://synqdrive:synqdrive@localhost:5432/synqdrive',
      },
    });
    expect(output).toContain('valid');
  });

  it('defines TireTripUsageLedger with required attribution fields', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?organizationId/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?vehicleId/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?tripId/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?tireSetupId/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?tripStartedAt/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?tripEndedAt/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?distanceKm/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?cityKm/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?ruralKm/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?highwayKm/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?harshAccelerationCount/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?harshBrakingCount/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?harshCorneringCount/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?drivingImpactSummary/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?sourceVersion/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?sourceFingerprint/);
    expect(schema).toMatch(/model TireTripUsageLedger[\s\S]*?processedAt/);
    expect(schema).toContain('@@map("tire_trip_usage_ledger")');
  });

  it('enforces unique trip/setup attribution per row', () => {
    const schema = readSchema();
    expect(schema).toContain('@@unique([tripId, tireSetupId])');
  });

  it('indexes setup, vehicle/time, org and trip lookups', () => {
    const schema = readSchema();
    expect(schema).toContain('@@index([tireSetupId, tripStartedAt])');
    expect(schema).toContain('@@index([vehicleId, tripStartedAt])');
    expect(schema).toContain('@@index([organizationId, vehicleId])');
    expect(schema).toContain('@@index([tripId])');
    expect(schema).toContain('@@index([sourceFingerprint])');
  });

  it('migration creates ledger table, unique constraint and tenant scope trigger', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('CREATE TABLE "tire_trip_usage_ledger"');
    expect(sql).toContain('tire_trip_usage_ledger_trip_id_tire_setup_id_key');
    expect(sql).toContain('tire_trip_usage_ledger_scope_guard');
    expect(sql).toContain('tire_trip_usage_ledger_scope_guard_trg');
    expect(sql).toContain('source_fingerprint');
  });
});

describe('TireTripUsageLedger constraints integration (requires DATABASE_URL)', () => {
  const databaseUrl = process.env.DATABASE_URL;
  const runDb = process.env.TIRE_LEDGER_SCHEMA_INTEGRATION === '1' && !!databaseUrl;

  (runDb ? it : it.skip)('enforces unique (trip_id, tire_setup_id) and tenant scope guard', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const suffix = Date.now();
    const org = await prisma.organization.create({
      data: {
        id: `org-ledger-${suffix}`,
        companyName: `Ledger Test Org ${suffix}`,
        businessType: 'FLEET',
      },
    });
    const vehicle = await prisma.vehicle.create({
      data: {
        id: `veh-ledger-${suffix}`,
        organizationId: org.id,
        vin: `VIN${suffix}`,
        make: 'Test',
        model: 'Car',
        year: 2026,
        fuelType: 'ELECTRIC',
      },
    });
    const setup = await prisma.vehicleTireSetup.create({
      data: {
        id: `setup-ledger-${suffix}`,
        organizationId: org.id,
        vehicleId: vehicle.id,
        status: 'ACTIVE',
      },
    });
    const trip = await prisma.vehicleTrip.create({
      data: {
        id: `trip-ledger-${suffix}`,
        vehicleId: vehicle.id,
        startTime: new Date('2026-07-01T10:00:00.000Z'),
        endTime: new Date('2026-07-01T11:00:00.000Z'),
        distanceKm: 25,
      },
    });

    const base = {
      organizationId: org.id,
      vehicleId: vehicle.id,
      tripId: trip.id,
      tireSetupId: setup.id,
      tripStartedAt: trip.startTime,
      tripEndedAt: trip.endTime,
      distanceKm: 25,
      sourceVersion: 'test-v1',
      sourceFingerprint: `fp-${suffix}`,
      processedAt: new Date(),
    };

    await prisma.tireTripUsageLedger.create({ data: base });

    await expect(
      prisma.tireTripUsageLedger.create({
        data: { ...base, id: `ledger-dup-${suffix}`, sourceFingerprint: `fp-dup-${suffix}` },
      }),
    ).rejects.toThrow();

    await expect(
      prisma.tireTripUsageLedger.create({
        data: {
          ...base,
          id: `ledger-bad-org-${suffix}`,
          organizationId: `org-other-${suffix}`,
          sourceFingerprint: `fp-bad-${suffix}`,
        },
      }),
    ).rejects.toThrow(/organization/);

    await prisma.tireTripUsageLedger.deleteMany({ where: { tripId: trip.id } });
    await prisma.vehicleTrip.delete({ where: { id: trip.id } });
    await prisma.vehicleTireSetup.delete({ where: { id: setup.id } });
    await prisma.vehicle.delete({ where: { id: vehicle.id } });
    await prisma.organization.delete({ where: { id: org.id } });
    await prisma.$disconnect();
  });
});
