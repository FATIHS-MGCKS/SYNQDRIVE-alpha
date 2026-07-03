import { ConfigService } from '@nestjs/config';
import { TwoFactorCredentialType } from '@prisma/client';
import { authenticator } from 'otplib';
import { MfaLoginService } from './mfa-login.service';
import { PrismaService } from '@shared/database/prisma.service';
import { AccountTwoFactorService } from '@modules/account/two-factor/account-two-factor.service';
import { RefreshTokenService } from './refresh-token.service';
import { AuditService } from '@modules/activity-log/audit.service';
import { SecretEncryptionService } from '@shared/crypto/secret-encryption.service';
import { generateOpaqueToken, hashOpaqueToken, hashRecoveryCode } from '@modules/account/two-factor/two-factor-crypto.util';

const TEST_KEY = Buffer.alloc(32, 3);

describe('MfaLoginService', () => {
  const userId = 'user-1';
  const secret = authenticator.generateSecret();
  const challengeToken = generateOpaqueToken();

  const prisma = {
    userMfaLoginChallenge: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  const encryption = new SecretEncryptionService({
    get: () => TEST_KEY,
  } as unknown as ConfigService);

  const twoFactor = new AccountTwoFactorService(
    {
      userTwoFactorCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'cred-1',
          userId,
          type: TwoFactorCredentialType.TOTP,
          secretEncrypted: encryption.encrypt(secret),
          enabledAt: new Date(),
        }),
        update: jest.fn(),
      },
      userRecoveryCode: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    } as unknown as PrismaService,
    encryption,
    { get: (_key: string, fallback?: unknown) => fallback } as ConfigService,
    { record: jest.fn(), warn: jest.fn() } as unknown as AuditService,
  );

  const refreshTokens = {
    issueTokenPair: jest.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      expiresIn: '24h',
    }),
  } as unknown as RefreshTokenService;

  const config = {
    get: (key: string, fallback?: unknown) => {
      if (key === 'security.mfaChallengeTtlSeconds') return 300;
      if (key === 'security.mfaMaxAttempts') return 5;
      return fallback;
    },
  } as ConfigService;

  const audit = { record: jest.fn(), warn: jest.fn() } as unknown as AuditService;

  const service = new MfaLoginService(prisma, twoFactor, refreshTokens, config, audit);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('createChallengeIfRequired returns mfaRequired when 2FA enabled', async () => {
    jest.spyOn(twoFactor, 'isEnabled').mockResolvedValue(true);
    (prisma.userMfaLoginChallenge.create as jest.Mock).mockResolvedValue({ id: 'ch-1' });

    const result = await service.createChallengeIfRequired(userId);

    expect(result).toEqual(
      expect.objectContaining({
        mfaRequired: true,
        mfaChallengeToken: expect.any(String),
        expiresIn: 300,
      }),
    );
    expect(prisma.userMfaLoginChallenge.create).toHaveBeenCalled();
  });

  it('verifyChallengeAndIssueTokens returns tokens for valid TOTP', async () => {
    const code = authenticator.generate(secret);
    (prisma.userMfaLoginChallenge.findUnique as jest.Mock).mockResolvedValue({
      id: 'ch-1',
      userId,
      tokenHash: hashOpaqueToken(challengeToken),
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
      consumedAt: null,
      user: {
        id: userId,
        email: 'user@example.com',
        name: 'User',
        platformRole: 'USER',
        mustChangePassword: false,
        memberships: [],
      },
    });
    (prisma.userMfaLoginChallenge.update as jest.Mock).mockResolvedValue({});
    (prisma.user.update as jest.Mock).mockResolvedValue({});

    const result = await service.verifyChallengeAndIssueTokens(
      { mfaChallengeToken: challengeToken, totpCode: code },
      {},
    );

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(refreshTokens.issueTokenPair).toHaveBeenCalled();
  });

  it('recovery code works only once', async () => {
    const plainCode = 'ABCD-EFGH';
    const codeHash = await hashRecoveryCode(plainCode);

    (prisma.userMfaLoginChallenge.findUnique as jest.Mock).mockResolvedValue({
      id: 'ch-1',
      userId,
      tokenHash: hashOpaqueToken(challengeToken),
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
      consumedAt: null,
      user: {
        id: userId,
        email: 'user@example.com',
        name: 'User',
        platformRole: 'USER',
        mustChangePassword: false,
        memberships: [],
      },
    });
    (prisma.userMfaLoginChallenge.update as jest.Mock).mockResolvedValue({});
    (prisma.user.update as jest.Mock).mockResolvedValue({});

    const recoveryPrisma = (twoFactor as unknown as { prisma: PrismaService }).prisma;
    (recoveryPrisma.userRecoveryCode.findMany as jest.Mock).mockResolvedValue([
      { id: 'rc-1', userId, codeHash, usedAt: null, createdAt: new Date() },
    ]);
    (recoveryPrisma.userRecoveryCode.update as jest.Mock).mockResolvedValue({});

    const result = await service.verifyChallengeAndIssueTokens(
      { mfaChallengeToken: challengeToken, recoveryCode: plainCode },
      {},
    );

    expect(result.accessToken).toBe('access-token');
    expect(recoveryPrisma.userRecoveryCode.update).toHaveBeenCalledWith({
      where: { id: 'rc-1' },
      data: { usedAt: expect.any(Date) },
    });
  });
});
