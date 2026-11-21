const P3B0_OPT_IN_ENV = 'P3B0_PLATFORM_PERMISSION_PG';

export function assertP3b0DisposablePostgresPreflight(): void {
  if (process.env[P3B0_OPT_IN_ENV] !== '1') {
    throw new Error(`${P3B0_OPT_IN_ENV}=1 is required for disposable Postgres integration tests`);
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error(`${P3B0_OPT_IN_ENV}=1 requires DATABASE_URL (isolated disposable database only)`);
  }
}