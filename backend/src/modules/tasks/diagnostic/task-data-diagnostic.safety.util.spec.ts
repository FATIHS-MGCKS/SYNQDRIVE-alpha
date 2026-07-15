import { assertSafeDiagnosticDatabaseTarget } from './task-data-diagnostic.safety.util';

describe('assertSafeDiagnosticDatabaseTarget', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('allows localhost database urls', () => {
    expect(() =>
      assertSafeDiagnosticDatabaseTarget({
        databaseUrl: 'postgresql://user:pass@localhost:5432/synqdrive_test',
      }),
    ).not.toThrow();
  });

  it('blocks production-looking database urls', () => {
    expect(() =>
      assertSafeDiagnosticDatabaseTarget({
        databaseUrl: 'postgresql://user:pass@db.synqdrive.eu:5432/synqdrive',
      }),
    ).toThrow(/production/i);
  });

  it('blocks remote non-local urls without override', () => {
    expect(() =>
      assertSafeDiagnosticDatabaseTarget({
        databaseUrl: 'postgresql://user:pass@10.0.0.5:5432/synqdrive',
      }),
    ).toThrow(/local\/test/i);
  });
});
