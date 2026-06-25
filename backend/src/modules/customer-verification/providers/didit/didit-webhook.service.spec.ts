import { DiditWebhookService } from './didit-webhook.service';
import { DiditSignatureService } from './didit-signature.service';
import { CustomerVerificationService } from '../../customer-verification.service';

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('DiditWebhookService', () => {
  const prisma = {
    diditWebhookEvent: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    customerVerificationCheck: {
      findFirst: jest.fn(),
    },
  };

  const signatureService = {
    verifyWebhook: jest.fn(),
  } as unknown as DiditSignatureService;

  const verificationService = {
    applyDiditDecision: jest.fn(),
  } as unknown as CustomerVerificationService;

  let service: DiditWebhookService;

  const baseCheck = {
    id: 'check-1',
    organizationId: 'org-1',
    customerId: 'cust-1',
    kind: 'ID_DOCUMENT',
    vendorData: 'org:org-1|customer:cust-1|booking:none|kind:ID_DOCUMENT|nonce:n1',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiditWebhookService(
      prisma as never,
      signatureService,
      verificationService,
    );
    (prisma.diditWebhookEvent.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.diditWebhookEvent.create as jest.Mock).mockResolvedValue({
      id: 'evt-1',
    });
    (prisma.diditWebhookEvent.update as jest.Mock).mockResolvedValue({});
    (prisma.customerVerificationCheck.findFirst as jest.Mock).mockResolvedValue(
      baseCheck,
    );
    (verificationService.applyDiditDecision as jest.Mock).mockResolvedValue({});
  });

  function mockVerifiedPayload(
    overrides: Record<string, unknown> = {},
  ): { raw: Buffer; headers: Record<string, string> } {
    const payload = {
      event_id: 'evt-didit-1',
      webhook_type: 'status.updated',
      session_id: 'sess-abc',
      status: 'Approved',
      workflow_id: 'wf-1',
      vendor_data: baseCheck.vendorData,
      decision: {
        id_verifications: [{ first_name: 'Max', last_name: 'Mustermann' }],
      },
      ...overrides,
    };
    (signatureService.verifyWebhook as jest.Mock).mockReturnValue({
      body: payload,
      payloadHash: 'hash-abc123',
    });
    return {
      raw: Buffer.from(JSON.stringify(payload)),
      headers: {
        'x-signature-v2': 'sig',
        'x-timestamp': String(Math.floor(Date.now() / 1000)),
      },
    };
  }

  it('returns duplicate when event_id already exists', async () => {
    (prisma.diditWebhookEvent.findUnique as jest.Mock).mockImplementation(
      async ({ where }: { where: { eventId?: string; payloadHash?: string } }) => {
        if (where.eventId === 'evt-didit-1') return { id: 'existing' };
        return null;
      },
    );
    const { raw, headers } = mockVerifiedPayload();
    const result = await service.receiveWebhook(raw, headers);
    expect(result).toEqual({ received: true, duplicate: true });
    expect(prisma.diditWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('returns duplicate when payloadHash already exists', async () => {
    (prisma.diditWebhookEvent.findUnique as jest.Mock).mockImplementation(
      async ({ where }: { where: { eventId?: string; payloadHash?: string } }) => {
        if (where.payloadHash === 'hash-abc123') return { id: 'existing' };
        return null;
      },
    );
    const { raw, headers } = mockVerifiedPayload();
    const result = await service.receiveWebhook(raw, headers);
    expect(result).toEqual({ received: true, duplicate: true });
  });

  it('Approved updates check via applyDiditDecision and syncs read model', async () => {
    const { raw, headers } = mockVerifiedPayload({ status: 'Approved' });
    await service.receiveWebhook(raw, headers);
    await flushAsync();

    expect(verificationService.applyDiditDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'sess-abc',
        normalizedDecision: expect.objectContaining({
          status: 'VERIFIED',
          providerStatus: 'Approved',
        }),
      }),
    );
    expect(prisma.diditWebhookEvent.update).toHaveBeenCalled();
  });

  it('Declined sets REJECTED', async () => {
    const { raw, headers } = mockVerifiedPayload({ status: 'Declined' });
    await service.receiveWebhook(raw, headers);
    await flushAsync();

    expect(verificationService.applyDiditDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedDecision: expect.objectContaining({ status: 'REJECTED' }),
      }),
    );
  });

  it('In Review sets REQUIRES_REVIEW', async () => {
    const { raw, headers } = mockVerifiedPayload({ status: 'In Review' });
    await service.receiveWebhook(raw, headers);
    await flushAsync();

    expect(verificationService.applyDiditDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedDecision: expect.objectContaining({ status: 'REQUIRES_REVIEW' }),
      }),
    );
  });

  it('data.updated passes decisionJson and extractedJson', async () => {
    const { raw, headers } = mockVerifiedPayload({
      webhook_type: 'data.updated',
      status: 'In Progress',
      decision: {
        id_verifications: [
          {
            first_name: 'Anna',
            last_name: 'Test',
            expiration_date: '2031-05-01',
          },
        ],
        liveness_checks: [{ status: 'pass' }],
        face_matches: [{ score: 0.99 }],
      },
    });
    await service.receiveWebhook(raw, headers);
    await flushAsync();

    const call = (verificationService.applyDiditDecision as jest.Mock).mock
      .calls[0][0];
    expect(call.normalizedDecision.decisionJson).toBeDefined();
    expect(call.normalizedDecision.extractedJson).toEqual(
      expect.objectContaining({ first_name: 'Anna', last_name: 'Test' }),
    );
    const warnings = call.normalizedDecision.warnings as Array<{ message: string }>;
    expect(warnings.some((w) => w.message.includes('biometric'))).toBe(true);
    expect(call.normalizedDecision.status).toBe('IN_PROGRESS');
  });
});
