import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import {
  BookingStatus,
  CommunicationChannel,
  CommunicationConversationStatus,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationTenantContextValidation } from '../communication-tenant-context.validation';
import { CommunicationReadRepository } from '../read/communication-read.repository';
import { CommunicationWriteScopeService } from '../write/communication-write-scope.service';
import { CommunicationContextLinkService } from './communication-context-link.service';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

const C13_FORCED_NATIVE_FAILURE = 'C13_TEST_FORCED_NATIVE_FAILURE';

function installForcedNativeUpdateFailure(prismaClient: PrismaClient) {
  const originalTransaction = prismaClient.$transaction.bind(prismaClient);
  let canonicalUpdateReached = false;

  const transactionSpy = jest
    .spyOn(prismaClient, '$transaction')
    .mockImplementation((fn, options) => {
      if (typeof fn !== 'function') {
        return originalTransaction(fn, options);
      }

      return originalTransaction(async (tx) => {
        const originalCanonicalUpdate = tx.communicationConversation.update.bind(
          tx.communicationConversation,
        );

        jest.spyOn(tx.communicationConversation, 'update').mockImplementation((args) => {
          canonicalUpdateReached = true;
          return originalCanonicalUpdate(args);
        });

        jest.spyOn(tx.whatsAppConversation, 'update').mockImplementation(() => {
          throw new Error(C13_FORCED_NATIVE_FAILURE);
        });

        return fn(tx);
      }, options);
    });

  return {
    transactionSpy,
    wasCanonicalUpdateReached: () => canonicalUpdateReached,
    restore: () => transactionSpy.mockRestore(),
  };
}

