import { ConfigService } from '@nestjs/config';
import { TwoFactorCredentialType } from '@prisma/client';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';
import { SecretEncryptionService } from '@shared/crypto/secret-encryption.service';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normalizeRecoveryCode,
  verifyRecoveryCode,
} from './two-factor-crypto.util';
import { AccountTwoFactorService } from './account-two-factor.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AuditService } from '@modules/activity-log/audit.service';

const TEST_KEY = Buffer.alloc(32, 9);

describe('two-factor crypto utils', () => {
  it('hashes and verifies recovery codes without storing plaintext', async () => {
    const plain = generateRecoveryCode();
    const hash = await hashRecoveryCode(plain);
    expect(hash).not.toContain(normalizeRecoveryCode(plain));
    await expect(verifyRecoveryCode(plain, hash)).resolves.toBe(true);
    await expect(verifyRecoveryCode('AAAA-BBBB', hash)).resolves.toBe(false);
  });
});

describe('SecretEncryptionService', () => {
  const encryption = new SecretEncryptionService({
    get: () => TEST_KEY,
  } as unknown as ConfigService);

  it('encrypts and decrypts secrets without storing plaintext ciphertext reversibly in logs', () => {
    const secret = authenticator.generateSecret();
    const encrypted = encryption.encrypt(secret);
    expect(encrypted).not.toBe(secret);
    expect(encryption.decrypt(encrypted)).toBe(secret);
  });
});

describe('AccountTwoFactorService', () => {
  const userId = 'user-1';
  const email = 'user@example.com';
  let secret = authenticator.generateSecret();

  const prisma = {
    userTwoFactorCredential: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    userRecoveryCode: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService;

  const encryption = new SecretEncryptionService({
    get: () => TEST_KEY,
  } as unknown as ConfigService);

  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'security.totpIssuer') return 'SynqDrive';
      if (key === 'security.recoveryCodeCount') return 3;
      return fallback;
    },
  } as ConfigService;

  const audit = { record: jest.fn(), warn: jest.fn() } as unknown as AuditService;

  const service = new AccountTwoFactorService(prisma, encryption, config, audit);

  beforeEach(() => {
    jest.clearAllMocks();
    secret = authenticator.generateSecret();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: typeof prisma) => unknown) =>
      fn(prisma),
    );
  });

  it('setup creates encrypted secret without enabling 2FA', async () => {
    (prisma.userTwoFactorCredential.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.userTwoFactorCredential.upsert as jest.Mock).mockImplementation(async ({ create, update }) => ({
      id: 'cred-1',
      ...(create ?? update),
      enabledAt: null,
    }));

    const result = await service.setupTotp(userId, email, {});

    expect(result.otpauthUrl).toContain('otpauth://totp/');
    expect(prisma.userTwoFactorCredential.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          secretEncrypted: expect.not.stringContaining(secret),
        }),
      }),
    );
  });

  it('verify with wrong code fails', async () => {
    (prisma.userTwoFactorCredential.findUnique as jest.Mock).mockResolvedValue({
      id: 'cred-1',
      userId,
      type: TwoFactorCredentialType.TOTP,
      secretEncrypted: encryption.encrypt(secret),
      enabledAt: null,
    });

    await expect(service.verifyAndEnableTotp(userId, '000000', {})).rejects.toThrow(/Invalid TOTP code/);
  });

  it('verify with correct code enables 2FA and returns recovery codes once', async () => {
    (prisma.userTwoFactorCredential.findUnique as jest.Mock).mockResolvedValue({
      id: 'cred-1',
      userId,
      type: TwoFactorCredentialType.TOTP,
      secretEncrypted: encryption.encrypt(secret),
      enabledAt: null,
    });
    (prisma.userRecoveryCode.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.userRecoveryCode.createMany as jest.Mock).mockResolvedValue({ count: 3 });
    (prisma.userTwoFactorCredential.update as jest.Mock).mockResolvedValue({});

    const code = authenticator.generate(secret);
    const result = await service.verifyAndEnableTotp(userId, code, {});

    expect(result.enabled).toBe(true);
    expect(result.recoveryCodes).toHaveLength(3);
    expect(prisma.userRecoveryCode.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          userId,
          codeHash: expect.not.stringMatching(/^[A-Z0-9-]+$/),
        }),
      ]),
    });
  });

  it('disable removes credential and recovery codes', async () => {
    (prisma.userTwoFactorCredential.findUnique as jest.Mock).mockResolvedValue({
      id: 'cred-1',
      userId,
      type: TwoFactorCredentialType.TOTP,
      secretEncrypted: encryption.encrypt(secret),
      enabledAt: new Date(),
    });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId,
      passwordHash: await bcrypt.hash('password1234', 4),
    });
    (prisma.userTwoFactorCredential.delete as jest.Mock).mockResolvedValue({});
    (prisma.userRecoveryCode.deleteMany as jest.Mock).mockResolvedValue({ count: 2 });
    (prisma.$transaction as jest.Mock).mockImplementation(async (ops: Promise<unknown>[]) =>
      Promise.all(ops),
    );

    const result = await service.disableTotp(
      userId,
      { currentPassword: 'password1234' },
      {},
    );

    expect(result.disabled).toBe(true);
    expect(prisma.userTwoFactorCredential.delete).toHaveBeenCalled();
    expect(prisma.userRecoveryCode.deleteMany).toHaveBeenCalledWith({ where: { userId } });
  });

  it('recovery codes are stored hashed only', async () => {
    const plain = generateRecoveryCode();
    const hash = await hashRecoveryCode(plain);
    expect(hash.startsWith('$2')).toBe(true);
    expect(hash).not.toContain(plain.replace('-', ''));
  });
});
