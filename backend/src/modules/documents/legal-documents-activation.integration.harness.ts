import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { LEGAL_DOCUMENT_SINGLE_ACTIVE_INDEX } from './legal-documents.errors';
import { LEGAL_STATUS } from './documents.constants';

export type HarnessLegalRow = {
  id: string;
  organizationId: string;
  documentType: string;
  legalVariant: string | null;
  language: string;
  jurisdictionCountry: string;
  customerSegment: string;
  bookingChannel: string;
  productScope: string | null;
  stationScopeMode: string;
  priority: number;
  isMandatory: boolean;
  noticePurpose: string;
  status: string;
  versionLabel: string;
  title: string;
  fileName: string;
  mimeType: string;
  storageProvider: string;
  objectKey: string;
  checksum: string | null;
  sizeBytes: number | null;
  validFrom: Date | null;
  validUntil: Date | null;
  submittedForReviewAt: Date | null;
  submittedForReviewByUserId: string | null;
  approvedAt: Date | null;
  approvedByUserId: string | null;
  activatedAt: Date | null;
  activatedByUserId: string | null;
  revokedAt: Date | null;
  revokedByUserId: string | null;
  statusReason: string | null;
  changeSummary: string | null;
  legalOwnerName: string | null;
  uploadedByUserId: string | null;
  scanStatus: string;
  pageCount: number | null;
  validationErrorCode: string | null;
  validationErrorDetail: string | null;
  validatedAt: Date | null;
  malwareScannedAt: Date | null;
  malwareScannerId: string | null;
  malwareEngineVersion: string | null;
  malwareThreatName: string | null;
  malwareScanDetail: string | null;
  malwareScanAttempts: number | null;
  quarantineObjectKey: string | null;
  integrityStatus: string;
  integrityUnavailable: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TxClient = {
  organizationLegalDocument: {
    findFirst: (args: any) => Promise<HarnessLegalRow | null>;
    findUnique: (args: any) => Promise<HarnessLegalRow | null>;
    count: (args: any) => Promise<number>;
    updateMany: (args: any) => Promise<{ count: number }>;
    update: (args: any) => Promise<HarnessLegalRow>;
    create: (args: any) => Promise<HarnessLegalRow>;
    findMany: (args: any) => Promise<HarnessLegalRow[]>;
  };
};

function cloneRow(row: HarnessLegalRow): HarnessLegalRow {
  return { ...row };
}

function matchesWhere(row: HarnessLegalRow, where: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(where)) {
    if (key === 'id' && typeof value === 'object' && value && 'not' in (value as object)) {
      if (row.id === (value as { not: string }).not) return false;
      continue;
    }
    if (key === 'OR' && Array.isArray(value)) {
      if (!value.some((clause) => matchesWhere(row, clause as Record<string, unknown>))) {
        return false;
      }
      continue;
    }
    if (key === 'AND' && Array.isArray(value)) {
      if (!value.every((clause) => matchesWhere(row, clause as Record<string, unknown>))) {
        return false;
      }
      continue;
    }
    if (
      typeof value === 'object' &&
      value &&
      !Array.isArray(value) &&
      ('lte' in (value as object) || 'gt' in (value as object))
    ) {
      const field = (row as Record<string, unknown>)[key];
      if (field == null) return false;
      const dateField = field instanceof Date ? field : new Date(String(field));
      if ('lte' in (value as object)) {
        if (dateField > new Date((value as { lte: Date }).lte)) return false;
      }
      if ('gt' in (value as object)) {
        if (dateField <= new Date((value as { gt: Date }).gt)) return false;
      }
      continue;
    }
    if ((row as Record<string, unknown>)[key] !== value) return false;
  }
  return true;
}

function makeSingleActiveViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target: [LEGAL_DOCUMENT_SINGLE_ACTIVE_INDEX] },
  });
}

