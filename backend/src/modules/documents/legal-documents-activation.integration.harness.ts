import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { LEGAL_DOCUMENT_SINGLE_ACTIVE_INDEX } from './legal-documents.errors';
import { LEGAL_STATUS } from './documents.constants';

export type HarnessLegalRow = {
  id: string;
  organizationId: string;
  documentType: string;
  language: string;
  status: string;
  versionLabel: string;
  title: string;
  fileName: string;
  mimeType: string;
  storageProvider: string;
  objectKey: string;
  checksum: string | null;
  sizeBytes: number | null;
  activeFrom: Date | null;
  uploadedByUserId: string | null;
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
      findFirst: async ({ where }) => {
        if (where.id && where.organizationId) {
          const row = rows.get(where.id);
          return row && row.organizationId === where.organizationId ? cloneRow(row) : null;
        }
        for (const row of rows.values()) {
          if (matchesWhere(row, where)) return cloneRow(row);
        }
        return null;
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
          language: data.language ?? 'de',
          status: data.status ?? LEGAL_STATUS.DRAFT,
          versionLabel: data.versionLabel ?? 'v1',
          title: data.title ?? data.documentType,
          fileName: data.fileName ?? 'doc.pdf',
          mimeType: data.mimeType ?? 'application/pdf',
          storageProvider: data.storageProvider ?? 'local',
          objectKey: data.objectKey ?? 'k',
          checksum: data.checksum ?? null,
          sizeBytes: data.sizeBytes ?? null,
          activeFrom: data.activeFrom ?? null,
          uploadedByUserId: data.uploadedByUserId ?? null,
          createdAt: now,
          updatedAt: now,
        };
        rows.set(row.id, row);
        return cloneRow(row);
      },
      findMany: async ({ where, orderBy }) => {
        const list = [...rows.values()].filter((row) => matchesWhere(row, where));
        if (orderBy?.activeFrom === 'desc') {
          list.sort((a, b) => (b.activeFrom?.getTime() ?? 0) - (a.activeFrom?.getTime() ?? 0));
        }
        return list.map(cloneRow);
      },
    },
  });

  const prisma = {
    organizationLegalDocument: makeTx().organizationLegalDocument,
    $transaction: async <T>(fn: (tx: TxClient) => Promise<T>): Promise<T> => {
      const run = async () => {
        transactionDepth++;
        try {
          return await fn(makeTx());
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
      const now = new Date();
      const row: HarnessLegalRow = {
        id: input.id,
        organizationId: input.organizationId,
        documentType: input.documentType,
        language: input.language ?? 'de',
        status: LEGAL_STATUS.DRAFT,
        versionLabel: input.versionLabel,
        title: input.documentType,
        fileName: 'doc.pdf',
        mimeType: 'application/pdf',
        storageProvider: 'local',
        objectKey: `k/${input.id}`,
        checksum: null,
        sizeBytes: 100,
        activeFrom: null,
        uploadedByUserId: null,
        createdAt: now,
        updatedAt: now,
      };
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
    /** Release queued transactions to interleave (used to simulate concurrent commits). */
    async flushTransactions() {
      await transactionChain;
    },
    /** Run callbacks with top-level transactions allowed to overlap (race simulation). */
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
