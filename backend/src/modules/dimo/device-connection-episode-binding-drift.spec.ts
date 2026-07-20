import {
  DeviceConnectionEpisodeLifecycleAction,
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeResolutionOutboxEventType,
  DeviceConnectionEpisodeStatus,
} from '@prisma/client';
import { DeviceConnectionEpisodeResolutionOutboxService } from './device-connection-episode-resolution/device-connection-episode-resolution-outbox.service';
import {
  DeviceConnectionEpisodeService,
  hashProviderDeviceId,
} from './device-connection-episode.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEHICLE_ID = 'veh-1';
const BINDING_A = 'binding-a';
const BINDING_B = 'binding-b';
const TOKEN_A = 42;
const TOKEN_B = 99;

type EpisodeRow = {
  id: string;
  organizationId: string;
  vehicleId: string;
  provider: string;
  deviceBindingId: string | null;
  providerDeviceIdHash: string | null;
  openedAt: Date;
  status: DeviceConnectionEpisodeStatus;
  resolvedAt: Date | null;
  resolutionMethod: DeviceConnectionEpisodeResolutionMethod | null;
  resolutionEvidenceAt: Date | null;
  reviewReasonCodes: string[];
  stateVersion: number;
};

function buildHarness() {
  const episodes: EpisodeRow[] = [];
  const lifecycleAudits: Array<Record<string, unknown>> = [];
  const outboxRows: Array<Record<string, unknown>> = [];
  let bindingId: string | null = BINDING_A;

  const applyEpisodeUpdateMany = async ({
    where,
    data,
  }: {
    where: Record<string, unknown>;
    data: Partial<EpisodeRow> & { stateVersion?: { increment: number } };
  }) => {
    let count = 0;
    for (let idx = 0; idx < episodes.length; idx++) {
      const episode = episodes[idx]!;
      const matches = Object.entries(where).every(
        ([key, value]) => (episode as Record<string, unknown>)[key] === value,
      );
      if (!matches) continue;
      episodes[idx] = {
        ...episode,
        ...data,
        stateVersion:
          data.stateVersion?.increment != null
            ? episode.stateVersion + data.stateVersion.increment
            : episode.stateVersion,
      };
      count++;
    }
    return { count };
  };

  const makeTxClient = () => ({
    deviceConnectionEpisode: {
      updateMany: jest.fn().mockImplementation(applyEpisodeUpdateMany),
    },
    deviceConnectionEpisodeLifecycleAudit: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        lifecycleAudits.push(data);
        return { id: `audit-${lifecycleAudits.length}` };
      }),
    },
    deviceConnectionEpisodeResolutionOutbox: {
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        outboxRows.push(data);
        return { id: `outbox-${outboxRows.length}` };
      }),
    },
  });

  const prisma = {
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({ hardwareType: 'LTE_R1' }),
    },
    vehicleDataSourceLink: {
      findFirst: jest.fn().mockImplementation(async () =>
        bindingId
          ? {
              id: bindingId,
              sourceType: 'DIMO',
              sourceSubtype: null,
              sourceReferenceId: 'ref',
              activatedAt: new Date('2026-01-01T00:00:00.000Z'),
              deactivatedAt: null,
            }
          : null,
      ),
    },
    deviceConnectionEpisode: {
      findMany: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        episodes.filter((episode) =>
          Object.entries(where).every(
            ([key, value]) => (episode as Record<string, unknown>)[key] === value,
          ),
        ),
      ),
      findFirst: jest.fn().mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
        episodes.find((episode) =>
          Object.entries(where).every(
            ([key, value]) => (episode as Record<string, unknown>)[key] === value,
          ),
        ) ?? null,
      ),
      updateMany: jest.fn().mockImplementation(applyEpisodeUpdateMany),
    },
    $transaction: jest.fn().mockImplementation(async (fn: (tx: ReturnType<typeof makeTxClient>) => Promise<unknown>) =>
      fn(makeTxClient()),
    ),
  };

  const outbox = new DeviceConnectionEpisodeResolutionOutboxService();
  const service = new DeviceConnectionEpisodeService(
    prisma as never,
    undefined,
    outbox,
  );

  return {
    service,
    episodes,
    lifecycleAudits,
    outboxRows,
    setBindingId: (id: string | null) => {
      bindingId = id;
    },
    pushEpisode: (row: Partial<EpisodeRow>) => {
      episodes.push({
        id: row.id ?? `ep-${episodes.length + 1}`,
        organizationId: row.organizationId ?? ORG_A,
        vehicleId: row.vehicleId ?? VEHICLE_ID,
        provider: row.provider ?? 'DIMO',
        deviceBindingId: row.deviceBindingId ?? BINDING_A,
        providerDeviceIdHash:
          row.providerDeviceIdHash ?? hashProviderDeviceId('DIMO', TOKEN_A),
        openedAt: row.openedAt ?? new Date('2026-07-08T17:21:19.000Z'),
        status: row.status ?? DeviceConnectionEpisodeStatus.OPEN,
        resolvedAt: row.resolvedAt ?? null,
        resolutionMethod: row.resolutionMethod ?? null,
        resolutionEvidenceAt: row.resolutionEvidenceAt ?? null,
        reviewReasonCodes: row.reviewReasonCodes ?? [],
        stateVersion: row.stateVersion ?? 1,
      });
    },
  };
}

