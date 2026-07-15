import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BACKEND_ROOT = path.join(__dirname, '../../..');
const SCHEMA_PATH = path.join(BACKEND_ROOT, 'prisma/schema.prisma');
const MIGRATION_PATH = path.join(
  BACKEND_ROOT,
  'prisma/migrations/20260715210000_billing_usage_ledger_outbox_schema/migration.sql',
);

function readSchema(): string {
  return fs.readFileSync(SCHEMA_PATH, 'utf8');
}

describe('Billing usage ledger & outbox schema (Prompt 08)', () => {
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

  it('defines billable vehicle assignment with org, vehicle, subscription item and approval', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingBillableVehicleAssignment[\s\S]*?organizationId/);
    expect(schema).toMatch(/model BillingBillableVehicleAssignment[\s\S]*?vehicleId/);
    expect(schema).toMatch(/model BillingBillableVehicleAssignment[\s\S]*?subscriptionItemId/);
    expect(schema).toMatch(/model BillingBillableVehicleAssignment[\s\S]*?billableFrom/);
    expect(schema).toMatch(/model BillingBillableVehicleAssignment[\s\S]*?approvedByUserId/);
    expect(schema).toContain('@@map("billing_billable_vehicle_assignments")');
  });

  it('defines append-only quantity events with idempotency key', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingQuantityEvent[\s\S]*?idempotencyKey\s+String\s+@unique/);
    expect(schema).toMatch(/model BillingQuantityEvent[\s\S]*?quantityBefore/);
    expect(schema).toMatch(/model BillingQuantityEvent[\s\S]*?quantityAfter/);
    expect(schema).toMatch(/model BillingQuantityEvent[\s\S]*?effectiveAt/);
    expect(schema).toMatch(/model BillingQuantityEvent[\s\S]*?subscriptionId/);
    expect(schema).toMatch(/model BillingQuantityEvent[\s\S]*?vehicleId/);
    expect(schema).toContain('@@map("billing_quantity_events")');
  });

  it('extends usage snapshots with calculation basis, lock and provenance', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingUsageSnapshot[\s\S]*?calculatedQuantity/);
    expect(schema).toMatch(/model BillingUsageSnapshot[\s\S]*?calculationBasis/);
    expect(schema).toMatch(/model BillingUsageSnapshot[\s\S]*?lockedAt/);
    expect(schema).toMatch(/model BillingUsageSnapshot[\s\S]*?sourceHash/);
    expect(schema).toMatch(/model BillingUsageSnapshot[\s\S]*?createdByUserId/);
  });

  it('extends invoice lines with product/price snapshots and Stripe line id per mode', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingInvoiceLine[\s\S]*?productSnapshotJson/);
    expect(schema).toMatch(/model BillingInvoiceLine[\s\S]*?priceSnapshotJson/);
    expect(schema).toMatch(/model BillingInvoiceLine[\s\S]*?stripeInvoiceLineId/);
    expect(schema).toContain('@@unique([stripeInvoiceLineId, stripeMode])');
  });

  it('defines payments, attempts, refunds and credit notes with Stripe uniqueness per mode', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingPayment[\s\S]*?stripePaymentIntentId/);
    expect(schema).toContain('@@unique([stripePaymentIntentId, stripeMode])');
    expect(schema).toMatch(/model BillingPaymentAttempt[\s\S]*?attemptNumber/);
    expect(schema).toContain('@@unique([paymentId, attemptNumber])');
    expect(schema).toMatch(/model BillingRefund[\s\S]*?stripeRefundId/);
    expect(schema).toContain('@@unique([stripeRefundId, stripeMode])');
    expect(schema).toMatch(/model BillingCreditNote[\s\S]*?stripeCreditNoteId/);
    expect(schema).toContain('@@unique([stripeCreditNoteId, stripeMode])');
    expect(schema).toMatch(/model BillingInvoice[\s\S]*?@@unique\(\[stripeInvoiceId, stripeMode\]\)/);
  });

  it('defines billing domain event outbox with idempotency and versioned payload', () => {
    const schema = readSchema();
    expect(schema).toMatch(/model BillingDomainEventOutbox[\s\S]*?payloadVersion/);
    expect(schema).toMatch(/model BillingDomainEventOutbox[\s\S]*?idempotencyKey\s+String\s+@unique/);
    expect(schema).toMatch(/model BillingDomainEventOutbox[\s\S]*?aggregateType/);
    expect(schema).toContain('@@map("billing_domain_event_outbox")');
  });

  it('migration enforces append-only ledger, locked snapshots and outbox payload immutability', () => {
    const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
    expect(sql).toContain('billing_quantity_events_idempotency_key_key');
    expect(sql).toContain('billing_domain_event_outbox_idempotency_key_key');
    expect(sql).toContain('billing_invoices_stripe_invoice_id_stripe_mode_key');
    expect(sql).toContain('billing_invoice_lines_stripe_invoice_line_id_stripe_mode_key');
    expect(sql).toContain('billing_payments_stripe_payment_intent_id_stripe_mode_key');
    expect(sql).toContain('billing_quantity_events_append_only');
    expect(sql).toContain('billing_payment_attempts_append_only');
    expect(sql).toContain('billing_refunds_append_only');
    expect(sql).toContain('billing_credit_notes_append_only');
    expect(sql).toContain('billing_invoice_lines_append_only');
    expect(sql).toContain('billing_usage_snapshots_locked_guard');
    expect(sql).toContain('billing_domain_event_outbox_immutable_payload');
  });
});

