import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { LocalDocumentStorageService } from './local-document-storage.service';

/** Minimal ConfigService stub returning a fixed base dir. */
function makeConfig(baseDir: string) {
  return {
    get: <T>(_key: string, _def?: T): T => baseDir as unknown as T,
  } as any;
}

describe('LocalDocumentStorageService (object-key safety)', () => {
  let baseDir: string;
  let svc: LocalDocumentStorageService;

  beforeAll(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'synq-doc-store-'));
    svc = new LocalDocumentStorageService(makeConfig(baseDir));
  });

  afterAll(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('stores under a structured org/vehicle key and round-trips the bytes', async () => {
    const buffer = Buffer.from('hello world', 'utf8');
    const result = await svc.putObject({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      originalName: 'invoice.pdf',
      buffer,
      mimeType: 'application/pdf',
    });

    expect(result.storageProvider).toBe('local');
    expect(result.sizeBytes).toBe(buffer.length);
    expect(result.objectKey).toMatch(
      /^organizations\/org-1\/vehicles\/veh-1\/documents\/\d{4}\/\d{2}\/[0-9a-f-]{36}-invoice\.pdf$/,
    );

    const readBack = await svc.getObject(result.objectKey);
    expect(readBack.toString('utf8')).toBe('hello world');
  });

  it('never lets a malicious original filename escape the base directory', async () => {
    const result = await svc.putObject({
      organizationId: 'org-1',
      vehicleId: 'veh-1',
      originalName: '../../../../etc/passwd',
      buffer: Buffer.from('x'),
      mimeType: 'text/plain',
    });
    // The untrusted name only contributes a sanitised suffix — no traversal, no slashes.
    expect(result.objectKey).not.toContain('..');
    const suffix = result.objectKey.split('/').pop() ?? '';
    expect(suffix).not.toContain('etc');
    // Resolved path must stay inside the base dir.
    const abs = svc.getInternalPath(result.objectKey);
    expect(abs?.startsWith(baseDir)).toBe(true);
  });

  it('sanitises unsafe characters out of org/vehicle id segments', async () => {
    const result = await svc.putObject({
      organizationId: '../evil',
      vehicleId: 'a/b',
      originalName: 'doc.txt',
      buffer: Buffer.from('x'),
      mimeType: 'text/plain',
    });
    // safeSegment() runs basename() (drops anything before a separator) then
    // strips non-[a-zA-Z0-9_-] chars → no traversal can survive.
    expect(result.objectKey).not.toContain('..');
    expect(result.objectKey).toMatch(
      /^organizations\/evil\/vehicles\/b\/documents\/\d{4}\/\d{2}\//,
    );
    expect(svc.getInternalPath(result.objectKey)?.startsWith(baseDir)).toBe(true);
  });

  it('rejects path-traversal keys on read', async () => {
    await expect(svc.getObject('../../secret')).rejects.toThrow();
    await expect(svc.getObject('organizations/../../escape')).rejects.toThrow();
  });

  it('rejects drive-letter and empty keys, and contains leading-slash keys', () => {
    // Drive-letter and empty keys are rejected outright.
    expect(() => svc.getInternalPath('C:/Windows/system32')).toThrow();
    expect(() => svc.getInternalPath('')).toThrow();
    // A leading-slash "absolute" key is neutralised (slash stripped) and stays
    // safely contained inside the private base dir rather than escaping it.
    const contained = svc.getInternalPath('/etc/passwd');
    expect(contained?.startsWith(baseDir)).toBe(true);
  });

  it('deleteObject is best-effort and never throws for a missing/invalid key', async () => {
    await expect(svc.deleteObject('does/not/exist')).resolves.toBeUndefined();
    await expect(svc.deleteObject('../../traversal')).resolves.toBeUndefined();
  });
});
