export const PRODUCT_CATALOG_V2_DISPOSABLE_DB = 'synqdrive_product_metadata_p1';

export function assertProductCatalogV2DisposablePostgres(optInEnvVar: string): void {
  if (process.env[optInEnvVar] !== '1') {
    throw new Error(`${optInEnvVar}=1 is required to run Product Catalog V2 disposable Postgres suites`);
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url || /production|staging|app\.synqdrive|srv1374778|hstgr\.cloud|mein-vps/i.test(url)) {
    throw new Error(`${optInEnvVar} requires an isolated local DATABASE_URL`);
  }
  if (!url.includes(PRODUCT_CATALOG_V2_DISPOSABLE_DB)) {
    throw new Error(
      `DATABASE_URL must reference disposable database "${PRODUCT_CATALOG_V2_DISPOSABLE_DB}"`,
    );
  }
}