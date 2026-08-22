#!/usr/bin/env npx ts-node
/**
 * Disposable PostgreSQL scale + EXPLAIN validation for Communication read API (C7).
 * Usage: DATABASE_URL=... npx ts-node backend/scripts/test/communication-read-scale-explain.ts
 */
import { PrismaClient, CommunicationChannel, CommunicationEventType, CommunicationProviderIdentity, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(JSON.stringify({ status: 'failed', error: 'MissingEnvError' }));
  process.exit(1);
}

const CONVERSATION_COUNT = Number(process.env.C7_SCALE_CONVERSATIONS ?? 5000);
const EVENT_COUNT = Number(process.env.C7_SCALE_EVENTS ?? 50000);

async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.$connect();

  const org = await prisma.organization.create({
    data: {
      companyName: `C7 scale ${Date.now()}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
  });

  // Seeding disposable test data (org cleaned up before exit).
  const base = Date.now();
  const conversationIds: string[] = [];

  const batchSize = 500;
  for (let offset = 0; offset < CONVERSATION_COUNT; offset += batchSize) {
    const batch = Array.from({ length: Math.min(batchSize, CONVERSATION_COUNT - offset) }, (_, i) => {
      const idx = offset + i;
      const id = randomUUID();
      conversationIds.push(id);
      return {
        id,
        organizationId: org.id,
        channel: idx % 3 === 0 ? CommunicationChannel.WHATSAPP : idx % 3 === 1 ? CommunicationChannel.SMS : CommunicationChannel.VOICE,
        nativeConversationId: `scale-native-${idx}`,
        lastActivityAt: new Date(base - idx * 1000),
        unreadCount: idx % 5,
      };
    });
    await prisma.communicationConversation.createMany({ data: batch });
  }

  const eventsPerConversation = Math.ceil(EVENT_COUNT / conversationIds.length);
  let eventsCreated = 0;
  for (let c = 0; c < conversationIds.length && eventsCreated < EVENT_COUNT; c += 1) {
    const conversationId = conversationIds[c]!;
    const channel =
      c % 3 === 0 ? CommunicationChannel.WHATSAPP : c % 3 === 1 ? CommunicationChannel.SMS : CommunicationChannel.VOICE;
    const providerIdentity =
      channel === CommunicationChannel.SMS
        ? CommunicationProviderIdentity.SENT_DM
        : channel === CommunicationChannel.WHATSAPP
          ? CommunicationProviderIdentity.META_WHATSAPP
          : CommunicationProviderIdentity.TWILIO;
    const chunk = Math.min(eventsPerConversation, EVENT_COUNT - eventsCreated);
    const eventBatch: Prisma.CommunicationEventCreateManyInput[] = Array.from({ length: chunk }, (_, e) => ({
      organizationId: org.id,
      conversationId,
      channel,
      eventType: CommunicationEventType.MESSAGE_RECEIVED,
      occurredAt: new Date(base - c * 1000 - e * 10),
      providerIdentity,
    }));
    await prisma.communicationEvent.createMany({ data: eventBatch });
    eventsCreated += chunk;
  }

  await prisma.$executeRaw`ANALYZE communication_conversations`;
  await prisma.$executeRaw`ANALYZE communication_events`;

  const sampleConversationId = conversationIds[0]!;
  const midConversation = conversationIds[Math.floor(conversationIds.length / 2)]!;
  const midRow = await prisma.communicationConversation.findUnique({
    where: { id: midConversation },
    select: { lastActivityAt: true, id: true },
  });

  const plans: Record<string, unknown> = {};

  const inboxFirst = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT cc.id
     FROM communication_conversations cc
     WHERE cc.organization_id = $1
     ORDER BY cc.last_activity_at DESC, cc.id DESC
     LIMIT 26`,
    org.id,
  );
  plans.inboxFirstPage = inboxFirst.map((r) => r['QUERY PLAN']);

  const inboxCursor = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT cc.id
     FROM communication_conversations cc
     WHERE cc.organization_id = $1
       AND (
         cc.last_activity_at < $2::timestamptz
         OR (cc.last_activity_at = $2::timestamptz AND cc.id < $3::text)
       )
     ORDER BY cc.last_activity_at DESC, cc.id DESC
     LIMIT 26`,
    org.id,
    midRow!.lastActivityAt,
    midRow!.id,
  );
  plans.inboxCursorPage = inboxCursor.map((r) => r['QUERY PLAN']);

  const timeline = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT ce.id
     FROM communication_events ce
     WHERE ce.organization_id = $1
       AND ce.conversation_id = $2
     ORDER BY ce.occurred_at DESC, ce.id DESC
     LIMIT 51`,
    org.id,
    sampleConversationId,
  );
  plans.timeline = timeline.map((r) => r['QUERY PLAN']);

  const providerFilter = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT cc.id
     FROM communication_conversations cc
     WHERE cc.organization_id = $1
       AND EXISTS (
         SELECT 1 FROM communication_events ce
         WHERE ce.organization_id = $1
           AND ce.conversation_id = cc.id
           AND ce.provider_identity = 'SENT_DM'
       )
     ORDER BY cc.last_activity_at DESC, cc.id DESC
     LIMIT 26`,
    org.id,
  );
  plans.providerIdentityFilter = providerFilter.map((r) => r['QUERY PLAN']);

  const search = await prisma.$queryRawUnsafe<Array<{ 'QUERY PLAN': string }>>(
    `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
     SELECT cc.id
     FROM communication_conversations cc
     LEFT JOIN customers cu ON cu.id = cc.customer_id
     WHERE cc.organization_id = $1
       AND cu.organization_id = $1
       AND cu.first_name ILIKE '%scale%'
     ORDER BY cc.last_activity_at DESC, cc.id DESC
     LIMIT 26`,
    org.id,
  );
  plans.customerSearch = search.map((r) => r['QUERY PLAN']);

  console.log(
    JSON.stringify(
      {
        conversations: CONVERSATION_COUNT,
        events: eventsCreated,
        plans,
      },
      null,
      2,
    ),
  );

  await prisma.communicationEvent.deleteMany({ where: { organizationId: org.id } });
  await prisma.communicationConversation.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } });
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  const errorName =
    error instanceof Error && error.name ? error.name : 'UnknownError';

  console.error(
    JSON.stringify({
      status: 'failed',
      error: errorName,
    }),
  );

  process.exit(1);
});
