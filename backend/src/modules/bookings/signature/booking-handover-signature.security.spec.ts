import { NotFoundException } from '@nestjs/common';
import { BookingHandoverSignatureService } from './booking-handover-signature.service';
import { createHash } from 'crypto';

describe('BookingHandoverSignatureService security', () => {
  const storage = {
    provider: 'local',
    putObject: jest.fn(),
    getObject: jest.fn(),
    getObjectStream: jest.fn(),
  };

  const prisma = {
    bookingHandoverSignature: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    bookingHandoverSignatureAccessToken: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const svc = new BookingHandoverSignatureService(prisma as never, storage as never);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('createViewUrl scopes signature to org and booking', async () => {
    prisma.bookingHandoverSignature.findFirst.mockResolvedValue({
      id: 'sig-1',
      objectKey: 'organizations/org-1/bookings/bk-1/HANDOVER_SIGNATURE_CUSTOMER/2026/07/file.png',
      mimeType: 'image/png',
    });
    prisma.bookingHandoverSignatureAccessToken.create.mockResolvedValue({ id: 'tok-1' });

    const result = await svc.createViewUrl('org-1', 'bk-1', 'sig-1', 'user-1');

    expect(prisma.bookingHandoverSignature.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          bookingId: 'bk-1',
          id: 'sig-1',
        }),
      }),
    );
    expect(result.viewUrl).toMatch(/\/api\/v1\/booking-signature-access\//);
    expect(result.expiresAt).toBeTruthy();
  });

  it('rejects cross-tenant token access when signature org mismatches', async () => {
    const rawToken = 'opaque-token-value';
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    prisma.bookingHandoverSignatureAccessToken.findFirst.mockResolvedValue({
      id: 'access-1',
      organizationId: 'org-a',
      expiresAt: new Date(Date.now() + 60_000),
      signature: {
        id: 'sig-1',
        organizationId: 'org-b',
        deletedAt: null,
        objectKey: 'k',
        mimeType: 'image/png',
        contentHash: 'abc',
        sizeBytes: 1,
      },
    });

    await expect(
      svc.streamByAccessToken(rawToken, { setHeader: jest.fn(), pipe: jest.fn() } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tokenHash).toBeTruthy();
  });

  it('rejects expired view tokens', async () => {
    prisma.bookingHandoverSignatureAccessToken.findFirst.mockResolvedValue({
      id: 'access-1',
      organizationId: 'org-a',
      expiresAt: new Date(Date.now() - 60_000),
      signature: {
        id: 'sig-1',
        organizationId: 'org-a',
        deletedAt: null,
        objectKey: 'k',
        mimeType: 'image/png',
        contentHash: 'abc',
        sizeBytes: 1,
      },
    });

    await expect(
      svc.streamByAccessToken('expired', { setHeader: jest.fn(), pipe: jest.fn() } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('summariesForProtocolIds never returns embedded image data', async () => {
    prisma.bookingHandoverSignature.findMany.mockResolvedValue([
      {
        id: 'sig-c',
        protocolId: 'proto-1',
        role: 'CUSTOMER',
        signedAt: new Date('2026-07-23T10:00:00.000Z'),
      },
    ]);

    const map = await svc.summariesForProtocolIds('org-1', ['proto-1']);
    const entry = map.get('proto-1');
    expect(entry?.customer).toEqual({
      signaturePresent: true,
      signedAt: '2026-07-23T10:00:00.000Z',
      signatureReferenceId: 'sig-c',
    });
    expect(JSON.stringify(entry)).not.toMatch(/base64|data:image/i);
  });
});