describe('DeviceConnectionEpisodeService.reconcileBindingDrift', () => {
  it('supersedes open episode on current binding drift with evidence timestamp', async () => {
    const harness = buildHarness();
    harness.pushEpisode({
      id: 'ep-open',
      deviceBindingId: BINDING_A,
      providerDeviceIdHash: hashProviderDeviceId('DIMO', TOKEN_A),
    });
    harness.setBindingId(BINDING_B);

    const evidenceAt = new Date('2026-07-09T08:00:00.000Z');
    const receivedAt = new Date('2026-07-09T08:00:05.000Z');

    const result = await harness.service.reconcileBindingDrift({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      tokenId: TOKEN_B,
      hardwareType: 'LTE_R1',
      evidenceAt,
      receivedAt,
    });

    expect(result.outcome).toBe('superseded');
    expect(result.supersededEpisodeIds).toEqual(['ep-open']);
    expect(harness.episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.SUPERSEDED);
    expect(harness.episodes[0]?.resolutionMethod).toBe(
      DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
    );
    expect(harness.episodes[0]?.resolvedAt).toEqual(evidenceAt);
    expect(harness.episodes[0]?.resolutionEvidenceAt).toEqual(evidenceAt);
    expect(harness.lifecycleAudits[0]?.receivedAt).toEqual(receivedAt);
    expect(harness.lifecycleAudits[0]?.action).toBe(
      DeviceConnectionEpisodeLifecycleAction.BINDING_DRIFT_RECONCILED,
    );
  });

  it('supersedes audited historical episode by id without using processing now', async () => {
    const harness = buildHarness();
    const evidenceAt = new Date('2026-06-15T12:00:00.000Z');
    harness.pushEpisode({
      id: 'ep-historical',
      deviceBindingId: BINDING_A,
      providerDeviceIdHash: hashProviderDeviceId('DIMO', TOKEN_A),
      openedAt: new Date('2026-06-01T10:00:00.000Z'),
    });
    harness.setBindingId(BINDING_B);

    const result = await harness.service.reconcileBindingDrift({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      episodeId: 'ep-historical',
      tokenId: TOKEN_B,
      hardwareType: 'LTE_R1',
      evidenceAt,
      receivedAt: new Date('2026-06-15T12:00:10.000Z'),
      resolutionReferenceId: 'reconciliation:ep-historical:binding',
    });

    expect(result.outcome).toBe('superseded');
    expect(harness.episodes[0]?.resolvedAt).toEqual(evidenceAt);
    expect(harness.outboxRows).toHaveLength(2);
    expect(harness.outboxRows[0]?.eventType).toBe(
      DeviceConnectionEpisodeResolutionOutboxEventType.CONNECTIVITY_RUNTIME_RECALCULATE,
    );
    expect(harness.outboxRows[1]?.eventType).toBe(
      DeviceConnectionEpisodeResolutionOutboxEventType.DEVICE_ALERT_RESOLVE_PREPARED,
    );
    const alertPayload = harness.outboxRows[1]?.payload as Record<string, unknown>;
    expect(alertPayload.recoverySource).toBe('binding_change');
  });

  it('returns no_open_episode when nothing is open', async () => {
    const harness = buildHarness();
    const result = await harness.service.reconcileBindingDrift({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      tokenId: TOKEN_B,
      hardwareType: 'LTE_R1',
      evidenceAt: new Date('2026-07-09T08:00:00.000Z'),
    });
    expect(result.outcome).toBe('no_open_episode');
  });

  it('returns already_resolved for duplicate audited apply', async () => {
    const harness = buildHarness();
    harness.pushEpisode({
      id: 'ep-done',
      status: DeviceConnectionEpisodeStatus.SUPERSEDED,
      resolutionMethod: DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
      resolvedAt: new Date('2026-06-15T12:00:00.000Z'),
      resolutionEvidenceAt: new Date('2026-06-15T12:00:00.000Z'),
    });

    const result = await harness.service.reconcileBindingDrift({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      episodeId: 'ep-done',
      tokenId: TOKEN_B,
      hardwareType: 'LTE_R1',
      evidenceAt: new Date('2026-06-15T12:00:00.000Z'),
    });

    expect(result.outcome).toBe('already_resolved');
    expect(harness.outboxRows).toHaveLength(0);
  });

  it('supersedes multiple stale open episodes on one vehicle', async () => {
    const harness = buildHarness();
    harness.pushEpisode({
      id: 'ep-1',
      deviceBindingId: BINDING_A,
      providerDeviceIdHash: hashProviderDeviceId('DIMO', TOKEN_A),
    });
    harness.pushEpisode({
      id: 'ep-2',
      deviceBindingId: 'binding-legacy',
      providerDeviceIdHash: hashProviderDeviceId('DIMO', 7),
    });
    harness.setBindingId(BINDING_B);

    const result = await harness.service.reconcileBindingDrift({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      tokenId: TOKEN_B,
      hardwareType: 'LTE_R1',
      evidenceAt: new Date('2026-07-09T08:00:00.000Z'),
    });

    expect(result.supersededEpisodeIds).toHaveLength(2);
    expect(harness.episodes.every((e) => e.status === DeviceConnectionEpisodeStatus.SUPERSEDED)).toBe(
      true,
    );
  });

  it('scopes binding drift by organization (cross-tenant)', async () => {
    const harness = buildHarness();
    harness.pushEpisode({
      id: 'ep-org-a',
      organizationId: ORG_A,
    });

    const result = await harness.service.reconcileBindingDrift({
      organizationId: ORG_B,
      vehicleId: VEHICLE_ID,
      episodeId: 'ep-org-a',
      tokenId: TOKEN_B,
      hardwareType: 'LTE_R1',
      evidenceAt: new Date('2026-07-09T08:00:00.000Z'),
    });

    expect(result.outcome).toBe('no_open_episode');
    expect(harness.episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.OPEN);
  });

  it('handles parallel reconcile attempts idempotently', async () => {
    const harness = buildHarness();
    harness.pushEpisode({ id: 'ep-race' });
    harness.setBindingId(BINDING_B);

    const input = {
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      tokenId: TOKEN_B,
      hardwareType: 'LTE_R1',
      evidenceAt: new Date('2026-07-09T08:00:00.000Z'),
    };

    const [first, second] = await Promise.all([
      harness.service.reconcileBindingDrift(input),
      harness.service.reconcileBindingDrift(input),
    ]);

    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(['binding_unchanged', 'superseded']);
    expect(harness.episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.SUPERSEDED);
  });
});
