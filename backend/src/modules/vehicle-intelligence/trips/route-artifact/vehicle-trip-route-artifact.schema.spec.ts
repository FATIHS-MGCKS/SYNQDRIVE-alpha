import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260829140000_vehicle_trip_route_artifact/migration.sql',
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('VehicleTripRouteArtifact schema (R1)', () => {
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

  it('defines RouteQuality enum and VehicleTripRouteArtifact model', () => {
    const schema = readSchema();
    expect(schema).toContain('enum RouteQuality');
    expect(schema).toMatch(/MATCHED[\s\S]*FILTERED[\s\S]*RAW/);
    expect(schema).toMatch(/model VehicleTripRouteArtifact[\s\S]*?tripId\s+String\s+@unique/);
    expect(schema).toMatch(/model VehicleTripRouteArtifact[\s\S]*?matchedGeometryJson/);
    expect(schema).toMatch(/model VehicleTripRouteArtifact[\s\S]*?filteredGeometryJson/);
    expect(schema).toMatch(/model VehicleTripRouteArtifact[\s\S]*?inputFingerprint/);
    expect(schema).toMatch(/model VehicleTripRouteArtifact[\s\S]*?algorithmVersion/);
    expect(schema).not.toMatch(/rawGeometryJson/);
    expect(schema).toContain('@@map("vehicle_trip_route_artifacts")');
  });

  it('VehicleTrip relation is optional 1:1 and not on default list includes', () => {
    const schema = readSchema();
    expect(schema).toContain('routeArtifact              VehicleTripRouteArtifact?');
  });

  it('C — migration creates table, unique trip_id, scope guard', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('CREATE TABLE "vehicle_trip_route_artifacts"');
    expect(sql).toContain('CREATE TYPE "RouteQuality"');
    expect(sql).toContain('vehicle_trip_route_artifacts_trip_id_key');
    expect(sql).toContain('vehicle_trip_route_artifact_scope_guard');
    expect(sql).toContain('ON DELETE CASCADE');
    expect(sql).not.toContain('INSERT INTO');
  });
});
