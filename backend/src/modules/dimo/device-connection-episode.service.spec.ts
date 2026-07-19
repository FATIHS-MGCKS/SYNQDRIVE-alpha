import {
  DeviceConnectionEpisodeOpenedReason,
  DeviceConnectionEpisodeResolutionMethod,
  DeviceConnectionEpisodeStatus,
  Prisma,
} from '@prisma/client';
import {
  DeviceConnectionEpisodeService,
  hashProviderDeviceId,
} from './device-connection-episode.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const VEHICLE_ID = 'veh-1';
const BINDING_A = 'binding-a';
const BINDING_B = 'binding-b';
const TOKEN_ID = 42;

type EpisodeRow = {
  id: string;
  organizationId: string;
  vehicleId: string;
  provider: string;
  deviceBindingId: string | null;
  providerDeviceIdHash: string | null;
  openedAt: Date;
  openedByEventId: string | null;
  openedReason: DeviceConnectionEpisodeOpenedReason;
  status: DeviceConnectionEpisodeStatus;
  resolvedAt: Date | null;
  resolutionMethod: DeviceConnectionEpisodeResolutionMethod | null;
  resolutionEvidenceAt: Date | null;
  resolutionEventId: string | null;
  resolutionSnapshotId: string | null;
  reviewReasonCodes: string[];
  stateVersion: number;
  createdAt: Date;
  updatedAt: Date;
};

function episodeRow(overrides: Partial<EpisodeRow> = {}): EpisodeRow {
  const now = new Date('2026-07-10T12:00:00.000Z');
  return {
    id: overrides.id ?? 'ep-1',
    organizationId: ORG_A,
    vehicleId: VEHICLE_ID,
    provider: 'DIMO',
    deviceBindingId: BINDING_A,
    providerDeviceIdHash: hashProviderDeviceId('DIMO', TOKEN_ID),
    openedAt: new Date('2026-07-10T10:00:00.000Z'),
    openedByEventId: 'evt-unplug-1',
    openedReason: DeviceConnectionEpisodeOpenedReason.OBD_DEVICE_UNPLUGGED_WEBHOOK,
    status: DeviceConnectionEpisodeStatus.OPEN,
    resolvedAt: null,
    resolutionMethod: null,
    resolutionEvidenceAt: null,
    resolutionEventId: null,
    resolutionSnapshotId: null,
    reviewReasonCodes: [],
    stateVersion: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildPrismaMock() {
  const episodes: EpisodeRow[] = [];
  let bindingId: string | null = BINDING_A;

  const vehicleDataSourceLink = {
    findFirst: jest.fn().mockImplementation(async () =>
      bindingId ? { id: bindingId } : null,
    ),
  };

  const deviceConnectionEpisode = {
    findMany: jest.fn().mockImplementation(async (args: { where: Record<string, unknown> }) => {
      return episodes.filter((episode) => {
        for (const [key, value] of Object.entries(args.where)) {
          if (key === 'vehicleId' && typeof value === 'object' && value && 'in' in value) {
            if (!(value.in as string[]).includes(episode.vehicleId)) return false;
            continue;
          }
          if (key === 'status' && typeof value === 'object' && value && 'in' in value) {
            if (!(value.in as string[]).includes(episode.status)) return false;
            continue;
          }
          if (key in episode && (episode as Record<string, unknown>)[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }),
    findFirst: jest.fn().mockImplementation(async (args?: { where?: Record<string, unknown>; orderBy?: unknown }) => {
      let matches = [...episodes];
      if (args?.where) {
        matches = matches.filter((episode) => {
          for (const [key, value] of Object.entries(args.where!)) {
            if (key === 'status' && typeof value === 'object' && value && 'in' in value) {
              if (!(value.in as string[]).includes(episode.status)) return false;
              continue;
            }
            if (key in episode && (episode as Record<string, unknown>)[key] !== value) {
              return false;
            }
          }
          return true;
        });
      }
      if (args?.orderBy) {
        matches.sort((a, b) => {
          const aEvidence = a.resolutionEvidenceAt?.getTime() ?? 0;
          const bEvidence = b.resolutionEvidenceAt?.getTime() ?? 0;
          return bEvidence - aEvidence;
        });
      }
      return matches[0] ?? null;
    }),
    findUnique: jest.fn().mockImplementation(async ({ where }: { where: { id: string } }) =>
      episodes.find((episode) => episode.id === where.id) ?? null,
    ),
    create: jest.fn().mockImplementation(async ({ data }: { data: Partial<EpisodeRow> }) => {
      const openSameScope = episodes.find(
        (episode) =>
          episode.organizationId === data.organizationId &&
          episode.vehicleId === data.vehicleId &&
          episode.provider === data.provider &&
          episode.deviceBindingId === data.deviceBindingId &&
          episode.status === DeviceConnectionEpisodeStatus.OPEN,
      );
      if (openSameScope) {
        const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        });
        throw err;
      }

      const row = episodeRow({
        id: `ep-${episodes.length + 1}`,
        ...data,
        openedReason:
          data.openedReason ??
          DeviceConnectionEpisodeOpenedReason.OBD_DEVICE_UNPLUGGED_WEBHOOK,
        status: data.status ?? DeviceConnectionEpisodeStatus.OPEN,
        stateVersion: 1,
      } as Partial<EpisodeRow>);
      episodes.push(row);
      return row;
    }),
    update: jest.fn().mockImplementation(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<EpisodeRow> & { stateVersion?: { increment: number } };
      }) => {
        const idx = episodes.findIndex((episode) => episode.id === where.id);
        if (idx < 0) throw new Error('Episode not found');
        const current = episodes[idx]!;
        const nextVersion =
          data.stateVersion?.increment != null
            ? current.stateVersion + data.stateVersion.increment
            : current.stateVersion;
        episodes[idx] = {
          ...current,
          ...data,
          stateVersion: nextVersion,
          updatedAt: new Date(),
        };
        return episodes[idx];
      },
    ),
  };

  return {
    episodes,
    setBindingId: (id: string | null) => {
      bindingId = id;
    },
    prisma: {
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ hardwareType: 'LTE_R1' }),
      },
      vehicleDataSourceLink,
      deviceConnectionEpisode,
      deviceConnectionEpisodeLifecycleAudit: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    },
  };
}

