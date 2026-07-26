import { NotificationStatus } from '@prisma/client';
import { ACTIVE_NOTIFICATION_STATUSES, NotificationRepository } from '../notification.repository';

/** In-memory repository mock for producer ingest integration tests. */
export function createProducerIngestRepositoryMock(state: {
  notifications: Map<string, any>;
  activeByFingerprint: Map<string, string>;
  idSeq: { value: number };
}) {
  const { notifications, activeByFingerprint, idSeq } = state;

  return {
    findAnyActiveByFingerprint: jest.fn(async (orgId: string, fp: string) => {
      const id = activeByFingerprint.get(`${orgId}:${fp}`);
      return id ? notifications.get(id) : null;
    }),
    findLatestByFingerprint: jest.fn(async (orgId: string, fp: string) => {
      const matches = [...notifications.values()].filter(
        (n) => n.organizationId === orgId && n.fingerprint === fp,
      );
      return matches.sort((a, b) => b.lifecycleGeneration - a.lifecycleGeneration)[0] ?? null;
    }),
    findById: jest.fn(async (id: string, orgId: string) => {
      const row = notifications.get(id);
      return row?.organizationId === orgId ? row : null;
    }),
    lockAnyActiveByFingerprintForUpdate: jest.fn(async (orgId: string, fp: string) => {
      const id = activeByFingerprint.get(`${orgId}:${fp}`);
      return id ?? null;
    }),
    lockLatestByFingerprintForUpdate: jest.fn(async (orgId: string, fp: string) => {
      const matches = [...notifications.values()].filter(
        (n) => n.organizationId === orgId && n.fingerprint === fp,
      );
      const latest = matches.sort((a, b) => b.lifecycleGeneration - a.lifecycleGeneration)[0];
      return latest?.id ?? null;
    }),
    findByIdForUpdate: jest.fn(async (id: string, orgId: string) => {
      const row = notifications.get(id);
      return row?.organizationId === orgId ? row : null;
    }),
    findOccurrenceBySourceEventId: jest.fn().mockResolvedValue(null),
    listNotifications: jest.fn(async (filter: {
      organizationId: string;
      status?: NotificationStatus[];
      entityType?: string;
    }) => {
      return [...notifications.values()].filter((n) => {
        if (n.organizationId !== filter.organizationId) return false;
        if (filter.status?.length && !filter.status.includes(n.status)) return false;
        if (filter.entityType && n.entityType !== filter.entityType) return false;
        return true;
      });
    }),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    createNotification: jest.fn(async (data: any) => {
      const id = `ntf-${++idSeq.value}`;
      const row = {
        id,
        ...data,
        status: NotificationStatus.OPEN,
        occurrenceCount: 1,
        lifecycleGeneration: data.lifecycleGeneration ?? 1,
        version: 1,
        templateParams: data.templateParams ?? {},
        actionTarget: data.actionTarget ?? {},
        lastSeenAt: data.lastSeenAt ?? data.firstSeenAt ?? new Date(),
        firstSeenAt: data.firstSeenAt ?? data.lastSeenAt ?? new Date(),
        eventKind: data.eventKind ?? 'STATE',
      };
      notifications.set(id, row);
      activeByFingerprint.set(`${data.organizationId}:${data.fingerprint}`, id);
      return row;
    }),
    updateNotification: jest.fn(async (id: string, data: any, version?: number) => {
      const existing = notifications.get(id);
      if (!existing) throw new Error('not found');
      if (version != null && existing.version !== version) throw new Error('version conflict');
      const updated = { ...existing };
      for (const [k, v] of Object.entries(data)) {
        if (k === 'occurrenceCount' && v && typeof v === 'object' && 'increment' in (v as object)) {
          updated.occurrenceCount = (existing.occurrenceCount ?? 1) + (v as { increment: number }).increment;
        } else {
          (updated as any)[k] = v;
        }
      }
      updated.version = (existing.version ?? 1) + 1;
      notifications.set(id, updated);
      if (!ACTIVE_NOTIFICATION_STATUSES.includes(updated.status)) {
        activeByFingerprint.delete(`${existing.organizationId}:${existing.fingerprint}`);
      }
      return updated;
    }),
    createOccurrence: jest.fn(async () => ({ id: `occ-${++idSeq.value}` })),
  } as unknown as NotificationRepository;
}
