/**
 * Bootstrap TEST billing catalog (price books, published versions, Stripe sync).
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/bootstrap-sandbox-billing-catalog.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/ops/bootstrap-sandbox-billing-catalog.ts --execute
 */
import * as fs from 'fs';
import * as path from 'path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PricebookService } from '../../src/modules/billing/pricebook.service';
import { StripeCatalogSyncService } from '../../src/modules/billing/stripe-catalog-sync.service';
import { BillingStripeMode } from '@prisma/client';

const BASE_PRODUCTS = [
  { key: 'RENTAL', name: 'SynqDrive Rental — Sandbox', isDefault: false },
  { key: 'FLEET', name: 'SynqDrive Fleet — Sandbox', isDefault: true },
] as const;

const SANDBOX_TIER = {
  minVehicles: 1,
  maxVehicles: null as number | null,
  unitPriceCents: 2499,
  sortOrder: 0,
};

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const execute = process.argv.includes('--execute');
  if (dryRun === execute) {
    console.error('Pass exactly one of --dry-run or --execute');
    process.exit(1);
  }
  return { dryRun };
}

async function main() {
  const { dryRun } = parseArgs();
  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const pricebook = app.get(PricebookService);
    const catalogSync = app.get(StripeCatalogSyncService);
    const report: Array<Record<string, unknown>> = [];

    for (const product of BASE_PRODUCTS) {
      const allBooks = await pricebook.listPriceBooks();
      const existingBook = allBooks.find((row) => row.productKey === product.key);
      let bookId = existingBook?.id;

      if (!bookId) {
        if (dryRun) {
          report.push({ productKey: product.key, action: 'create_price_book', dryRun: true });
          continue;
        }
        const created = await pricebook.createPriceBook({
          name: product.name,
          productKey: product.key,
          isDefault: product.isDefault,
        });
        bookId = created.id;
        report.push({ productKey: product.key, action: 'create_price_book', priceBookId: bookId });
      }

      const versions = await pricebook.listVersions(bookId);
      let versionId = versions.find((v) => v.status === 'ACTIVE')?.id;
      if (!versionId) {
        if (dryRun) {
          report.push({ productKey: product.key, action: 'create_publish_version', dryRun: true });
          continue;
        }
        const draft = await pricebook.createDraftVersion(bookId, {
          versionLabel: 'sandbox-v1',
        });
        await pricebook.replaceDraftTiers(draft.id, [SANDBOX_TIER]);
        const published = await pricebook.publishVersion(draft.id);
        versionId = published.id;
        report.push({
          productKey: product.key,
          action: 'publish_version',
          priceVersionId: versionId,
        });
      }

      if (!dryRun) {
        const sync = await catalogSync.syncPriceVersion({
          priceVersionId: versionId,
          stripeMode: BillingStripeMode.TEST,
        });
        report.push({
          productKey: product.key,
          action: 'stripe_catalog_sync',
          priceVersionId: versionId,
          stripeProductId: sync.stripeProductId,
          stripePriceId: sync.stripePriceId,
        });
      } else {
        report.push({
          productKey: product.key,
          action: 'stripe_catalog_sync',
          priceVersionId: versionId,
          dryRun: true,
        });
      }
    }

    console.log(JSON.stringify({ dryRun, report }, null, 2));
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