describe('Billing usage ledger constraints integration (requires DATABASE_URL)', () => {
  const databaseUrl = process.env.DATABASE_URL;
  const runDb = process.env.BILLING_SCHEMA_INTEGRATION === '1' && !!databaseUrl;

  (runDb ? it : it.skip)('enforces idempotent quantity events, Stripe uniqueness and append-only history', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const orgId = `org-ledger-${Date.now()}`;
    const subId = `sub-ledger-${Date.now()}`;
    const idemKey = `qty-idem-${Date.now()}`;

    try {
      execSync('npm run prisma:migrate:deploy', {
        cwd: BACKEND_ROOT,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        stdio: 'pipe',
      });

      await prisma.organization.create({
        data: {
          id: orgId,
          companyName: 'Billing Ledger Test Org',
          businessType: 'FLEET',
          status: 'ACTIVE',
        },
      });

      const fleet = await prisma.billingCatalogProduct.findUniqueOrThrow({
        where: { key: 'FLEET' },
      });

      await prisma.billingSubscription.create({
        data: {
          id: subId,
          organizationId: orgId,
          status: 'ACTIVE',
          currency: 'EUR',
        },
      });

      const now = new Date();
      const item = await prisma.billingSubscriptionItem.create({
        data: {
          subscriptionId: subId,
          organizationId: orgId,
          billingProductId: fleet.id,
          itemRole: 'BASE_PLAN',
          quantity: 1,
          validFrom: now,
          status: 'ACTIVE',
        },
      });

      const qtyEvent = await prisma.billingQuantityEvent.create({
        data: {
          organizationId: orgId,
          subscriptionItemId: item.id,
          eventType: 'MANUAL_ADJUSTMENT',
          delta: 1,
          quantityBefore: 1,
          quantityAfter: 2,
          effectiveAt: now,
          source: 'ADMIN',
          idempotencyKey: idemKey,
        },
      });
      expect(qtyEvent.id).toBeTruthy();

      await expect(
        prisma.billingQuantityEvent.create({
          data: {
            organizationId: orgId,
            subscriptionItemId: item.id,
            eventType: 'MANUAL_ADJUSTMENT',
            delta: 1,
            quantityBefore: 2,
            quantityAfter: 3,
            effectiveAt: now,
            source: 'ADMIN',
            idempotencyKey: idemKey,
          },
        }),
      ).rejects.toThrow();

      await expect(
        prisma.billingQuantityEvent.update({
          where: { id: qtyEvent.id },
          data: { delta: 99 },
        }),
      ).rejects.toThrow();

      const invoice = await prisma.billingInvoice.create({
        data: {
          subscriptionId: subId,
          amountCents: 1000,
          currency: 'EUR',
          status: 'OPEN',
          invoiceDate: now,
          stripeInvoiceId: `in_test_${Date.now()}`,
          stripeMode: 'TEST',
        },
      });

      await expect(
        prisma.billingInvoice.create({
          data: {
            subscriptionId: subId,
            amountCents: 2000,
            currency: 'EUR',
            status: 'OPEN',
            invoiceDate: now,
            stripeInvoiceId: invoice.stripeInvoiceId,
            stripeMode: 'TEST',
          },
        }),
      ).rejects.toThrow();

      const line = await prisma.billingInvoiceLine.create({
        data: {
          invoiceId: invoice.id,
          subscriptionItemId: item.id,
          description: 'Fleet base',
          quantity: 2,
          unitAmountCents: 500,
          subtotalCents: 1000,
          totalCents: 1190,
          stripeInvoiceLineId: `il_test_${Date.now()}`,
          stripeMode: 'TEST',
        },
      });

      await expect(
        prisma.billingInvoiceLine.update({
          where: { id: line.id },
          data: { quantity: 3 },
        }),
      ).rejects.toThrow();

      const snapshot = await prisma.billingUsageSnapshot.create({
        data: {
          organizationId: orgId,
          subscriptionItemId: item.id,
          periodStart: now,
          periodEnd: new Date(now.getTime() + 86_400_000),
          connectedVehicleCount: 2,
          billableVehicleCount: 2,
          calculatedQuantity: 2,
          calculationBasis: 'BILLABLE_VEHICLES',
          billableVehicleIds: [],
          calculationStatus: 'OK',
          lockedAt: now,
        },
      });

      await expect(
        prisma.billingUsageSnapshot.update({
          where: { id: snapshot.id },
          data: { calculatedQuantity: 99 },
        }),
      ).rejects.toThrow();

      const outbox = await prisma.billingDomainEventOutbox.create({
        data: {
          eventType: 'billing.quantity.changed',
          aggregateType: 'BillingSubscriptionItem',
          aggregateId: item.id,
          payload: { quantityAfter: 2 },
          occurredAt: now,
          idempotencyKey: `outbox-${Date.now()}`,
        },
      });

      await expect(
        prisma.billingDomainEventOutbox.create({
          data: {
            eventType: 'billing.quantity.changed',
            aggregateType: 'BillingSubscriptionItem',
            aggregateId: item.id,
            payload: { quantityAfter: 2 },
            occurredAt: now,
            idempotencyKey: outbox.idempotencyKey,
          },
        }),
      ).rejects.toThrow();

      const published = await prisma.billingDomainEventOutbox.update({
        where: { id: outbox.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: now,
          retryCount: 1,
        },
      });
      expect(published.status).toBe('PUBLISHED');

      await expect(
        prisma.billingDomainEventOutbox.update({
          where: { id: outbox.id },
          data: { payload: { quantityAfter: 99 } },
        }),
      ).rejects.toThrow();
    } finally {
      await prisma.billingSubscription.deleteMany({ where: { organizationId: orgId } }).catch(() => undefined);
      await prisma.organization.deleteMany({ where: { id: orgId } }).catch(() => undefined);
      await prisma.$disconnect();
    }
  });
});