describePg('Communication link_vehicle canonical authority postgres (C13.0)', () => {
  let prisma: PrismaClient;
  let linkService: CommunicationContextLinkService;
  let readRepository: CommunicationReadRepository;

  let orgA: string;
  let orgB: string;
  let actorUserId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        CommunicationTenantContextValidation,
        CommunicationReadRepository,
        {
          provide: CommunicationWriteScopeService,
          useValue: { assertConversationMutable: jest.fn() },
        },
        CommunicationContextLinkService,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    linkService = moduleRef.get(CommunicationContextLinkService);
    readRepository = moduleRef.get(CommunicationReadRepository);
  });

  beforeEach(async () => {
    const ts = Date.now();
    const orgRowA = await prisma.organization.create({
      data: { companyName: `C130 A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const orgRowB = await prisma.organization.create({
      data: { companyName: `C130 B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgA = orgRowA.id;
    orgB = orgRowB.id;

    const user = await prisma.user.create({
      data: {
        email: `c130-actor-${ts}@example.com`,
        status: 'ACTIVE',
      },
    });
    actorUserId = user.id;
    await prisma.organizationMembership.create({
      data: {
        organizationId: orgA,
        userId: actorUserId,
        role: 'WORKER',
        status: 'ACTIVE',
        permissions: { communication: { read: true, write: true, manage: false } },
      },
    });
  });

  afterEach(async () => {
    for (const orgId of [orgA, orgB]) {
      await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.whatsAppConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.booking.deleteMany({ where: { organizationId: orgId } });
      await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
      await prisma.customer.deleteMany({ where: { organizationId: orgId } });
      await prisma.organizationMembership.deleteMany({ where: { organizationId: orgId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
    await prisma.user.deleteMany({ where: { id: actorUserId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createVehicle(orgId: string, suffix: string) {
    return prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `VIN-C130-${suffix}-${Date.now()}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: 'ELECTRIC',
        licensePlate: `C130-${suffix}-${Date.now()}`,
        status: 'AVAILABLE',
      },
    });
  }

  async function createBooking(orgId: string, vehicleId: string) {
    const customer = await prisma.customer.create({
      data: {
        organizationId: orgId,
        firstName: 'Test',
        lastName: 'Customer',
        status: 'ACTIVE',
      },
    });
    return prisma.booking.create({
      data: {
        organizationId: orgId,
        customerId: customer.id,
        vehicleId,
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: new Date('2026-08-25T00:00:00Z'),
        status: BookingStatus.ACTIVE,
      },
    });
  }

  async function seedConversationPair(options: {
    orgId: string;
    bookingId: string;
    canonicalVehicleId?: string | null;
    nativeVehicleId?: string | null;
  }) {
    const wa = await prisma.whatsAppConversation.create({
      data: {
        organizationId: options.orgId,
        contactPhone: `+4917${Math.floor(Math.random() * 1e8)}`,
        contactPhoneNormalized: `${Date.now()}${Math.random()}`,
        bookingId: options.bookingId,
        vehicleId: options.nativeVehicleId ?? null,
      },
    });
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: options.orgId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: wa.id,
        status: CommunicationConversationStatus.AI_ACTIVE,
        bookingId: options.bookingId,
        vehicleId: options.canonicalVehicleId ?? null,
        unreadCount: 0,
        lastActivityAt: new Date(),
      },
    });
    return { wa, canonical };
  }

  it('converges canonical and native vehicleId from booking authority', async () => {
    const vehicle = await createVehicle(orgA, 'conv');
    const booking = await createBooking(orgA, vehicle.id);
    const { wa, canonical } = await seedConversationPair({
      orgId: orgA,
      bookingId: booking.id,
    });

    const result = await linkService.linkVehicleFromBooking({
      organizationId: orgA,
      canonicalConversationId: canonical.id,
      nativeConversationId: wa.id,
      actorUserId,
    });

    expect(result.changed).toBe(true);
    expect(result.vehicleId).toBe(vehicle.id);
    expect(result.conversation.vehicle?.id).toBe(vehicle.id);

    const [canonicalRow, nativeRow] = await Promise.all([
      prisma.communicationConversation.findUnique({ where: { id: canonical.id } }),
      prisma.whatsAppConversation.findUnique({ where: { id: wa.id } }),
    ]);
    expect(canonicalRow?.vehicleId).toBe(vehicle.id);
    expect(nativeRow?.vehicleId).toBe(vehicle.id);

    const readRow = await readRepository.findConversationById(orgA, canonical.id);
    expect(readRow?.vehicleId).toBe(vehicle.id);
  });

  it('rejects cross-tenant booking/vehicle linkage', async () => {
    const vehicleB = await createVehicle(orgB, 'tenant');
    const bookingB = await createBooking(orgB, vehicleB.id);
    const vehicleA = await createVehicle(orgA, 'tenant-a');
    const bookingA = await createBooking(orgA, vehicleA.id);
    const { wa, canonical } = await seedConversationPair({
      orgId: orgA,
      bookingId: bookingA.id,
    });

    await prisma.whatsAppConversation.update({
      where: { id: wa.id },
      data: { bookingId: bookingB.id },
    });

    await expect(
      linkService.linkVehicleFromBooking({
        organizationId: orgA,
        canonicalConversationId: canonical.id,
        nativeConversationId: wa.id,
        actorUserId,
      }),
    ).rejects.toThrow();

    const [canonicalRow, nativeRow] = await Promise.all([
      prisma.communicationConversation.findUnique({ where: { id: canonical.id } }),
      prisma.whatsAppConversation.findUnique({ where: { id: wa.id } }),
    ]);
    expect(canonicalRow?.vehicleId).toBeNull();
    expect(nativeRow?.vehicleId).toBeNull();
  });

  it('replays safely without duplicate mutation', async () => {
    const vehicle = await createVehicle(orgA, 'replay');
    const booking = await createBooking(orgA, vehicle.id);
    const { wa, canonical } = await seedConversationPair({
      orgId: orgA,
      bookingId: booking.id,
    });

    const first = await linkService.linkVehicleFromBooking({
      organizationId: orgA,
      canonicalConversationId: canonical.id,
      nativeConversationId: wa.id,
      actorUserId,
    });
    const second = await linkService.linkVehicleFromBooking({
      organizationId: orgA,
      canonicalConversationId: canonical.id,
      nativeConversationId: wa.id,
      actorUserId,
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.vehicleId).toBe(vehicle.id);
    expect(second.conversation.vehicle?.id).toBe(vehicle.id);
  });

  it('conflicts when canonical conversation already links a different vehicle', async () => {
    const vehicleY = await createVehicle(orgA, 'vehicle-y');
    const vehicleX = await createVehicle(orgA, 'vehicle-x');
    const booking = await createBooking(orgA, vehicleY.id);
    const { wa, canonical } = await seedConversationPair({
      orgId: orgA,
      bookingId: booking.id,
      canonicalVehicleId: vehicleX.id,
    });

    await expect(
      linkService.linkVehicleFromBooking({
        organizationId: orgA,
        canonicalConversationId: canonical.id,
        nativeConversationId: wa.id,
        actorUserId,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const [canonicalRow, nativeRow] = await Promise.all([
      prisma.communicationConversation.findUnique({ where: { id: canonical.id } }),
      prisma.whatsAppConversation.findUnique({ where: { id: wa.id } }),
    ]);
    expect(canonicalRow?.vehicleId).toBe(vehicleX.id);
    expect(nativeRow?.vehicleId).toBeNull();
  });

  it('read-after-write returns linked vehicle without background sync', async () => {
    const vehicle = await createVehicle(orgA, 'raw');
    const booking = await createBooking(orgA, vehicle.id);
    const { wa, canonical } = await seedConversationPair({
      orgId: orgA,
      bookingId: booking.id,
    });

    const result = await linkService.linkVehicleFromBooking({
      organizationId: orgA,
      canonicalConversationId: canonical.id,
      nativeConversationId: wa.id,
      actorUserId,
    });

    const immediateRead = await readRepository.findConversationById(orgA, canonical.id);
    expect(result.conversation.vehicle?.id).toBe(vehicle.id);
    expect(immediateRead?.vehicleId).toBe(vehicle.id);
  });

  it('rejects cross-org booking at precondition without entering transaction', async () => {
    const vehicleB = await createVehicle(orgB, 'atomic-b');
    const bookingB = await createBooking(orgB, vehicleB.id);
    const vehicleA = await createVehicle(orgA, 'atomic-a');
    const bookingA = await createBooking(orgA, vehicleA.id);
    const { wa, canonical } = await seedConversationPair({
      orgId: orgA,
      bookingId: bookingA.id,
    });

    await prisma.whatsAppConversation.update({
      where: { id: wa.id },
      data: { bookingId: bookingB.id },
    });

    await expect(
      linkService.linkVehicleFromBooking({
        organizationId: orgA,
        canonicalConversationId: canonical.id,
        nativeConversationId: wa.id,
        actorUserId,
      }),
    ).rejects.toThrow();

    const [canonicalRow, nativeRow] = await Promise.all([
      prisma.communicationConversation.findUnique({ where: { id: canonical.id } }),
      prisma.whatsAppConversation.findUnique({ where: { id: wa.id } }),
    ]);
    expect(canonicalRow?.vehicleId).toBeNull();
    expect(nativeRow?.vehicleId).toBeNull();
  });

  it('rolls back canonical vehicleId when native update fails inside transaction', async () => {
    const vehicle = await createVehicle(orgA, 'tx-rollback');
    const booking = await createBooking(orgA, vehicle.id);
    const { wa, canonical } = await seedConversationPair({
      orgId: orgA,
      bookingId: booking.id,
    });

    const failureInjection = installForcedNativeUpdateFailure(prisma);

    try {
      await expect(
        linkService.linkVehicleFromBooking({
          organizationId: orgA,
          canonicalConversationId: canonical.id,
          nativeConversationId: wa.id,
          actorUserId,
        }),
      ).rejects.toThrow(C13_FORCED_NATIVE_FAILURE);

      expect(failureInjection.wasCanonicalUpdateReached()).toBe(true);

      const [canonicalRow, nativeRow] = await Promise.all([
        prisma.communicationConversation.findUnique({ where: { id: canonical.id } }),
        prisma.whatsAppConversation.findUnique({ where: { id: wa.id } }),
      ]);
      expect(canonicalRow?.vehicleId).toBeNull();
      expect(nativeRow?.vehicleId).toBeNull();
    } finally {
      failureInjection.restore();
    }
  });
});