export function createLegalDocumentActivationHarness() {
  const rows = new Map<string, HarnessLegalRow>();
  let transactionChain: Promise<unknown> = Promise.resolve();
  let transactionDepth = 0;
  let bypassTransactionQueue = false;

  const assertSingleActiveInvariant = (candidate: HarnessLegalRow) => {
    if (candidate.status !== LEGAL_STATUS.ACTIVE) return;
    for (const other of rows.values()) {
      if (
        other.id !== candidate.id &&
        other.status === LEGAL_STATUS.ACTIVE &&
        other.organizationId === candidate.organizationId &&
        other.documentType === candidate.documentType &&
        other.language === candidate.language
      ) {
        throw makeSingleActiveViolation();
      }
    }
  };

  const makeTx = (): TxClient => ({
    organizationLegalDocument: {
      findFirst: async ({ where, include }) => {
        let row: HarnessLegalRow | null = null;
        if (where.id && where.organizationId) {
          const found = rows.get(where.id);
          row = found && found.organizationId === where.organizationId ? cloneRow(found) : null;
        } else {
          for (const candidate of rows.values()) {
            if (matchesWhere(candidate, where)) {
              row = cloneRow(candidate);
              break;
            }
          }
        }
        if (!row) return null;
        if (include?.stations) {
          return { ...row, stations: [] };
        }
        return row;
      },
      findUnique: async ({ where }) => {
        const row = rows.get(where.id);
        return row ? cloneRow(row) : null;
      },
      count: async ({ where }) => {
        let n = 0;
        for (const row of rows.values()) {
          if (matchesWhere(row, where)) n++;
        }
        return n;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (!matchesWhere(row, where)) continue;
          const next = { ...row, ...data };
          assertSingleActiveInvariant(next);
          Object.assign(row, data, { updatedAt: new Date() });
          count++;
        }
        return { count };
      },
      update: async ({ where, data }) => {
        const row = rows.get(where.id);
        if (!row) throw new Error(`missing row ${where.id}`);
        const next = { ...row, ...data };
        assertSingleActiveInvariant(next);
        Object.assign(row, data, { updatedAt: new Date() });
        return cloneRow(row);
      },
      create: async ({ data }) => {
        const now = new Date();
        const row: HarnessLegalRow = {
          id: data.id ?? randomUUID(),
          organizationId: data.organizationId,
          documentType: data.documentType,
          legalVariant: data.legalVariant ?? null,
          language: data.language ?? 'de',
          jurisdictionCountry: data.jurisdictionCountry ?? 'DE',
          customerSegment: data.customerSegment ?? 'BOTH',
          bookingChannel: data.bookingChannel ?? 'ALL',
          productScope: data.productScope ?? null,
          stationScopeMode: data.stationScopeMode ?? 'ORGANIZATION_WIDE',
          priority: data.priority ?? 0,
          isMandatory: data.isMandatory ?? true,
          noticePurpose: data.noticePurpose ?? 'GENERAL_NOTICE',
          status: data.status ?? LEGAL_STATUS.DRAFT,
          versionLabel: data.versionLabel ?? 'v1',
          title: data.title ?? data.documentType,
          fileName: data.fileName ?? 'doc.pdf',
          mimeType: data.mimeType ?? 'application/pdf',
          storageProvider: data.storageProvider ?? 'local',
          objectKey: data.objectKey ?? 'k',
          checksum: data.checksum ?? null,
          sizeBytes: data.sizeBytes ?? null,
          validFrom: data.validFrom ?? null,
          validUntil: data.validUntil ?? null,
          submittedForReviewAt: data.submittedForReviewAt ?? null,
          submittedForReviewByUserId: data.submittedForReviewByUserId ?? null,
          approvedAt: data.approvedAt ?? null,
          approvedByUserId: data.approvedByUserId ?? null,
          activatedAt: data.activatedAt ?? null,
          activatedByUserId: data.activatedByUserId ?? null,
          revokedAt: data.revokedAt ?? null,
          revokedByUserId: data.revokedByUserId ?? null,
          statusReason: data.statusReason ?? null,
          changeSummary: data.changeSummary ?? null,
          legalOwnerName: data.legalOwnerName ?? null,
          uploadedByUserId: data.uploadedByUserId ?? null,
          scanStatus: data.scanStatus ?? 'SCAN_PASSED',
          pageCount: data.pageCount ?? 1,
          validationErrorCode: data.validationErrorCode ?? null,
          validationErrorDetail: data.validationErrorDetail ?? null,
          validatedAt: data.validatedAt ?? now,
          malwareScannedAt: data.malwareScannedAt ?? null,
          malwareScannerId: data.malwareScannerId ?? null,
          malwareEngineVersion: data.malwareEngineVersion ?? null,
          malwareThreatName: data.malwareThreatName ?? null,
          malwareScanDetail: data.malwareScanDetail ?? null,
          malwareScanAttempts: data.malwareScanAttempts ?? 0,
          quarantineObjectKey: data.quarantineObjectKey ?? null,
          integrityStatus: data.integrityStatus ?? 'UNVERIFIED',
          integrityUnavailable: data.integrityUnavailable ?? false,
          createdAt: now,
          updatedAt: now,
        };
        rows.set(row.id, row);
        return cloneRow(row);
      },
      findMany: async ({ where, orderBy, include }) => {
        const list = [...rows.values()].filter((row) => matchesWhere(row, where));
        if (orderBy?.activatedAt === 'desc') {
          list.sort((a, b) => (b.activatedAt?.getTime() ?? 0) - (a.activatedAt?.getTime() ?? 0));
        }
        return list.map((row) => {
          const cloned = cloneRow(row);
          return include?.stations ? { ...cloned, stations: [] } : cloned;
        });
      },
    },
  });

  const prisma = {
    organizationLegalDocument: makeTx().organizationLegalDocument,
    $transaction: async <T>(fn: (tx: TxClient) => Promise<T>): Promise<T> => {
      const run = async () => {
        transactionDepth++;
        const snapshot = new Map<string, HarnessLegalRow>();
        for (const [id, row] of rows.entries()) {
          snapshot.set(id, cloneRow(row));
        }
        try {
          return await fn(makeTx());
        } catch (err) {
          if (!bypassTransactionQueue) {
            rows.clear();
            for (const [id, row] of snapshot.entries()) {
              rows.set(id, cloneRow(row));
            }
          }
          throw err;
        } finally {
          transactionDepth--;
        }
      };
      if (bypassTransactionQueue || transactionDepth > 0) {
        return run();
      }
      const result = transactionChain.then(run, run);
      transactionChain = result.then(
        () => undefined,
        () => undefined,
      );
      return result as Promise<T>;
    },
  };

  function baseRow(input: {
    id: string;
    organizationId: string;
    documentType: string;
    language?: string;
    versionLabel: string;
    status?: string;
  }): HarnessLegalRow {
    const now = new Date();
    return {
      id: input.id,
      organizationId: input.organizationId,
      documentType: input.documentType,
      legalVariant: null,
      language: input.language ?? 'de',
      jurisdictionCountry: 'DE',
      customerSegment: 'BOTH',
      bookingChannel: 'ALL',
      productScope: null,
      stationScopeMode: 'ORGANIZATION_WIDE',
      priority: 0,
      isMandatory: true,
      noticePurpose: 'GENERAL_NOTICE',
      status: input.status ?? LEGAL_STATUS.DRAFT,
      versionLabel: input.versionLabel,
      title: input.documentType,
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
      storageProvider: 'local',
      objectKey: `k/${input.id}`,
      checksum: null,
      sizeBytes: 100,
      validFrom: null,
      validUntil: null,
      submittedForReviewAt: null,
      submittedForReviewByUserId: null,
      approvedAt: null,
      approvedByUserId: null,
      activatedAt: null,
      activatedByUserId: null,
      revokedAt: null,
      revokedByUserId: null,
      statusReason: null,
      changeSummary: null,
      legalOwnerName: null,
      uploadedByUserId: null,
      scanStatus: 'SCAN_PASSED',
      pageCount: 1,
      validationErrorCode: null,
      validationErrorDetail: null,
      validatedAt: now,
      malwareScannedAt: null,
      malwareScannerId: null,
      malwareEngineVersion: null,
      malwareThreatName: null,
      malwareScanDetail: null,
      malwareScanAttempts: 0,
      quarantineObjectKey: null,
      integrityStatus: 'UNVERIFIED',
      integrityUnavailable: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  return {
    prisma,
    rows,
    seedDraft(input: {
      id: string;
      organizationId: string;
      documentType: string;
      language?: string;
      versionLabel: string;
    }) {
      const row = baseRow(input);
      rows.set(row.id, row);
      return row;
    },
    seedApproved(input: {
      id: string;
      organizationId: string;
      documentType: string;
      language?: string;
      versionLabel: string;
    }) {
      const row = baseRow({ ...input, status: LEGAL_STATUS.APPROVED });
      row.approvedAt = new Date();
      rows.set(row.id, row);
      return row;
    },
    countActive(orgId: string, documentType: string, language: string) {
      return [...rows.values()].filter(
        (r) =>
          r.organizationId === orgId &&
          r.documentType === documentType &&
          r.language === language &&
          r.status === LEGAL_STATUS.ACTIVE,
      ).length;
    },
    async flushTransactions() {
      await transactionChain;
    },
    async withConcurrentTransactions<T>(fn: () => Promise<T>): Promise<T> {
      bypassTransactionQueue = true;
      try {
        return await fn();
      } finally {
        bypassTransactionQueue = false;
      }
    },
  };
}
