import { PrismaClient } from '@prisma/client';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createPhaseAProductionPrismaClientV1,
  throwPhaseAProductionPrismaClientConfigurationErrorV1,
} from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-prisma-client.v1';
import { buildPhaseAProductionVerifyFullDatabaseUrlV1 } from './m3-3-hv-h4-a3-3-o2-r4-2a-phase-a-production-tls-fixture.v1';
import {
  formatPhaseAPreflightPublicErrorV1,
  sanitizePhaseAPreflightErrorV1,
} from './m3-3-hv-h4-a3-3-o2-r4-1-phase-a-preflight.errors.v1';

describe('createPhaseAProductionPrismaClientV1', () => {
  it('throws fail-closed on weak sslmode without constructing PrismaClient', () => {
    const weakUrl =
      'postgresql://user:secret@db.example.com:5432/app?sslmode=require&sslrootcert=/tmp/ca.crt';
    const ctorSpy = jest.spyOn(PrismaClient.prototype, '$connect');

    expect(() => createPhaseAProductionPrismaClientV1(weakUrl)).toThrow(
      'PHASE_A_PRODUCTION_TLS_VERIFY_FULL_REQUIRED',
    );
    expect(ctorSpy).not.toHaveBeenCalled();
    ctorSpy.mockRestore();
  });

  it('throws when sslrootcert is missing from verify-full URL', () => {
    expect(() =>
      createPhaseAProductionPrismaClientV1(
        'postgresql://user:secret@db.example.com:5432/app?sslmode=verify-full',
      ),
    ).toThrow('PHASE_A_PRODUCTION_TLS_SSLROOTCERT_REQUIRED');
  });

  it('throws when sslrootcert file cannot be read', () => {
    const url = buildPhaseAProductionVerifyFullDatabaseUrlV1({
      host: 'db.example.com',
      port: 5432,
      user: 'audit',
      password: 'secret',
      database: 'app',
      sslrootcertPath: '/nonexistent/phase-a-ca.crt',
    });
    expect(() => createPhaseAProductionPrismaClientV1(url)).toThrow(
      'PHASE_A_PRODUCTION_TLS_SSLROOTCERT_UNREADABLE',
    );
  });

  it('uses pg adapter path when TLS policy and CA file are valid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'phase-a-ca-'));
    const caPath = join(dir, 'ca.crt');
    writeFileSync(caPath, '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n');
    const url = buildPhaseAProductionVerifyFullDatabaseUrlV1({
      host: 'localhost',
      port: 5433,
      user: 'audit',
      password: 'secret',
      database: 'app',
      sslrootcertPath: caPath,
    });

    const client = createPhaseAProductionPrismaClientV1(url);
    expect(client).toBeInstanceOf(PrismaClient);
    void client.$disconnect().catch(() => undefined);
  });

  it('maps configuration errors through runner sanitization without leaking secrets', () => {
    try {
      throwPhaseAProductionPrismaClientConfigurationErrorV1(
        'PHASE_A_PRODUCTION_TLS_VERIFY_FULL_REQUIRED',
      );
    } catch (error) {
      const formatted = formatPhaseAPreflightPublicErrorV1(sanitizePhaseAPreflightErrorV1(error));
      expect(formatted).toBe('PHASE_A_PRODUCTION_TLS_VERIFY_FULL_REQUIRED');
      expect(formatted).not.toContain('postgresql://');
    }
  });
});