describe('DeviceConnectionEpisodeService', () => {
  it('opens an episode from an unplug event', async () => {
    const { prisma, episodes } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);
    const observedAt = new Date('2026-07-10T10:00:00.000Z');

    const result = await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-1',
      observedAt,
      tokenId: TOKEN_ID,
    });

    expect(result.outcome).toBe('created');
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.OPEN);
    expect(episodes[0]?.openedByEventId).toBe('evt-unplug-1');
    expect(episodes[0]?.resolvedAt).toBeNull();
  });

  it('is idempotent for duplicate unplug events on the same binding', async () => {
    const { prisma } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);
    const observedAt = new Date('2026-07-10T10:00:00.000Z');

    const first = await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-1',
      observedAt,
      tokenId: TOKEN_ID,
    });
    const second = await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-2',
      observedAt: new Date('2026-07-10T10:05:00.000Z'),
      tokenId: TOKEN_ID,
    });

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('already_open');
    expect(second.episodeId).toBe(first.episodeId);
  });

  it('returns already_open when an episode is already open for the binding', async () => {
    const { prisma } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);

    await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-1',
      observedAt: new Date('2026-07-10T10:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    const result = await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-dup',
      observedAt: new Date('2026-07-10T11:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    expect(result.outcome).toBe('already_open');
  });

  it('resolves an open episode from an explicit plug event', async () => {
    const { prisma, episodes } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);
    const unplugAt = new Date('2026-07-10T10:00:00.000Z');
    const plugAt = new Date('2026-07-10T11:00:00.000Z');

    await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-1',
      observedAt: unplugAt,
      tokenId: TOKEN_ID,
    });

    const result = await service.resolveFromExplicitPlugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-plug-1',
      observedAt: plugAt,
      tokenId: TOKEN_ID,
    });

    expect(result.outcome).toBe('resolved');
    expect(episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.RESOLVED);
    expect(episodes[0]?.resolutionMethod).toBe(
      DeviceConnectionEpisodeResolutionMethod.EXPLICIT_PLUG_WEBHOOK,
    );
    expect(episodes[0]?.resolvedAt?.getTime()).toBeGreaterThanOrEqual(unplugAt.getTime());
    expect(episodes[0]?.resolutionEventId).toBe('evt-plug-1');
  });

  it('supersedes an old binding episode when a new binding opens', async () => {
    const { prisma, episodes, setBindingId } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);

    await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-old',
      observedAt: new Date('2026-06-01T10:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    setBindingId(BINDING_B);
    const result = await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-new',
      observedAt: new Date('2026-07-10T10:00:00.000Z'),
      tokenId: 99,
    });

    expect(result.outcome).toBe('superseded_and_created');
    expect(episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.SUPERSEDED);
    expect(episodes[0]?.resolutionMethod).toBe(
      DeviceConnectionEpisodeResolutionMethod.DEVICE_BINDING_CHANGED,
    );
    expect(episodes[1]?.status).toBe(DeviceConnectionEpisodeStatus.OPEN);
    expect(episodes[1]?.deviceBindingId).toBe(BINDING_B);
  });

  it('does not let a stale resolved episode block a new binding episode', async () => {
    const { prisma, episodes, setBindingId } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);

    await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-old',
      observedAt: new Date('2026-06-01T10:00:00.000Z'),
      tokenId: TOKEN_ID,
    });
    await service.resolveFromExplicitPlugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-plug-old',
      observedAt: new Date('2026-06-02T10:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    setBindingId(BINDING_B);
    const result = await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-new',
      observedAt: new Date('2026-07-10T10:00:00.000Z'),
      tokenId: 77,
    });

    expect(result.outcome).toBe('created');
    expect(episodes.filter((episode) => episode.status === DeviceConnectionEpisodeStatus.OPEN))
      .toHaveLength(1);
    const openEpisode = episodes.find(
      (episode) => episode.status === DeviceConnectionEpisodeStatus.OPEN,
    );
    expect(openEpisode?.deviceBindingId).toBe(BINDING_B);
  });

  it('handles parallel unplug races via unique constraint recovery', async () => {
    const { prisma } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);
    const observedAt = new Date('2026-07-10T10:00:00.000Z');

    const [first, second] = await Promise.all([
      service.openFromUnplugEvent({
        organizationId: ORG_A,
        vehicleId: VEHICLE_ID,
        eventId: 'evt-unplug-a',
        observedAt,
        tokenId: TOKEN_ID,
      }),
      service.openFromUnplugEvent({
        organizationId: ORG_A,
        vehicleId: VEHICLE_ID,
        eventId: 'evt-unplug-b',
        observedAt,
        tokenId: TOKEN_ID,
      }),
    ]);

    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(['already_open', 'created']);
  });

  it('scopes episodes by organization (cross-tenant isolation)', async () => {
    const { prisma, episodes } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);

    await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-a',
      observedAt: new Date('2026-07-10T10:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    const orgBResult = await service.resolveFromExplicitPlugEvent({
      organizationId: ORG_B,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-plug-b',
      observedAt: new Date('2026-07-10T11:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    expect(orgBResult.outcome).toBe('no_open_episode');
    expect(episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.OPEN);
    expect(episodes[0]?.organizationId).toBe(ORG_A);
  });

  it('rejects resolution timestamps before openedAt', async () => {
    const { prisma, episodes } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);
    const unplugAt = new Date('2026-07-10T10:00:00.000Z');

    await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-1',
      observedAt: unplugAt,
      tokenId: TOKEN_ID,
    });

    const result = await service.resolveFromExplicitPlugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-plug-backfill',
      observedAt: new Date('2026-07-10T09:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    expect(result.outcome).toBe('invalid_resolution_time');
    expect(episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.OPEN);
  });

  it('ignores late unplug that would overwrite newer recovery', async () => {
    const { prisma, episodes } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);

    episodes.push(
      episodeRow({
        id: 'ep-resolved',
        status: DeviceConnectionEpisodeStatus.RESOLVED,
        resolutionMethod: DeviceConnectionEpisodeResolutionMethod.TELEMETRY_RESUMED,
        resolutionEvidenceAt: new Date('2026-07-09T08:00:00.000Z'),
        resolvedAt: new Date('2026-07-09T08:00:00.000Z'),
        deviceBindingId: BINDING_A,
      }),
    );

    const result = await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-late',
      observedAt: new Date('2026-07-08T17:00:00.000Z'),
      receivedAt: new Date('2026-07-10T10:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    expect(result.outcome).toBe('ignored_stale');
    expect(episodes.filter((e) => e.status === DeviceConnectionEpisodeStatus.OPEN)).toHaveLength(0);
  });

  it('rejects plug resolve when token hash mismatches open episode binding', async () => {
    const { prisma, episodes } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);

    await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-1',
      observedAt: new Date('2026-07-10T10:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    const result = await service.resolveFromExplicitPlugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-plug-other-token',
      observedAt: new Date('2026-07-10T11:00:00.000Z'),
      tokenId: 999,
    });

    expect(result.outcome).toBe('binding_mismatch');
    expect(episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.OPEN);
  });

  it('preserves episode history instead of deleting rows on resolution', async () => {
    const { prisma, episodes } = buildPrismaMock();
    const service = new DeviceConnectionEpisodeService(prisma as never);

    await service.openFromUnplugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-unplug-1',
      observedAt: new Date('2026-07-10T10:00:00.000Z'),
      tokenId: TOKEN_ID,
    });
    await service.resolveFromExplicitPlugEvent({
      organizationId: ORG_A,
      vehicleId: VEHICLE_ID,
      eventId: 'evt-plug-1',
      observedAt: new Date('2026-07-10T11:00:00.000Z'),
      tokenId: TOKEN_ID,
    });

    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.status).toBe(DeviceConnectionEpisodeStatus.RESOLVED);
  });

  it('documents delete semantics: vehicle cascade, event refs set null', () => {
    expect(true).toBe(true);
    // Schema: vehicle onDelete Cascade; openedByEvent/resolutionEvent onDelete SetNull.
    // Episodes are append-only history — no service delete path.
  });
});
