import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

try {
  const events = await p.dimoDeviceConnectionEvent.findMany({
    where: {
      observedAt: { gte: new Date('2026-07-19'), lt: new Date('2026-07-21') },
    },
    select: {
      id: true,
      eventType: true,
      observedAt: true,
      receivedAt: true,
      processedAt: true,
      vehicleId: true,
      tokenId: true,
    },
    orderBy: { observedAt: 'asc' },
  });
  console.log('JULY20_EVENTS', JSON.stringify(events, null, 2));

  for (const evt of events) {
    const episode = await p.deviceConnectionEpisode.findFirst({
      where: { openedByEventId: evt.id },
      select: {
        id: true,
        status: true,
        openedAt: true,
        resolvedAt: true,
        resolutionMethod: true,
      },
    });
    const audits = await p.deviceConnectionEpisodeLifecycleAudit.count({
      where: { episodeId: episode?.id ?? 'none' },
    });
    const inbox = await p.deviceConnectionWebhookInbox.findFirst({
      where: { domainEventId: evt.id },
      select: {
        id: true,
        processingStatus: true,
        processingAttempts: true,
        createdAt: true,
        processedAt: true,
      },
    });
    console.log(
      'EVENT_DETAIL',
      JSON.stringify({ eventId: evt.id, episode, lifecycleAuditCount: audits, inbox }),
    );
  }

  const inboxRows = await p.deviceConnectionWebhookInbox.findMany({
    where: {
      createdAt: { gte: new Date('2026-07-27'), lt: new Date('2026-08-09') },
    },
    select: {
      id: true,
      processingStatus: true,
      processingAttempts: true,
      createdAt: true,
      processedAt: true,
      eventType: true,
      domainEventId: true,
      providerEventId: true,
      tokenId: true,
      lastErrorCode: true,
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log('STUCK_INBOX', JSON.stringify(inboxRows, null, 2));

  const unprocessedEvents = await p.dimoDeviceConnectionEvent.count({
    where: { processedAt: null },
  });
  const receivedInbox = await p.deviceConnectionWebhookInbox.count({
    where: { processingStatus: 'RECEIVED', processingAttempts: 0 },
  });
  console.log(
    'COUNTS',
    JSON.stringify({ unprocessedEvents, receivedInboxAttemptsZero: receivedInbox }),
  );
} finally {
  await p.$disconnect();
}
