/**
 * Cleanup sandbox billing artifacts for a dedicated test organization.
 * Never touches production orgs — requires explicit E2E_BILLING_ORG_ID.
 *
 * Usage:
 *   E2E_BILLING_ORG_ID=org-sandbox-billing-e2e npm run billing:sandbox:cleanup
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

const ORG_ID = process.env.E2E_BILLING_ORG_ID?.trim();
const CONFIRM = process.env.E2E_BILLING_CLEANUP_CONFIRM === '1';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  if (!ORG_ID) {
    throw new Error('E2E_BILLING_ORG_ID is required');
  }
  if (!ORG_ID.includes('sandbox') && !ORG_ID.startsWith('org-sandbox')) {
    throw new Error(
      'Cleanup refused: org id must contain "sandbox" (e.g. org-sandbox-billing-e2e)',
    );
  }
  if (!CONFIRM) {
    throw new Error('Set E2E_BILLING_CLEANUP_CONFIRM=1 to execute cleanup');
  }

  const prisma = new PrismaClient();
  try {
    const org = await prisma.organization.findUnique({ where: { id: ORG_ID } });
    if (!org) {
      console.log(JSON.stringify({ step: 'cleanup', status: 'skipped', reason: 'org_not_found' }));
      return;
    }

    const subscriptions = await prisma.billingSubscription.findMany({
      where: { organizationId: ORG_ID },
      select: { id: true },
    });
    const subIds = subscriptions.map((sub) => sub.id);

    const deleted = {
      webhookEvents: (
        await prisma.stripeWebhookEvent.deleteMany({ where: { organizationId: ORG_ID } })
      ).count,
      reconciliationDrifts: (
        await prisma.billingReconciliationDrift.deleteMany({ where: { organizationId: ORG_ID } })
      ).count,
      invoiceLines: subIds.length
        ? (
            await prisma.billingInvoiceLine.deleteMany({
              where: { invoice: { subscriptionId: { in: subIds } } },
            })
          ).count
        : 0,
      invoices: subIds.length
        ? (await prisma.billingInvoice.deleteMany({ where: { subscriptionId: { in: subIds } } }))
            .count
        : 0,
      paymentMethods: (
        await prisma.billingPaymentMethod.deleteMany({ where: { organizationId: ORG_ID } })
      ).count,
      usageSnapshots: (
        await prisma.billingUsageSnapshot.deleteMany({ where: { organizationId: ORG_ID } })
      ).count,
      subscriptionItems: subIds.length
        ? (
            await prisma.billingSubscriptionItem.deleteMany({
              where: { subscriptionId: { in: subIds } },
            })
          ).count
        : 0,
      subscriptions: (
        await prisma.billingSubscription.deleteMany({ where: { organizationId: ORG_ID } })
      ).count,
    };

    console.log(JSON.stringify({ step: 'cleanup', organizationId: ORG_ID, deleted }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
