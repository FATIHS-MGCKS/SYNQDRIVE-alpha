import { Test } from '@nestjs/testing';
import {
  BookingStatus,
  CommunicationChannel,
  CommunicationEventType,
  CommunicationProviderIdentity,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '@shared/database/prisma.service';
import { CommunicationConversationRepository } from '../communication-conversation.repository';
import { CommunicationEventRepository } from '../communication-event.repository';
import { CommunicationProjectionService } from '../communication-projection.service';
import { CommunicationTenantContextValidation } from '../communication-tenant-context.validation';
import { buildCanonicalIdempotencyKey } from '../normalization/communication-idempotency';
import type { NormalizedCommunicationInput } from '../normalization/communication-normalization.types';
import { CommunicationContextApplierService } from './communication-context-applier.service';
import {
  CommunicationContextBackfillService,
  CommunicationContextEnrichmentService,
} from './communication-context-enrichment.service';
import { CommunicationContextResolverService } from './communication-context-resolver.service';
import { CommunicationNativeContextLoader } from './communication-native-context.loader';

const databaseUrl = process.env.DATABASE_URL;
const describePg = databaseUrl ? describe : describe.skip;

describePg('Communication context resolution postgres', () => {
  let prisma: PrismaClient;
  let resolver: CommunicationContextResolverService;
  let applier: CommunicationContextApplierService;
  let enrichment: CommunicationContextEnrichmentService;
  let backfill: CommunicationContextBackfillService;
  let projection: CommunicationProjectionService;

  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();

    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        CommunicationTenantContextValidation,
        CommunicationConversationRepository,
        CommunicationEventRepository,
        CommunicationNativeContextLoader,
        CommunicationContextResolverService,
        CommunicationContextApplierService,
        CommunicationContextEnrichmentService,
        CommunicationContextBackfillService,
        CommunicationProjectionService,
      ],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    resolver = moduleRef.get(CommunicationContextResolverService);
    applier = moduleRef.get(CommunicationContextApplierService);
    enrichment = moduleRef.get(CommunicationContextEnrichmentService);
    backfill = moduleRef.get(CommunicationContextBackfillService);
    projection = moduleRef.get(CommunicationProjectionService);
  });

  beforeEach(async () => {
    const ts = Date.now();
    const orgRowA = await prisma.organization.create({
      data: { companyName: `C6 A ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    const orgRowB = await prisma.organization.create({
      data: { companyName: `C6 B ${ts}`, businessType: 'RENTAL', status: 'ACTIVE' },
    });
    orgA = orgRowA.id;
    orgB = orgRowB.id;
  });

  afterEach(async () => {
    for (const orgId of [orgA, orgB]) {
      await prisma.communicationEvent.deleteMany({ where: { organizationId: orgId } });
      await prisma.communicationConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.whatsAppConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.smsConversation.deleteMany({ where: { organizationId: orgId } });
      await prisma.booking.deleteMany({ where: { organizationId: orgId } });
      await prisma.customer.deleteMany({ where: { organizationId: orgId } });
      await prisma.vehicle.deleteMany({ where: { organizationId: orgId } });
      await prisma.station.deleteMany({ where: { organizationId: orgId } });
      await prisma.user.deleteMany({
        where: { email: { startsWith: 'outsider-' } },
      });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createCustomer(
    orgId: string,
    phoneNormalized: string,
    emailNormalized?: string,
  ) {
    return prisma.customer.create({
      data: {
        organizationId: orgId,
        firstName: 'Test',
        lastName: 'Customer',
        phone: `+${phoneNormalized}`,
        phoneNormalized,
        email: emailNormalized ? `${emailNormalized}@example.com` : undefined,
        emailNormalized: emailNormalized ?? undefined,
      },
    });
  }

  async function createVehicle(orgId: string) {
    return prisma.vehicle.create({
      data: {
        organizationId: orgId,
        vin: `VIN${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        make: 'Test',
        model: 'Car',
        year: 2024,
        fuelType: 'ELECTRIC',
        licensePlate: `C6-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        status: 'AVAILABLE',
      },
    });
  }

  async function createStation(orgId: string, code: string) {
    return prisma.station.create({
      data: {
        organizationId: orgId,
        name: `Station ${code}`,
        code,
        status: 'ACTIVE',
      },
    });
  }

  async function createCanonicalConversation(
    orgId: string,
    nativeConversationId: string,
    overrides: Record<string, string | null> = {},
  ) {
    return prisma.communicationConversation.create({
      data: {
        organizationId: orgId,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId,
        lastActivityAt: new Date('2026-08-21T10:00:00Z'),
        ...overrides,
      },
    });
  }

  it('A: native same-org customerId resolves customer', async () => {
    const customer = await createCustomer(orgA, `4917000${Date.now()}`);
    const wa = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgA,
        contactPhone: `+${customer.phoneNormalized}`,
        contactPhoneNormalized: customer.phoneNormalized!,
        customerId: customer.id,
      },
    });
    const canonical = await createCanonicalConversation(orgA, wa.id);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      nativeContext: { customerId: customer.id },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBe(customer.id);
    expect(result.resolved.customerId?.source).toBe('NATIVE_RELATION');
  });

  it('B: native cross-org customerId is rejected', async () => {
    const customerB = await createCustomer(orgB, `4917100${Date.now()}`);
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      nativeContext: { customerId: customerB.id },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBeUndefined();
    expect(result.conflicts.some((c) => c.code === 'CROSS_ORG_REFERENCE')).toBe(true);
  });

  it('C: exact phone unique same-org resolves customer', async () => {
    const phone = `4917200${Date.now()}`;
    const customer = await createCustomer(orgA, phone);
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phone },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBe(customer.id);
  });

  it('D: duplicate phone in same org stays unresolved', async () => {
    const phone = `4917300${Date.now()}`;
    await createCustomer(orgA, phone);
    await createCustomer(orgA, phone);
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phone },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBeUndefined();
    expect(result.conflicts.some((c) => c.code === 'MULTIPLE_CUSTOMERS')).toBe(true);
  });

  it('E: phone in different org does not leak', async () => {
    const phone = `4917400${Date.now()}`;
    await createCustomer(orgB, phone);
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phone },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBeUndefined();
  });

  it('F: unique email resolves customer', async () => {
    const email = `user${Date.now()}@example.com`;
    const customer = await createCustomer(orgA, `4917500${Date.now()}`, email);
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedEmail: email },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBe(customer.id);
  });

  it('G: phone and email conflict stays unresolved', async () => {
    const phone = `4917600${Date.now()}`;
    const email = `conflict${Date.now()}@example.com`;
    await createCustomer(orgA, phone);
    await createCustomer(orgA, `4917601${Date.now()}`, email);
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phone, normalizedEmail: email },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBeUndefined();
    expect(result.conflicts.some((c) => c.code === 'CONFLICTING_IDENTITIES')).toBe(true);
  });

  it('H: native bookingId same-org resolves booking', async () => {
    const customer = await createCustomer(orgA, `4917700${Date.now()}`);
    const vehicle = await createVehicle(orgA);
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgA,
        customerId: customer.id,
        vehicleId: vehicle.id,
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: new Date('2026-08-25T00:00:00Z'),
        status: BookingStatus.CONFIRMED,
      },
    });
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      nativeContext: { customerId: customer.id, bookingId: booking.id },
      existingCanonical: {},
    });

    expect(result.patch.bookingId).toBe(booking.id);
  });

  it('I: exactly one eligible booking at event time resolves booking', async () => {
    const customer = await createCustomer(orgA, `4917800${Date.now()}`);
    const vehicle = await createVehicle(orgA);
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgA,
        customerId: customer.id,
        vehicleId: vehicle.id,
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: new Date('2026-08-25T00:00:00Z'),
        status: BookingStatus.ACTIVE,
      },
    });
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      occurredAt: new Date('2026-08-21T10:00:00Z'),
      nativeContext: { customerId: customer.id },
      existingCanonical: { customerId: customer.id },
    });

    expect(result.patch.bookingId).toBe(booking.id);
  });

  it('J: overlapping eligible bookings stay unresolved', async () => {
    const customer = await createCustomer(orgA, `4917900${Date.now()}`);
    const vehicle = await createVehicle(orgA);
    await prisma.booking.createMany({
      data: [
        {
          organizationId: orgA,
          customerId: customer.id,
          vehicleId: vehicle.id,
          startDate: new Date('2026-08-20T00:00:00Z'),
          endDate: new Date('2026-08-25T00:00:00Z'),
          status: BookingStatus.ACTIVE,
        },
        {
          organizationId: orgA,
          customerId: customer.id,
          vehicleId: vehicle.id,
          startDate: new Date('2026-08-21T00:00:00Z'),
          endDate: new Date('2026-08-26T00:00:00Z'),
          status: BookingStatus.CONFIRMED,
        },
      ],
    });
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      occurredAt: new Date('2026-08-21T10:00:00Z'),
      existingCanonical: { customerId: customer.id },
    });

    expect(result.patch.bookingId).toBeUndefined();
    expect(result.conflicts.some((c) => c.code === 'MULTIPLE_BOOKINGS')).toBe(true);
  });

  it('K: booking propagates vehicle', async () => {
    const customer = await createCustomer(orgA, `4918000${Date.now()}`);
    const vehicle = await createVehicle(orgA);
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgA,
        customerId: customer.id,
        vehicleId: vehicle.id,
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: new Date('2026-08-25T00:00:00Z'),
        status: BookingStatus.ACTIVE,
      },
    });
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      nativeContext: { bookingId: booking.id, customerId: customer.id },
      existingCanonical: {},
    });

    expect(result.patch.vehicleId).toBe(vehicle.id);
  });

  it('L: ambiguous station roles stay unresolved', async () => {
    const customer = await createCustomer(orgA, `4918100${Date.now()}`);
    const vehicle = await createVehicle(orgA);
    const s1 = await createStation(orgA, `S1-${Date.now()}`);
    const s2 = await createStation(orgA, `S2-${Date.now()}`);
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgA,
        customerId: customer.id,
        vehicleId: vehicle.id,
        pickupStationId: s1.id,
        returnStationId: s2.id,
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: new Date('2026-08-25T00:00:00Z'),
        status: BookingStatus.ACTIVE,
      },
    });
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      nativeContext: { bookingId: booking.id, customerId: customer.id },
      existingCanonical: {},
    });

    expect(result.patch.stationId).toBeUndefined();
  });

  it('M: existing canonical customerId is not overwritten by weaker phone match', async () => {
    const phone = `4918200${Date.now()}`;
    const customerA = await createCustomer(orgA, phone);
    await createCustomer(orgA, `4918201${Date.now()}`);
    const canonical = await createCanonicalConversation(orgA, `wa-${Date.now()}`, {
      customerId: customerA.id,
    });

    const resolution = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phone },
      existingCanonical: { customerId: customerA.id },
    });

    const apply = await applier.applyResolvedContext({
      organizationId: orgA,
      communicationConversationId: canonical.id,
      patch: resolution.patch,
      resolved: resolution.resolved,
    });

    expect(apply.fieldsUpdated).not.toContain('customerId');
    const refreshed = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(refreshed?.customerId).toBe(customerA.id);
  });

  it('N: concurrent resolution keeps stable customer context', async () => {
    const phone = `4918300${Date.now()}`;
    const customer = await createCustomer(orgA, phone);
    const wa = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgA,
        contactPhone: `+${phone}`,
        contactPhoneNormalized: phone,
        customerId: customer.id,
      },
    });
    const canonical = await createCanonicalConversation(orgA, wa.id);

    await Promise.all([
      enrichment.enrichAfterProjection({
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: wa.id,
        communicationConversationId: canonical.id,
        occurredAt: new Date('2026-08-21T10:00:00Z'),
      }),
      enrichment.enrichAfterProjection({
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: wa.id,
        communicationConversationId: canonical.id,
        occurredAt: new Date('2026-08-21T10:00:00Z'),
      }),
    ]);

    const refreshed = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(refreshed?.customerId).toBe(customer.id);
  });

  it('O: backfill dry-run performs no DB mutation', async () => {
    const phone = `4918400${Date.now()}`;
    const customer = await createCustomer(orgA, phone);
    const wa = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgA,
        contactPhone: `+${phone}`,
        contactPhoneNormalized: phone,
      },
    });
    const canonical = await createCanonicalConversation(orgA, wa.id);

    const dry = await backfill.backfillOrganization({
      organizationId: orgA,
      dryRun: true,
      unresolvedOnly: true,
    });

    expect(dry.scanned).toBeGreaterThanOrEqual(1);
    expect(dry.customerResolved).toBeGreaterThanOrEqual(1);
    const refreshed = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(refreshed?.customerId).toBeNull();
  });

  it('P: backfill apply is idempotent', async () => {
    const phone = `4918500${Date.now()}`;
    const customer = await createCustomer(orgA, phone);
    const wa = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgA,
        contactPhone: `+${phone}`,
        contactPhoneNormalized: phone,
      },
    });
    await createCanonicalConversation(orgA, wa.id);

    const first = await backfill.backfillOrganization({
      organizationId: orgA,
      dryRun: false,
      unresolvedOnly: true,
    });
    const second = await backfill.backfillOrganization({
      organizationId: orgA,
      dryRun: false,
      unresolvedOnly: true,
    });

    expect(first.applied).toBeGreaterThanOrEqual(1);
    expect(second.applied).toBe(0);

    const conversations = await prisma.communicationConversation.findMany({
      where: { organizationId: orgA, nativeConversationId: wa.id },
    });
    expect(conversations).toHaveLength(1);
    expect(conversations[0].customerId).toBe(customer.id);
  });

  it('projection still succeeds when enrichment path runs', async () => {
    const phone = `4918600${Date.now()}`;
    const customer = await createCustomer(orgA, phone);
    const waId = `wa-proj-${Date.now()}`;
    await prisma.whatsAppConversation.create({
      data: {
        id: waId,
        organizationId: orgA,
        contactPhone: `+${phone}`,
        contactPhoneNormalized: phone,
        customerId: customer.id,
      },
    });

    const input: NormalizedCommunicationInput = {
      envelope: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: waId,
        initialContext: { customerId: customer.id },
      },
      event: {
        eventType: CommunicationEventType.MESSAGE_RECEIVED,
        occurredAt: new Date('2026-08-21T10:00:00Z'),
        providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
        providerEventId: `evt-${Date.now()}`,
        idempotencyKey: buildCanonicalIdempotencyKey({
          organizationId: orgA,
          channel: CommunicationChannel.WHATSAPP,
          providerIdentity: CommunicationProviderIdentity.META_WHATSAPP,
          eventType: CommunicationEventType.MESSAGE_RECEIVED,
          nativeConversationId: waId,
          providerEventId: `evt-${Date.now()}`,
        }),
      },
    };

    const result = await projection.projectNormalizedInput(input);
    expect(result.conversationId).toBeTruthy();
    expect(result.eventCreated).toBe(true);
  });

  it('Q: native customer A + native booking for customer B does not propagate booking/vehicle/station', async () => {
    const customerA = await createCustomer(orgA, `4918700${Date.now()}`);
    const customerB = await createCustomer(orgA, `4918701${Date.now()}`);
    const vehicle = await createVehicle(orgA);
    const station = await createStation(orgA, `SQ-${Date.now()}`);
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgA,
        customerId: customerB.id,
        vehicleId: vehicle.id,
        pickupStationId: station.id,
        returnStationId: station.id,
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: new Date('2026-08-25T00:00:00Z'),
        status: BookingStatus.ACTIVE,
      },
    });
    const canonical = await createCanonicalConversation(orgA, `wa-q-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      nativeContext: { customerId: customerA.id, bookingId: booking.id },
      existingCanonical: {},
    });

    expect(result.patch.bookingId).toBeUndefined();
    expect(result.patch.vehicleId).toBeUndefined();
    expect(result.patch.stationId).toBeUndefined();
    expect(result.conflicts.some((c) => c.code === 'BOOKING_CUSTOMER_MISMATCH')).toBe(true);
  });

  it('R: existing customer A + existing booking for customer B quarantines propagation', async () => {
    const customerA = await createCustomer(orgA, `4918800${Date.now()}`);
    const customerB = await createCustomer(orgA, `4918801${Date.now()}`);
    const vehicle = await createVehicle(orgA);
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgA,
        customerId: customerB.id,
        vehicleId: vehicle.id,
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: new Date('2026-08-25T00:00:00Z'),
        status: BookingStatus.ACTIVE,
      },
    });
    const canonical = await createCanonicalConversation(orgA, `wa-r-${Date.now()}`, {
      customerId: customerA.id,
      bookingId: booking.id,
    });

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      existingCanonical: { customerId: customerA.id, bookingId: booking.id },
    });

    expect(result.patch.vehicleId).toBeUndefined();
    expect(result.conflicts.some((c) => c.code === 'BOOKING_CUSTOMER_MISMATCH')).toBe(true);
  });

  it('S: without trustworthy occurredAt, time-window booking inference does not run', async () => {
    const customer = await createCustomer(orgA, `4918900${Date.now()}`);
    const vehicle = await createVehicle(orgA);
    await prisma.booking.create({
      data: {
        organizationId: orgA,
        customerId: customer.id,
        vehicleId: vehicle.id,
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: new Date('2026-08-25T00:00:00Z'),
        status: BookingStatus.ACTIVE,
      },
    });
    const canonical = await createCanonicalConversation(orgA, `wa-s-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      existingCanonical: { customerId: customer.id },
    });

    expect(result.patch.bookingId).toBeUndefined();
  });

  it('T: historical occurredAt resolves booking via time window', async () => {
    const customer = await createCustomer(orgA, `4919000${Date.now()}`);
    const vehicle = await createVehicle(orgA);
    const booking = await prisma.booking.create({
      data: {
        organizationId: orgA,
        customerId: customer.id,
        vehicleId: vehicle.id,
        startDate: new Date('2026-08-20T00:00:00Z'),
        endDate: new Date('2026-08-25T00:00:00Z'),
        status: BookingStatus.CONFIRMED,
      },
    });
    const canonical = await createCanonicalConversation(orgA, `wa-t-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      occurredAt: new Date('2026-08-21T12:00:00Z'),
      existingCanonical: { customerId: customer.id },
    });

    expect(result.patch.bookingId).toBe(booking.id);
    expect(result.resolved.bookingId?.source).toBe('BOOKING_TIME_WINDOW');
  });

  it('U: duplicate normalized phone emits MULTIPLE_CUSTOMERS', async () => {
    const phone = `4919100${Date.now()}`;
    await createCustomer(orgA, phone);
    await createCustomer(orgA, phone);
    const canonical = await createCanonicalConversation(orgA, `wa-u-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phone },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBeUndefined();
    expect(result.conflicts.some((c) => c.code === 'MULTIPLE_CUSTOMERS')).toBe(true);
  });

  it('V: duplicate normalized email emits MULTIPLE_CUSTOMERS', async () => {
    const email = `dup${Date.now()}@example.com`;
    await createCustomer(orgA, `4919200${Date.now()}`, email);
    await createCustomer(orgA, `4919201${Date.now()}`, email);
    const canonical = await createCanonicalConversation(orgA, `wa-v-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedEmail: email },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBeUndefined();
    expect(result.conflicts.some((c) => c.code === 'MULTIPLE_CUSTOMERS')).toBe(true);
  });

  it('W: ambiguous phone + unique email stays unresolved', async () => {
    const phone = `4919300${Date.now()}`;
    const email = `unique${Date.now()}@example.com`;
    await createCustomer(orgA, phone);
    await createCustomer(orgA, phone);
    const emailCustomer = await createCustomer(orgA, `4919301${Date.now()}`, email);
    const canonical = await createCanonicalConversation(orgA, `wa-w-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phone, normalizedEmail: email },
      existingCanonical: {},
    });

    expect(result.patch.customerId).toBeUndefined();
    expect(result.patch.customerId).not.toBe(emailCustomer.id);
  });

  it('X: native relation wins over weaker phone in both scheduling orders', async () => {
    const phone = `4919400${Date.now()}`;
    const nativeCustomer = await createCustomer(orgA, `4919401${Date.now()}`);
    await createCustomer(orgA, phone);
    const canonical = await createCanonicalConversation(orgA, `wa-x-${Date.now()}`);

    const weakResolution = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phone },
      existingCanonical: {},
    });
    const nativeResolution = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      nativeContext: { customerId: nativeCustomer.id },
      existingCanonical: {},
    });

    await applier.applyResolvedContext({
      organizationId: orgA,
      communicationConversationId: canonical.id,
      patch: weakResolution.patch,
      resolved: weakResolution.resolved,
    });
    await applier.applyResolvedContext({
      organizationId: orgA,
      communicationConversationId: canonical.id,
      patch: nativeResolution.patch,
      resolved: nativeResolution.resolved,
    });

    const firstOrder = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(firstOrder?.customerId).toBe(nativeCustomer.id);

    const canonical2 = await createCanonicalConversation(orgA, `wa-x2-${Date.now()}`);
    await applier.applyResolvedContext({
      organizationId: orgA,
      communicationConversationId: canonical2.id,
      patch: nativeResolution.patch,
      resolved: nativeResolution.resolved,
    });
    await applier.applyResolvedContext({
      organizationId: orgA,
      communicationConversationId: canonical2.id,
      patch: weakResolution.patch,
      resolved: weakResolution.resolved,
    });
    const secondOrder = await prisma.communicationConversation.findUnique({ where: { id: canonical2.id } });
    expect(secondOrder?.customerId).toBe(nativeCustomer.id);
  });

  it('Y: weaker conflicting writers do not overwrite stronger incumbent', async () => {
    const phoneA = `4919500${Date.now()}`;
    const phoneB = `4919501${Date.now()}`;
    const customerA = await createCustomer(orgA, phoneA);
    const customerB = await createCustomer(orgA, phoneB);
    const canonical = await createCanonicalConversation(orgA, `wa-y-${Date.now()}`);

    const first = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phoneA },
      existingCanonical: {},
    });
    await applier.applyResolvedContext({
      organizationId: orgA,
      communicationConversationId: canonical.id,
      patch: first.patch,
      resolved: first.resolved,
    });

    const second = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phoneB },
      existingCanonical: { customerId: customerA.id },
    });
    await applier.applyResolvedContext({
      organizationId: orgA,
      communicationConversationId: canonical.id,
      patch: second.patch,
      resolved: second.resolved,
    });

    const refreshed = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(refreshed?.customerId).toBe(customerA.id);
    expect(refreshed?.customerId).not.toBe(customerB.id);
  });

  it('Z: assignedUser without org membership is not applied', async () => {
    const outsider = await prisma.user.create({
      data: {
        email: `outsider-${Date.now()}@example.com`,
        name: 'Outsider',
      },
    });
    const canonical = await createCanonicalConversation(orgA, `wa-z-${Date.now()}`);

    const result = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      nativeContext: { assignedUserId: outsider.id },
      existingCanonical: {},
    });

    expect(result.patch.assignedUserId).toBeUndefined();
    const apply = await applier.applyResolvedContext({
      organizationId: orgA,
      communicationConversationId: canonical.id,
      patch: result.patch,
      resolved: result.resolved,
    });
    expect(apply.fieldsUpdated).not.toContain('assignedUserId');
  });

  it('AA: unrelated metadata keys are preserved on apply', async () => {
    const phone = `4919600${Date.now()}`;
    const customer = await createCustomer(orgA, phone);
    const canonical = await prisma.communicationConversation.create({
      data: {
        organizationId: orgA,
        channel: CommunicationChannel.WHATSAPP,
        nativeConversationId: `wa-aa-${Date.now()}`,
        lastActivityAt: new Date('2026-08-21T10:00:00Z'),
        metadata: { inboxLabel: 'priority', nested: { flag: true } },
      },
    });

    const resolution = await resolver.resolve({
      organizationId: orgA,
      conversationId: canonical.id,
      channel: CommunicationChannel.WHATSAPP,
      identityHints: { normalizedPhone: phone },
      existingCanonical: {},
    });
    await applier.applyResolvedContext({
      organizationId: orgA,
      communicationConversationId: canonical.id,
      patch: resolution.patch,
      resolved: resolution.resolved,
    });

    const refreshed = await prisma.communicationConversation.findUnique({ where: { id: canonical.id } });
    expect(refreshed?.customerId).toBe(customer.id);
    expect((refreshed?.metadata as Record<string, unknown>)?.inboxLabel).toBe('priority');
    expect((refreshed?.metadata as { nested?: { flag?: boolean } })?.nested?.flag).toBe(true);
  });

  it('AB: backfill dry-run remains mutation-free', async () => {
    const phone = `4919700${Date.now()}`;
    await createCustomer(orgA, phone);
    const wa = await prisma.whatsAppConversation.create({
      data: {
        organizationId: orgA,
        contactPhone: `+${phone}`,
        contactPhoneNormalized: phone,
      },
    });
    await createCanonicalConversation(orgA, wa.id);

    const dry = await backfill.backfillOrganization({
      organizationId: orgA,
      dryRun: true,
      unresolvedOnly: true,
    });

    expect(dry.scanned).toBeGreaterThanOrEqual(1);
    const rows = await prisma.communicationConversation.findMany({
      where: { organizationId: orgA, nativeConversationId: wa.id },
    });
    expect(rows[0]?.customerId).toBeNull();
  });
});
