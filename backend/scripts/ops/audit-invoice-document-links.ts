/**
 * Read-only audit of invoice ↔ generated-document linking consistency.
 *
 * Dry-run only — never mutates data. Use before removing legacy fallbacks.
 *
 * Usage:
 *   cd backend && npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-document-links.ts --org <uuid>
 *   ORG_ID=<uuid> npx ts-node -r tsconfig-paths/register scripts/ops/audit-invoice-document-links.ts
 *
 * Exit codes: 0 = no critical issues, 1 = critical inconsistencies found, 2 = runtime error.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

{
  const envPath = path.resolve(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

type Severity = 'critical' | 'warning' | 'info';

interface Finding {
  severity: Severity;
  code: string;
  invoiceId?: string;
  documentId?: string;
  bookingId?: string;
  message: string;
}

function parseOrgId(): string {
  const fromArg = process.argv.find((a) => a.startsWith('--org='))?.slice('--org='.length);
  const orgId = fromArg || process.env.ORG_ID;
  if (!orgId) {
    console.error('Pass --org=<uuid> or ORG_ID env');
    process.exit(2);
  }
  return orgId;
}

async function main() {
  const prisma = new PrismaClient();
  const orgId = parseOrgId();
  const findings: Finding[] = [];

  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, companyName: true },
    });
    if (!org) {
      console.error(`Organization not found: ${orgId}`);
      process.exit(2);
    }

    const invoices = await prisma.orgInvoice.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        type: true,
        status: true,
        bookingId: true,
        generatedDocumentId: true,
      },
    });

    const docs = await prisma.generatedDocument.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        documentType: true,
        status: true,
        bookingId: true,
        invoiceId: true,
      },
    });

    const bundles = await prisma.bookingDocumentBundle.findMany({
      where: { organizationId: orgId },
      select: {
        bookingId: true,
        bookingInvoiceDocumentId: true,
        finalInvoiceDocumentId: true,
      },
    });

    const docById = new Map(docs.map((d) => [d.id, d]));
    const docsByInvoiceId = new Map<string, typeof docs>();
    for (const doc of docs) {
      if (!doc.invoiceId) continue;
      const list = docsByInvoiceId.get(doc.invoiceId) ?? [];
      list.push(doc);
      docsByInvoiceId.set(doc.invoiceId, list);
    }

    let pointerMismatch = 0;
    let missingInvoiceIdOnDoc = 0;
    let orphanPointer = 0;
    let legacyBookingOnly = 0;
    let crossTenantRisk = 0;

    for (const invoice of invoices) {
      const pointerId = invoice.generatedDocumentId;
      if (pointerId) {
        const pointed = docById.get(pointerId);
        if (!pointed) {
          orphanPointer += 1;
          findings.push({
            severity: 'critical',
            code: 'ORPHAN_ACTIVE_POINTER',
            invoiceId: invoice.id,
            documentId: pointerId,
            message: 'OrgInvoice.generatedDocumentId points to missing GeneratedDocument',
          });
        } else if (pointed.invoiceId && pointed.invoiceId !== invoice.id) {
          pointerMismatch += 1;
          findings.push({
            severity: 'critical',
            code: 'POINTER_INVOICE_ID_MISMATCH',
            invoiceId: invoice.id,
            documentId: pointerId,
            message: `Active pointer doc.invoiceId=${pointed.invoiceId} !== invoice.id`,
          });
        } else if (!pointed.invoiceId) {
          missingInvoiceIdOnDoc += 1;
          findings.push({
            severity: 'warning',
            code: 'POINTER_DOC_MISSING_INVOICE_ID',
            invoiceId: invoice.id,
            documentId: pointerId,
            message: 'Active pointer exists but GeneratedDocument.invoiceId is null (legacy write path)',
          });
        }
      }

      const linkedDocs = docsByInvoiceId.get(invoice.id) ?? [];
      const activeNonVoid = linkedDocs.filter((d) => d.status !== 'VOID');
      if (activeNonVoid.length > 0 && !pointerId) {
        findings.push({
          severity: 'warning',
          code: 'INVOICE_ID_SET_BUT_NO_POINTER',
          invoiceId: invoice.id,
          message: `${activeNonVoid.length} non-void doc(s) with invoiceId but OrgInvoice.generatedDocumentId is null`,
        });
      }

      if (invoice.bookingId && !pointerId) {
        const bookingFallback = docs.filter(
          (d) =>
            d.bookingId === invoice.bookingId &&
            ['BOOKING_INVOICE', 'FINAL_INVOICE'].includes(d.documentType) &&
            d.status !== 'VOID',
        );
        if (bookingFallback.length > 0) {
          legacyBookingOnly += 1;
          findings.push({
            severity: 'info',
            code: 'LEGACY_BOOKING_DOC_FALLBACK',
            invoiceId: invoice.id,
            bookingId: invoice.bookingId,
            message: `${bookingFallback.length} booking invoice doc(s) reachable only via bookingId fallback`,
          });
        }
      }
    }

    for (const doc of docs) {
      if (!doc.invoiceId) continue;
      const invoice = invoices.find((i) => i.id === doc.invoiceId);
      if (!invoice) {
        findings.push({
          severity: 'critical',
          code: 'DOC_INVOICE_ID_ORPHAN',
          documentId: doc.id,
          message: `GeneratedDocument.invoiceId=${doc.invoiceId} has no OrgInvoice in org`,
        });
      }
    }

    for (const bundle of bundles) {
      for (const [field, docId] of [
        ['bookingInvoiceDocumentId', bundle.bookingInvoiceDocumentId],
        ['finalInvoiceDocumentId', bundle.finalInvoiceDocumentId],
      ] as const) {
        if (!docId) continue;
        const doc = docById.get(docId);
        if (!doc) {
          findings.push({
            severity: 'critical',
            code: 'BUNDLE_POINTER_ORPHAN',
            bookingId: bundle.bookingId,
            documentId: docId,
            message: `BookingDocumentBundle.${field} points to missing document`,
          });
        } else if (doc.bookingId && doc.bookingId !== bundle.bookingId) {
          crossTenantRisk += 1;
          findings.push({
            severity: 'critical',
            code: 'BUNDLE_BOOKING_MISMATCH',
            bookingId: bundle.bookingId,
            documentId: docId,
            message: `Bundle bookingId !== document.bookingId (do not auto-repair)`,
          });
        }
      }
    }

    const critical = findings.filter((f) => f.severity === 'critical');
    const warnings = findings.filter((f) => f.severity === 'warning');
    const infos = findings.filter((f) => f.severity === 'info');

    const report = {
      org,
      dryRun: true,
      counts: {
        invoices: invoices.length,
        generatedDocuments: docs.length,
        bundles: bundles.length,
        findings: findings.length,
        critical: critical.length,
        warnings: warnings.length,
        info: infos.length,
        orphanPointer,
        pointerMismatch,
        missingInvoiceIdOnDoc,
        legacyBookingOnly,
        crossTenantRisk,
      },
      removalReadiness: {
        backfillComplete: critical.length === 0 && missingInvoiceIdOnDoc === 0,
        safeToDropBookingFallback: legacyBookingOnly === 0,
        safeToDropLegacyPointerOr: orphanPointer === 0 && pointerMismatch === 0,
        note: 'All seven removal gates require this report clean + green tests + staged prod run.',
      },
      findings,
    };

    console.log(JSON.stringify(report, null, 2));
    process.exit(critical.length > 0 ? 1 : 0);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
