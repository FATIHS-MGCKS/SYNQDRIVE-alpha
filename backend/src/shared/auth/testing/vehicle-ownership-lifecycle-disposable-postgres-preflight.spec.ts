import {
  assertVehicleOwnershipLifecycleDisposablePostgresPreflight,
} from './vehicle-ownership-lifecycle-disposable-postgres-preflight';

describe('vehicle-ownership-lifecycle disposable postgres preflight', () => {
  const envBackup = { ...process.env };

  afterEach(() => {
    process.env = { ...envBackup };
  });

  it('rejects when opt-in env is not set', () => {
    delete process.env.VEHICLE_OWNERSHIP_LIFECYCLE_PG;
    expect(() => assertVehicleOwnershipLifecycleDisposablePostgresPreflight()).toThrow(
      /VEHICLE_OWNERSHIP_LIFECYCLE_PG=1 is required/,
    );
  });

  it('rejects production host patterns', () => {
    process.env.VEHICLE_OWNERSHIP_LIFECYCLE_PG = '1';
    process.env.DATABASE_URL =
      'postgresql://u:p@srv1374778.hstgr.cloud:5432/synqdrive_vehicle_ownership_lifecycle_test';
    expect(() => assertVehicleOwnershipLifecycleDisposablePostgresPreflight()).toThrow(
      /production or staging/,
    );
  });

  it('rejects ambiguous synqdrive database name', () => {
    process.env.VEHICLE_OWNERSHIP_LIFECYCLE_PG = '1';
    process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:5432/synqdrive';
    expect(() => assertVehicleOwnershipLifecycleDisposablePostgresPreflight()).toThrow(
      /not a disposable test database/,
    );
  });

  it('accepts explicitly named localhost disposable database', () => {
    process.env.VEHICLE_OWNERSHIP_LIFECYCLE_PG = '1';
    process.env.DATABASE_URL =
      'postgresql://u:p@127.0.0.1:5432/synqdrive_vehicle_ownership_lifecycle_test';
    expect(() => assertVehicleOwnershipLifecycleDisposablePostgresPreflight()).not.toThrow();
  });
});