import { BadRequestException } from '@nestjs/common';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import type { DocumentStoragePort } from './document-storage.interface';
import { DOCUMENT_TYPE } from '../documents.constants';
import { LocalDocumentStorageService } from './local-document-storage.service';
import {
  S3PrivateDocumentStorageService,
} from './s3-private-document-storage.service';
import { InMemoryDocumentPrivateS3Operations } from './testing/in-memory-document-private-s3.operations';
import documentsConfig from '@config/documents.config';
import type { ConfigType } from '@nestjs/config';

function configStub(values: Record<string, unknown> = {}) {
  return {
    get: jest.fn((key: string, def?: unknown) => (key in values ? values[key] : def)),
  } as any;
}

type StorageFixture = {
  storage: DocumentStoragePort;
  cleanup: () => Promise<void>;
};

function localDocumentsConfig(baseDir: string, quarantineDir: string): ConfigType<typeof documentsConfig> {
  return {
    storageProvider: 'local',
    allowLocalStorageInProduction: false,
    localStorageDir: baseDir,
    localQuarantineStorageDir: quarantineDir,
    privateS3: {
      bucket: '',
      region: 'auto',
      endpoint: '',
      accessKeyId: '',
      secretAccessKey: '',
      forcePathStyle: true,
      keyPrefix: '',
      sseAlgorithm: 'aes256',
      kmsKeyId: '',
    },
    storageHealthAlertThreshold: 5,
  } as ConfigType<typeof documentsConfig>;
}

function s3DocumentsConfig(): ConfigType<typeof documentsConfig> {
  return {
    storageProvider: 's3',
    allowLocalStorageInProduction: false,
    localStorageDir: './storage/documents',
    localQuarantineStorageDir: './storage/documents-quarantine',
    privateS3: {
      bucket: 'synqdrive-private-docs-test',
      region: 'auto',
      endpoint: 'http://localhost:9000',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      forcePathStyle: true,
      keyPrefix: 'contract-test',
      sseAlgorithm: 'aes256',
      kmsKeyId: '',
    },
    storageHealthAlertThreshold: 5,
  } as ConfigType<typeof documentsConfig>;
}

async function createLocalFixture(): Promise<StorageFixture> {
  const baseDir = await mkdtemp(join(tmpdir(), 'synq-docs-contract-'));
  const quarantineDir = await mkdtemp(join(tmpdir(), 'synq-docs-q-contract-'));
  const cfg = localDocumentsConfig(baseDir, quarantineDir);
  const storage = new LocalDocumentStorageService(
    configStub({
      'documents.localStorageDir': baseDir,
      'documents.localQuarantineStorageDir': quarantineDir,
    }),
  );
  return {
    storage,
    cleanup: async () => {
      await rm(baseDir, { recursive: true, force: true });
      await rm(quarantineDir, { recursive: true, force: true });
    },
  };
}

async function createS3Fixture(): Promise<StorageFixture> {
  const cfg = s3DocumentsConfig();
  const s3Ops = new InMemoryDocumentPrivateS3Operations();
  const storage = new S3PrivateDocumentStorageService(cfg, s3Ops);
  return {
    storage,
    cleanup: async () => undefined,
  };
}

export function defineDocumentStorageContractTests(
  label: string,
  createFixture: () => Promise<StorageFixture>,
): void {
  describe(`DocumentStoragePort contract — ${label}`, () => {
    let fixture: StorageFixture;

    beforeEach(async () => {
      fixture = await createFixture();
    });

    afterEach(async () => {
      await fixture.cleanup();
    });

    it('generates org-scoped legal keys without client path segments', async () => {
      const res = await fixture.storage.putObject({
        organizationId: 'org-abc',
        bookingId: null,
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        originalName: '../../evil/agb.pdf',
        buffer: Buffer.from('%PDF-1.4 contract'),
        mimeType: 'application/pdf',
      });

      expect(res.objectKey).toMatch(
        /^organizations\/org-abc\/legal\/TERMS_AND_CONDITIONS\/\d{4}\/\d{2}\/[0-9a-f-]+-.*\.pdf$/,
      );
      expect(res.objectKey).not.toContain('..');
      expect(res.contentHash).toMatch(/^[a-f0-9]{64}$/);
      expect(res.sizeBytes).toBeGreaterThan(0);
    });

    it('round-trips bytes via getObject and getObjectStream', async () => {
      const payload = Buffer.from('booking-pdf-bytes');
      const put = await fixture.storage.putObject({
        organizationId: 'org-1',
        bookingId: 'bk-9',
        documentType: DOCUMENT_TYPE.BOOKING_INVOICE,
        originalName: 'invoice.pdf',
        buffer: payload,
        mimeType: 'application/pdf',
      });

      const full = await fixture.storage.getObject(put.objectKey);
      expect(full.equals(payload)).toBe(true);

      const stream = await fixture.storage.getObjectStream(put.objectKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).equals(payload)).toBe(true);
    });

    it('promotes quarantine objects to clean storage', async () => {
      const payload = Buffer.from('quarantined-legal-pdf');
      const quarantined = await fixture.storage.putQuarantineObject({
        organizationId: 'org-1',
        bookingId: null,
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        originalName: 'agb.pdf',
        buffer: payload,
        mimeType: 'application/pdf',
      });

      const promoted = await fixture.storage.promoteQuarantineToClean({
        quarantineObjectKey: quarantined.objectKey,
        organizationId: 'org-1',
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        originalName: 'agb.pdf',
        mimeType: 'application/pdf',
      });

      expect(promoted.objectKey).toMatch(/^organizations\/org-1\/legal\//);
      expect(promoted.contentHash).toBe(quarantined.contentHash);
      const clean = await fixture.storage.getObject(promoted.objectKey);
      expect(clean.equals(payload)).toBe(true);
    });

    it('exposes metadata with content hash', async () => {
      const put = await fixture.storage.putObject({
        organizationId: 'org-1',
        bookingId: null,
        documentType: DOCUMENT_TYPE.TERMS_AND_CONDITIONS,
        originalName: 'meta.pdf',
        buffer: Buffer.from('meta-test'),
        mimeType: 'application/pdf',
      });

      if (!fixture.storage.getObjectMetadata) {
        return;
      }
      const meta = await fixture.storage.getObjectMetadata(put.objectKey);
      expect(meta.contentHash).toBe(put.contentHash);
      expect(meta.sizeBytes).toBe(put.sizeBytes);
    });

    it('rejects unsafe object keys on read', async () => {
      await expect(fixture.storage.getObject('../escape.pdf')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('deleteObject is best-effort for missing keys', async () => {
      await expect(
        fixture.storage.deleteObject('organizations/org-1/legal/x/2026/01/missing.pdf'),
      ).resolves.toBeUndefined();
    });

    it('checkHealth reports healthy storage', async () => {
      const health = await fixture.storage.checkHealth();
      expect(health.healthy).toBe(true);
      expect(health.provider).toBe(fixture.storage.provider);
    });
  });
}

defineDocumentStorageContractTests('local adapter', createLocalFixture);
defineDocumentStorageContractTests('s3 adapter (in-memory)', createS3Fixture);
