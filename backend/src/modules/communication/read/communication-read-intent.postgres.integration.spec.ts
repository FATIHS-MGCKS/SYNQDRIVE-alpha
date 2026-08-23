import { Test } from '@nestjs/testing';
import { CommunicationChannel, PrismaClient } from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationReadRepository } from '../read/communication-read.repository';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication intent filter postgres (C9.1)', () => {
  let prisma: PrismaClient;
  let repository: CommunicationReadRepository;
  let orgId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, CommunicationReadRepository],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    repository = moduleRef.get(CommunicationReadRepository);
  });

  beforeEach(async () => {
    const org = await prisma.organization.create({
      data: { companyName: `C91 Intent ${Date.now()}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgId = org.id;
  });

  afterEach(async () => {
    await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.whatsAppConversation.deleteMany({ where: { organizationId: orgId } });
    await prisma.customer.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seed(intent: string | null, withCustomer = false) {
    let customerId: string | null = null;
    if (withCustomer) {
      const customer = await prisma.customer.create({
        data: {
          organizationId: orgId,
          firstName: 'Test',
          lastName: 'Customer',
          status: 'ACTIVE',
        },
      });
      customerId = customer.id;
    }

    const wa = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgId,
        contactPhone: `+4917${Math.floor(Math.random() * 1e8)}`,
        contactPhoneNormalized: `${Date.now()}${Math.random()}`,
        lastDetectedIntent: intent,
        customerId,
      },
    });
    await prisma.communicationConversation.create({
      data: {
        organizationId: orgId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: wa.id,
        customerId,
        unreadCount: intent === 'PAYMENT' ? 2 : 0,
        lastActivityAt: new Date(),
      },
    });
  }

  it('filters payment intent', async () => {
    await seed('PAYMENT');
    await seed('GENERAL');
    const page = await repository.listConversations(orgId, { intent: 'payment' });
    expect(page.items).toHaveLength(1);
  });

  it('filters unknown_customer via canonical customerId', async () => {
    await seed('GENERAL', false);
    await seed('GENERAL', true);
    const page = await repository.listConversations(orgId, { intent: 'unknown_customer' });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.customerId).toBeNull();
  });
});
